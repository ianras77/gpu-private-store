from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
import ipaddress
import json
import math
import os
import re
import time
import uuid
from pathlib import Path
from typing import Any, AsyncGenerator

import httpx
import yaml
from fastapi import FastAPI, HTTPException, Request, Response, UploadFile
from fastapi.responses import HTMLResponse, JSONResponse, StreamingResponse

APP_VERSION = "1.0.4"
CONFIG_PATH = Path(os.getenv("RASSYGPT_CONFIG_FILE", "/data/config/routes.yaml"))
DEFAULT_CONFIG_PATH = Path(os.getenv("RASSYGPT_DEFAULT_CONFIG_FILE", "/app/routes.default.yaml"))
if not DEFAULT_CONFIG_PATH.exists():
    DEFAULT_CONFIG_PATH = Path(__file__).with_name("routes.default.yaml")
REQUEST_TIMEOUT = httpx.Timeout(connect=10.0, read=900.0, write=60.0, pool=30.0)
CLIENT_LIMITS = httpx.Limits(max_connections=512, max_keepalive_connections=128, keepalive_expiry=30.0)


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.http = httpx.AsyncClient(timeout=REQUEST_TIMEOUT, limits=CLIENT_LIMITS)
    try:
        yield
    finally:
        client = getattr(app.state, "http", None)
        if client:
            await client.aclose()


app = FastAPI(title="RassyGPT", version=APP_VERSION, lifespan=lifespan)


def _http() -> httpx.AsyncClient:
    return app.state.http


def _env_expand(text: str) -> str:
    """Expand ${VAR} and ${VAR:-default} in route YAML."""
    pattern = re.compile(r"\$\{([A-Za-z_][A-Za-z0-9_]*)(?::-(.*?))?\}")

    def repl(match: re.Match[str]) -> str:
        key = match.group(1)
        default = match.group(2)
        value = os.getenv(key)
        if value is None or value == "":
            return default or ""
        return value

    return pattern.sub(repl, text)


def _ensure_config() -> None:
    CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    if not CONFIG_PATH.exists():
        CONFIG_PATH.write_text(DEFAULT_CONFIG_PATH.read_text(), encoding="utf-8")


def _load_config() -> dict[str, Any]:
    _ensure_config()
    raw = _env_expand(CONFIG_PATH.read_text(encoding="utf-8"))
    data = yaml.safe_load(raw) or {}
    data.setdefault("backends", {})
    data.setdefault("models", {})
    data.setdefault("aliases", {})
    data.setdefault("defaults", {})
    return data


def _truthy(value: Any) -> bool:
    return str(value).strip().lower() in {"1", "true", "yes", "y", "on"}


def _base_url(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip().rstrip("/")


def _auth_required(path: str) -> bool:
    if path in {"/", "/health", "/ready", "/favicon.ico"}:
        return False
    if path.startswith("/static"):
        return False
    if path.startswith("/generated-images/"):
        return False
    cfg = _load_config()
    return _truthy(os.getenv("RASSYGPT_REQUIRE_AUTH", cfg.get("server", {}).get("require_auth", True)))


def _internal_ollama_compat_allowed(request: Request) -> bool:
    if not _truthy(os.getenv("RASSYGPT_ALLOW_INTERNAL_OLLAMA_COMPAT", "false")):
        return False
    if not request.url.path.startswith("/api/"):
        return False
    if request.headers.get("x-forwarded-for"):
        return False

    host = request.client.host if request.client else ""
    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        return False
    cidrs = os.getenv("RASSYGPT_INTERNAL_COMPAT_CIDRS", "10.0.0.0/8,172.16.0.0/12")
    for cidr in cidrs.split(","):
        cidr = cidr.strip()
        if not cidr:
            continue
        try:
            if ip in ipaddress.ip_network(cidr, strict=False):
                return True
        except ValueError:
            continue
    return False


async def _require_key(request: Request) -> None:
    if not _auth_required(request.url.path):
        return
    if _internal_ollama_compat_allowed(request):
        return
    expected = os.getenv("RASSYGPT_API_KEY", "").strip()
    if not expected:
        raise HTTPException(status_code=503, detail="RASSYGPT_API_KEY is not configured.")
    auth = request.headers.get("Authorization", "")
    api_key = request.headers.get("X-API-Key", "")
    supplied = ""
    if auth.lower().startswith("bearer "):
        supplied = auth.split(" ", 1)[1].strip()
    elif api_key:
        supplied = api_key.strip()
    if supplied != expected:
        raise HTTPException(status_code=401, detail="Missing or invalid RassyGPT API key.")


@app.middleware("http")
async def auth_middleware(request: Request, call_next):
    try:
        await _require_key(request)
    except HTTPException as exc:
        return JSONResponse({"detail": exc.detail}, status_code=exc.status_code)
    return await call_next(request)


def _resolve_model(model_name: str | None, kind: str) -> tuple[str, dict[str, Any], dict[str, Any]]:
    cfg = _load_config()
    aliases = cfg.get("aliases", {})
    models = cfg.get("models", {})
    defaults = cfg.get("defaults", {})
    requested = model_name or defaults.get(kind)
    canonical = aliases.get(requested, requested)
    if canonical not in models:
        fallback = defaults.get(kind)
        if fallback and fallback in models:
            canonical = fallback
        else:
            raise HTTPException(status_code=404, detail=f"No RassyGPT model route for {requested!r} ({kind}).")
    model_cfg = models[canonical]
    backend_name = model_cfg.get("backend")
    backend_cfg = cfg.get("backends", {}).get(backend_name)
    if not backend_cfg:
        raise HTTPException(status_code=503, detail=f"Backend {backend_name!r} is not configured.")
    return canonical, model_cfg, backend_cfg


def _canonical_model_name(model_name: str | None, kind: str) -> str:
    cfg = _load_config()
    requested = model_name or cfg.get("defaults", {}).get(kind)
    return cfg.get("aliases", {}).get(requested, requested)


def _message_text(payload: dict[str, Any]) -> str:
    parts: list[str] = []
    for message in payload.get("messages", []):
        content = message.get("content") if isinstance(message, dict) else None
        if isinstance(content, str):
            parts.append(content)
        elif isinstance(content, list):
            for item in content:
                if isinstance(item, dict) and isinstance(item.get("text"), str):
                    parts.append(item["text"])
    prompt = payload.get("prompt")
    if isinstance(prompt, str):
        parts.append(prompt)
    return "\n".join(parts)


def _estimated_prompt_tokens(text: str) -> int:
    # A conservative routing estimate; exact tokenizer calls would add latency.
    return max(1, math.ceil(len(text) / 4))


def _smart_chat_target(payload: dict[str, Any]) -> str:
    text = _message_text(payload).lower()
    max_tokens = int(payload.get("max_tokens") or 0)
    estimated_total_tokens = _estimated_prompt_tokens(text) + (max_tokens or 512)
    if estimated_total_tokens > 14_000:
        return "rassy-coder"
    code_markers = {
        "code", "repo", "repository", "bug", "debug", "traceback", "stack trace", "function",
        "class ", "typescript", "javascript", "python", "rust", "golang", "docker", "compose",
        "sql", "api", "test", "pytest", "refactor", "implement", "compile", "lint", "codex",
    }
    quick_markers = {"summarize", "summary", "classify", "route", "rewrite briefly", "one sentence"}
    if any(marker in text for marker in code_markers):
        if len(text) < 1800 and max_tokens and max_tokens <= 512:
            return "rassy-coder-secondary"
        return "rassy-coder"
    if any(marker in text for marker in quick_markers) and len(text) < 2200:
        return "rassy-fast"
    return "rassy-general"


def _smart_chat_fallbacks(primary: str) -> list[str]:
    fallback_order = {
        "rassy-coder-secondary": ["rassy-coder", "rassy-fast", "rassy-general"],
        "rassy-coder": ["rassy-fast", "rassy-general"],
        "rassy-fast": ["rassy-general"],
        "rassy-general": ["rassy-fast"],
    }
    candidates = [primary, *fallback_order.get(primary, [])]
    output: list[str] = []
    for candidate in candidates:
        if candidate not in output:
            output.append(candidate)
    return output


def _compat_chat_model(model_name: str | None) -> str:
    canonical = _canonical_model_name(model_name, "chat")
    if canonical in {"rassy-general", "rassy-coder", "rassy-coder-secondary", "rassy-fast", "rassy-smart"}:
        return canonical
    return "rassy-smart"


def _compat_embed_model(model_name: str | None) -> str:
    canonical = _canonical_model_name(model_name, "embeddings")
    if canonical == "rassy-embed":
        return canonical
    return "rassy-embed"


def _backend_url(backend: dict[str, Any], path: str) -> str:
    base = _base_url(backend.get("base_url"))
    if not base:
        raise HTTPException(status_code=503, detail="Backend URL is not configured for this route.")
    return f"{base}/{path.lstrip('/')}"


def _forward_headers(request: Request) -> dict[str, str]:
    allow = {"content-type", "accept", "accept-encoding"}
    headers = {k: v for k, v in request.headers.items() if k.lower() in allow}
    headers.setdefault("accept", "application/json")
    return headers


def _upstream_unavailable_response(exc: Exception) -> JSONResponse:
    return JSONResponse(
        {
            "error": "upstream_unavailable",
            "detail": exc.__class__.__name__,
        },
        status_code=503,
    )


async def _post_json(url: str, payload: dict[str, Any], request: Request, response_model: str | None = None) -> Response:
    try:
        upstream = await _http().post(url, json=payload, headers=_forward_headers(request))
    except httpx.HTTPError as exc:
        return _upstream_unavailable_response(exc)
    content = upstream.content
    media_type = upstream.headers.get("content-type", "application/json")
    if response_model and "application/json" in media_type:
        try:
            data = upstream.json()
            if isinstance(data, dict) and data.get("model"):
                data["model"] = response_model
                content = json.dumps(data).encode("utf-8")
        except Exception:
            pass
    return Response(
        content=content,
        status_code=upstream.status_code,
        media_type=media_type,
    )


async def _post_openai_model(
    request: Request,
    kind: str,
    upstream_path: str,
    payload: dict[str, Any],
    model_name: str,
) -> tuple[str, Response]:
    canonical, model_cfg, backend = _resolve_model(model_name, kind)
    upstream_payload = dict(payload)
    upstream_payload["model"] = model_cfg.get("upstream_model", canonical)
    url = _backend_url(backend, upstream_path)
    response = await _post_json(url, upstream_payload, request, response_model=canonical)
    return canonical, response


async def _stream_json(url: str, payload: dict[str, Any], request: Request, response_model: str | None = None) -> StreamingResponse:
    def normalize_line(line: str) -> bytes:
        if not line.startswith("data: "):
            return f"{line}\n".encode("utf-8")
        data = line[6:].strip()
        if data == "[DONE]":
            return b"data: [DONE]\n"
        try:
            chunk = json.loads(data)
        except json.JSONDecodeError:
            return f"{line}\n".encode("utf-8")
        if response_model and isinstance(chunk, dict) and chunk.get("model"):
            chunk["model"] = response_model
        for choice in chunk.get("choices", []):
            if not isinstance(choice, dict):
                continue
            delta = choice.get("delta")
            if isinstance(delta, dict) and delta.get("content") is None:
                delta.pop("content", None)
        return f"data: {json.dumps(chunk, separators=(',', ':'))}\n".encode("utf-8")

    async def generator() -> AsyncGenerator[bytes, None]:
        async with _http().stream("POST", url, json=payload, headers=_forward_headers(request)) as upstream:
            async for line in upstream.aiter_lines():
                if line == "":
                    yield b"\n"
                else:
                    yield normalize_line(line)

    return StreamingResponse(generator(), media_type="text/event-stream")


def _apply_chat_compat_defaults(payload: dict[str, Any]) -> None:
    """Prefer visible answer text for generic OpenAI-compatible clients."""
    template_kwargs = payload.get("chat_template_kwargs")
    if not isinstance(template_kwargs, dict):
        template_kwargs = {}
    else:
        template_kwargs = dict(template_kwargs)
    template_kwargs.setdefault("enable_thinking", False)
    payload["chat_template_kwargs"] = template_kwargs


async def _proxy_openai_json(request: Request, kind: str, upstream_path: str) -> Response:
    try:
        payload = await request.json()
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Request body must be JSON.")
    payload = dict(payload)
    if kind in {"chat", "completions"}:
        _apply_chat_compat_defaults(payload)
    smart_requested = kind in {"chat", "completions"} and _canonical_model_name(payload.get("model"), kind) == "rassy-smart"
    if smart_requested:
        payload["model"] = _smart_chat_target(payload)
    if smart_requested and not payload.get("stream"):
        last_response: Response | None = None
        for candidate in _smart_chat_fallbacks(payload["model"]):
            canonical, response = await _post_openai_model(request, kind, upstream_path, payload, candidate)
            last_response = response
            if response.status_code < 500:
                return response
        return last_response or JSONResponse({"error": "upstream_unavailable"}, status_code=503)
    canonical, model_cfg, backend = _resolve_model(payload.get("model"), kind)
    payload["model"] = model_cfg.get("upstream_model", canonical)
    url = _backend_url(backend, upstream_path)
    if payload.get("stream") and kind in {"chat", "completions"}:
        return await _stream_json(url, payload, request, response_model=canonical)
    return await _post_json(url, payload, request, response_model=canonical)


@app.get("/health")
async def health() -> dict[str, Any]:
    return {"status": "ok", "service": "RassyGPT", "version": APP_VERSION, "time": int(time.time())}


@app.get("/ready")
async def ready() -> dict[str, Any]:
    cfg = _load_config()
    statuses = await _backend_statuses()
    required = _required_backends(cfg)
    ok = all(statuses.get(name, {}).get("healthy") for name in required)
    return {"ready": ok, "required": required, "backends": statuses}


def _required_backends(cfg: dict[str, Any]) -> list[str]:
    configured = cfg.get("server", {}).get("required_backends")
    if isinstance(configured, list):
        return [str(item).strip() for item in configured if str(item).strip()]
    if isinstance(configured, str):
        return [item.strip() for item in configured.split(",") if item.strip()]
    return ["general", "coder", "coder_secondary", "fast", "embed", "rerank"]


@app.get("/", response_class=HTMLResponse)
async def root() -> str:
    cfg = _load_config()
    rows = []
    for name, m in cfg.get("models", {}).items():
        rows.append(f"<tr><td><code>{name}</code></td><td>{m.get('kind','')}</td><td>{m.get('backend','')}</td><td>{m.get('description','')}</td></tr>")
    return f"""
<!doctype html>
<html lang=\"en\">
<head>
  <meta charset=\"utf-8\" />
  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />
  <title>RassyGPT</title>
  <style>
    body {{ margin:0; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif; background:#09090b; color:#f8fafc; }}
    .wrap {{ max-width:1120px; margin:0 auto; padding:42px 24px; }}
    .hero {{ border:1px solid #27272a; border-radius:28px; padding:32px; background:linear-gradient(135deg,#111827,#18181b 55%,#312e81); box-shadow:0 24px 80px rgba(0,0,0,.35); }}
    h1 {{ font-size:44px; margin:0 0 8px; letter-spacing:-.04em; }}
    p {{ color:#cbd5e1; line-height:1.65; }}
    code {{ color:#fde68a; }}
    .pill {{ display:inline-block; border:1px solid #3f3f46; border-radius:999px; padding:6px 12px; color:#fde68a; background:#18181b; }}
    table {{ width:100%; border-collapse:collapse; margin-top:24px; overflow:hidden; border-radius:18px; }}
    th,td {{ border-bottom:1px solid #27272a; padding:14px; text-align:left; vertical-align:top; }}
    th {{ color:#fef3c7; background:#18181b; }}
    .cards {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:14px; margin-top:22px; }}
    .card {{ border:1px solid #27272a; border-radius:20px; padding:18px; background:#111113; }}
    a {{ color:#93c5fd; }}
  </style>
</head>
<body>
  <div class=\"wrap\">
    <div class=\"hero\">
      <span class=\"pill\">RassyGPT {APP_VERSION}</span>
      <h1>One local OpenAI-style gateway. Many GPU engines.</h1>
      <p>Use <code>/v1/chat/completions</code>, <code>/v1/embeddings</code>, <code>/v1/rerank</code>, <code>/v1/images/generations</code>, and <code>/v1/audio/*</code>. Behind the curtain, RassyGPT routes to the right model lane for Ian's hardware.</p>
      <div class=\"cards\">
        <div class=\"card\"><strong>Base URL</strong><br><code>/v1</code></div>
        <div class=\"card\"><strong>Auth</strong><br><code>Authorization: Bearer &lt;RASSYGPT_API_KEY&gt;</code></div>
        <div class=\"card\"><strong>Status</strong><br><a href=\"/admin/status\">/admin/status</a></div>
      </div>
    </div>
    <table>
      <thead><tr><th>Model</th><th>Kind</th><th>Backend</th><th>Description</th></tr></thead>
      <tbody>{''.join(rows)}</tbody>
    </table>
  </div>
</body>
</html>
"""


@app.get("/v1/models")
async def models() -> dict[str, Any]:
    cfg = _load_config()
    data = []
    for name, m in cfg.get("models", {}).items():
        data.append({
            "id": name,
            "object": "model",
            "created": 1778284800,
            "owned_by": "rassygpt",
            "kind": m.get("kind"),
            "description": m.get("description", ""),
        })
    known_models = cfg.get("models", {})
    for alias, target in sorted(cfg.get("aliases", {}).items()):
        canonical = cfg.get("aliases", {}).get(target, target)
        model = known_models.get(canonical)
        if not model:
            continue
        data.append({
            "id": alias,
            "object": "model",
            "created": 1778284800,
            "owned_by": "rassygpt",
            "kind": model.get("kind"),
            "description": f"Alias for {canonical}",
        })
    return {"object": "list", "data": data}


@app.post("/v1/chat/completions")
async def chat_completions(request: Request) -> Response:
    return await _proxy_openai_json(request, "chat", "/v1/chat/completions")


@app.post("/v1/completions")
async def completions(request: Request) -> Response:
    return await _proxy_openai_json(request, "completions", "/v1/completions")


@app.post("/v1/embeddings")
async def embeddings(request: Request) -> Response:
    return await _proxy_openai_json(request, "embeddings", "/v1/embeddings")


@app.get("/api/tags")
async def ollama_tags() -> dict[str, Any]:
    now = "2026-05-09T00:00:00Z"
    cfg = _load_config()
    models = [{"name": name, "model": name} for name in cfg.get("models", {})]
    models.extend({"name": alias, "model": target} for alias, target in cfg.get("aliases", {}).items())
    seen: set[str] = set()
    deduped = []
    for model in models:
        name = model["name"]
        if name in seen:
            continue
        seen.add(name)
        deduped.append(model)
    return {
        "models": [
            {
                **model,
                "modified_at": now,
                "size": 0,
                "digest": "",
                "details": {"format": "rassygpt", "family": "rassygpt", "parameter_size": "", "quantization_level": ""},
            }
            for model in deduped
        ]
    }


def _ollama_chat_payload(payload: dict[str, Any]) -> tuple[str, dict[str, Any]]:
    messages = payload.get("messages")
    if not isinstance(messages, list):
        prompt = payload.get("prompt")
        messages = [{"role": "user", "content": str(prompt or "")}]
    model = _compat_chat_model(payload.get("model"))
    options = payload.get("options") if isinstance(payload.get("options"), dict) else {}
    max_tokens = options.get("num_predict") or payload.get("max_tokens") or 512
    chat_payload = {
        "model": model,
        "messages": messages,
        "stream": False,
        "temperature": options.get("temperature", payload.get("temperature", 0.2)),
        "max_tokens": max(1, int(max_tokens)),
    }
    for ollama_key, openai_key in {"top_p": "top_p", "seed": "seed"}.items():
        if ollama_key in options:
            chat_payload[openai_key] = options[ollama_key]
        elif ollama_key in payload:
            chat_payload[openai_key] = payload[ollama_key]
    stop = options.get("stop") or payload.get("stop")
    if stop:
        chat_payload["stop"] = stop
    if payload.get("format") == "json":
        chat_payload["response_format"] = {"type": "json_object"}
    if _canonical_model_name(model, "chat") == "rassy-smart":
        chat_payload["model"] = _smart_chat_target(chat_payload)
    return model, chat_payload


def _extract_json_content(content: str) -> str:
    stripped = content.strip()
    if stripped.startswith("```"):
        stripped = re.sub(r"^```(?:json)?", "", stripped, flags=re.IGNORECASE).strip()
        stripped = re.sub(r"```$", "", stripped).strip()
    start = stripped.find("{")
    end = stripped.rfind("}")
    if start >= 0 and end > start:
        candidate = stripped[start:end + 1].strip()
        try:
            json.loads(candidate)
            return candidate
        except json.JSONDecodeError:
            pass
    return stripped


async def _run_ollama_chat(request: Request, payload: dict[str, Any]) -> tuple[str, str]:
    model, chat_payload = _ollama_chat_payload(payload)
    canonical, model_cfg, backend = _resolve_model(chat_payload["model"], "chat")
    chat_payload["model"] = model_cfg.get("upstream_model", canonical)
    try:
        upstream = await _http().post(_backend_url(backend, "/v1/chat/completions"), json=chat_payload, headers=_forward_headers(request))
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=503, detail=f"Chat backend unavailable: {exc.__class__.__name__}") from exc
    if upstream.status_code >= 400:
        raise HTTPException(status_code=upstream.status_code, detail=upstream.text)
    data = upstream.json()
    content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
    if payload.get("format") == "json":
        content = _extract_json_content(content)
    return model, content


def _ollama_chat_json(model: str, content: str, requested_model: str | None) -> dict[str, Any]:
    response = {
        "model": requested_model or model,
        "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "message": {"role": "assistant", "content": content},
        "response": content,
        "done": True,
    }
    return response


@app.post("/api/chat")
async def ollama_chat(request: Request) -> Response:
    try:
        payload = await request.json()
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Request body must be JSON.")
    model, content = await _run_ollama_chat(request, payload)
    response = _ollama_chat_json(model, content, payload.get("model"))
    if payload.get("stream"):
        return StreamingResponse(iter([json.dumps(response).encode("utf-8") + b"\n"]), media_type="application/x-ndjson")
    return JSONResponse(response)


@app.post("/api/generate")
async def ollama_generate(request: Request) -> Response:
    try:
        payload = await request.json()
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Request body must be JSON.")
    model, content = await _run_ollama_chat(request, payload)
    response = {
        "model": payload.get("model") or model,
        "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "response": content,
        "done": True,
    }
    if payload.get("stream"):
        return StreamingResponse(iter([json.dumps(response).encode("utf-8") + b"\n"]), media_type="application/x-ndjson")
    return JSONResponse(response)


async def _ollama_embedding_response(request: Request, *, multi_key: str) -> Response:
    try:
        payload = await request.json()
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Request body must be JSON.")
    raw_input = payload.get("input")
    if raw_input is None:
        raw_input = payload.get("prompt")
    inputs = raw_input if isinstance(raw_input, list) else [str(raw_input or "")]
    model = _compat_embed_model(payload.get("model"))
    _, model_cfg, backend = _resolve_model(model, "embeddings")
    upstream_payload = {"model": model_cfg.get("upstream_model", model), "input": inputs}
    try:
        upstream = await _http().post(_backend_url(backend, "/v1/embeddings"), json=upstream_payload, headers=_forward_headers(request))
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=503, detail=f"Embedding backend unavailable: {exc.__class__.__name__}") from exc
    if upstream.status_code >= 400:
        return Response(content=upstream.content, status_code=upstream.status_code, media_type=upstream.headers.get("content-type", "application/json"))
    data = upstream.json()
    vectors = [row.get("embedding", []) for row in data.get("data", [])]
    if multi_key == "embeddings":
        return JSONResponse({"model": payload.get("model") or model, "embeddings": vectors})
    return JSONResponse({"embedding": vectors[0] if vectors else []})


@app.post("/api/embeddings")
async def ollama_embeddings(request: Request) -> Response:
    return await _ollama_embedding_response(request, multi_key="embedding")


@app.post("/api/embed")
async def ollama_embed(request: Request) -> Response:
    return await _ollama_embedding_response(request, multi_key="embeddings")


async def _embedding_vectors(texts: list[str], request: Request) -> list[list[float]]:
    cfg = _load_config()
    model_name = cfg.get("defaults", {}).get("embeddings", "rassy-embed")
    _, model_cfg, backend = _resolve_model(model_name, "embeddings")
    payload = {"model": model_cfg.get("upstream_model", model_name), "input": texts}
    url = _backend_url(backend, "/v1/embeddings")
    try:
        resp = await _http().post(url, json=payload, headers=_forward_headers(request))
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=503, detail=f"Embedding backend unavailable: {exc.__class__.__name__}") from exc
    resp.raise_for_status()
    data = resp.json()
    return [item["embedding"] for item in data.get("data", [])]


def _cosine(a: list[float], b: list[float]) -> float:
    dot = sum(x*y for x, y in zip(a, b))
    na = math.sqrt(sum(x*x for x in a))
    nb = math.sqrt(sum(y*y for y in b))
    if na == 0 or nb == 0:
        return 0.0
    return dot / (na * nb)


@app.post("/v1/rerank")
async def rerank(request: Request) -> Response:
    try:
        payload = await request.json()
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Request body must be JSON.")

    query = payload.get("query") or payload.get("text")
    docs = payload.get("documents") or payload.get("docs") or []
    top_n = payload.get("top_n") or payload.get("top_k")
    if not isinstance(query, str) or not isinstance(docs, list) or not docs:
        raise HTTPException(status_code=400, detail="Expected JSON with query:string and documents:list.")
    doc_texts = [d if isinstance(d, str) else (d.get("text") or json.dumps(d)) for d in docs]

    # Prefer a true reranker backend if configured and responsive.
    try:
        _, model_cfg, backend = _resolve_model(payload.get("model") or "rassy-rerank", "rerank")
        base = _base_url(backend.get("base_url"))
        if base:
            path = backend.get("path", "/v1/rerank")
            forward_payload = dict(payload)
            forward_payload["model"] = model_cfg.get("upstream_model", "rassy-rerank")
            upstream = await _http().post(f"{base}/{str(path).lstrip('/')}", json=forward_payload, headers=_forward_headers(request), timeout=httpx.Timeout(10.0, read=120.0, write=60.0, pool=30.0))
            if upstream.status_code < 500:
                return Response(content=upstream.content, status_code=upstream.status_code, media_type=upstream.headers.get("content-type", "application/json"))
    except Exception:
        # Fall through to deterministic embedding-cosine fallback.
        pass

    try:
        vectors = await _embedding_vectors([query] + doc_texts, request)
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Rerank backend unavailable and embedding fallback failed: {exc}")
    qv, dvs = vectors[0], vectors[1:]
    scored = sorted(
        [{"index": i, "relevance_score": float(_cosine(qv, dv)), "document": {"text": doc_texts[i]}} for i, dv in enumerate(dvs)],
        key=lambda x: x["relevance_score"],
        reverse=True,
    )
    if top_n:
        scored = scored[: int(top_n)]
    return JSONResponse({
        "id": f"rerank-{uuid.uuid4().hex[:12]}",
        "object": "list",
        "model": "rassy-rerank-fallback",
        "results": scored,
    })


async def _forward_raw(request: Request, backend_kind: str, path: str) -> Response:
    cfg = _load_config()
    model = cfg.get("defaults", {}).get(backend_kind)
    canonical, model_cfg, backend = _resolve_model(model, backend_kind)
    url = _backend_url(backend, path)
    body = await request.body()
    headers = _forward_headers(request)
    if headers.get("content-type", "").startswith("application/json"):
        try:
            payload = json.loads(body or b"{}")
            if isinstance(payload, dict):
                if backend_kind == "audio" and path.endswith("/speech"):
                    payload["model"] = model_cfg.get("tts_model") or model_cfg.get("upstream_model", canonical)
                    if payload["model"] == "qwen3-tts-cpp":
                        payload.pop("voice", None)
                else:
                    payload["model"] = model_cfg.get("upstream_model", canonical)
                body = json.dumps(payload).encode("utf-8")
        except Exception:
            pass
    try:
        upstream = await _http().request(request.method, url, content=body, headers=headers)
    except httpx.HTTPError as exc:
        return _upstream_unavailable_response(exc)
    content = upstream.content
    media_type = upstream.headers.get("content-type", "application/json")
    if backend_kind == "images" and upstream.status_code == 200 and "application/json" in media_type:
        try:
            payload = json.loads(content)
            public_base = str(request.base_url).rstrip("/")
            upstream_base = _base_url(backend.get("base_url"))
            for item in payload.get("data", []):
                image_url = item.get("url")
                if isinstance(image_url, str) and upstream_base and image_url.startswith(upstream_base):
                    item["url"] = public_base + image_url[len(upstream_base):]
            content = json.dumps(payload).encode("utf-8")
        except Exception:
            pass
    return Response(content=content, status_code=upstream.status_code, media_type=media_type)


@app.post("/v1/images/generations")
async def images_generations(request: Request) -> Response:
    return await _forward_raw(request, "images", "/v1/images/generations")


@app.get("/generated-images/{asset_path:path}")
async def generated_image(asset_path: str) -> Response:
    cfg = _load_config()
    backend = cfg.get("backends", {}).get("image", {})
    url = f"{_base_url(backend.get('base_url'))}/generated-images/{asset_path}"
    try:
        upstream = await _http().get(url)
    except httpx.HTTPError as exc:
        return _upstream_unavailable_response(exc)
    return Response(content=upstream.content, status_code=upstream.status_code, media_type=upstream.headers.get("content-type", "application/octet-stream"))


@app.post("/v1/audio/transcriptions")
async def audio_transcriptions(request: Request) -> Response:
    return await _forward_raw(request, "audio", "/v1/audio/transcriptions")


@app.post("/v1/audio/translations")
async def audio_translations(request: Request) -> Response:
    return await _forward_raw(request, "audio", "/v1/audio/translations")


@app.post("/v1/audio/speech")
async def audio_speech(request: Request) -> Response:
    return await _forward_raw(request, "audio", "/v1/audio/speech")


async def _check_backend(name: str, backend: dict[str, Any]) -> dict[str, Any]:
    base = _base_url(backend.get("base_url"))
    if not base:
        return {"healthy": False, "configured": False, "message": "no base_url"}
    path = backend.get("health_path", "/health")
    url = f"{base}/{str(path).lstrip('/')}"
    started = time.perf_counter()
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(3.0)) as client:
            resp = await client.get(url)
        ms = round((time.perf_counter() - started) * 1000, 1)
        return {"healthy": 200 <= resp.status_code < 300, "configured": True, "status_code": resp.status_code, "latency_ms": ms, "url": base}
    except Exception as exc:
        return {"healthy": False, "configured": True, "message": str(exc), "url": base}


async def _backend_statuses() -> dict[str, Any]:
    cfg = _load_config()
    tasks = {name: _check_backend(name, backend) for name, backend in cfg.get("backends", {}).items()}
    results = await asyncio.gather(*tasks.values(), return_exceptions=True)
    output: dict[str, Any] = {}
    for name, result in zip(tasks.keys(), results):
        if isinstance(result, Exception):
            output[name] = {"healthy": False, "message": str(result)}
        else:
            output[name] = result
    return output


@app.get("/admin/status")
async def admin_status() -> dict[str, Any]:
    cfg = _load_config()
    return {
        "service": "RassyGPT",
        "version": APP_VERSION,
        "models": cfg.get("models", {}),
        "aliases": cfg.get("aliases", {}),
        "backends": await _backend_statuses(),
        "qdrant": await _qdrant_status(),
    }


async def _qdrant_status() -> dict[str, Any]:
    cfg = _load_config()
    url = str(cfg.get("server", {}).get("qdrant_url") or os.getenv("RASSYGPT_QDRANT_URL", "")).rstrip("/")
    if not url:
        return {"configured": False, "healthy": False}
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(3.0)) as client:
            resp = await client.get(url)
        return {"configured": True, "healthy": resp.status_code < 500, "status_code": resp.status_code, "url": url}
    except Exception as exc:
        return {"configured": True, "healthy": False, "url": url, "message": str(exc)}


@app.get("/connectors/qdrant/health")
async def qdrant_health() -> dict[str, Any]:
    return await _qdrant_status()


@app.get("/metrics")
async def metrics() -> Response:
    statuses = await _backend_statuses()
    lines = ["# HELP rassygpt_backend_healthy Backend health status", "# TYPE rassygpt_backend_healthy gauge"]
    for name, status in statuses.items():
        value = 1 if status.get("healthy") else 0
        lines.append(f'rassygpt_backend_healthy{{backend="{name}"}} {value}')
    return Response("\n".join(lines) + "\n", media_type="text/plain")
