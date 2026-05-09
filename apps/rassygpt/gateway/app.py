from __future__ import annotations

import asyncio
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

APP_VERSION = "1.0.0"
CONFIG_PATH = Path(os.getenv("RASSYGPT_CONFIG_FILE", "/data/config/routes.yaml"))
DEFAULT_CONFIG_PATH = Path(os.getenv("RASSYGPT_DEFAULT_CONFIG_FILE", "/app/routes.default.yaml"))
if not DEFAULT_CONFIG_PATH.exists():
    DEFAULT_CONFIG_PATH = Path(__file__).with_name("routes.default.yaml")
REQUEST_TIMEOUT = httpx.Timeout(connect=10.0, read=900.0, write=60.0, pool=30.0)
CLIENT_LIMITS = httpx.Limits(max_connections=512, max_keepalive_connections=128, keepalive_expiry=30.0)

app = FastAPI(title="RassyGPT", version=APP_VERSION)


@app.on_event("startup")
async def startup() -> None:
    app.state.http = httpx.AsyncClient(timeout=REQUEST_TIMEOUT, limits=CLIENT_LIMITS)


@app.on_event("shutdown")
async def shutdown() -> None:
    client = getattr(app.state, "http", None)
    if client:
        await client.aclose()


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


async def _require_key(request: Request) -> None:
    if not _auth_required(request.url.path):
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


def _smart_chat_target(payload: dict[str, Any]) -> str:
    text = _message_text(payload).lower()
    max_tokens = int(payload.get("max_tokens") or 0)
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


async def _post_json(url: str, payload: dict[str, Any], request: Request) -> Response:
    upstream = await _http().post(url, json=payload, headers=_forward_headers(request))
    return Response(
        content=upstream.content,
        status_code=upstream.status_code,
        media_type=upstream.headers.get("content-type", "application/json"),
    )


async def _stream_json(url: str, payload: dict[str, Any], request: Request) -> StreamingResponse:
    async def generator() -> AsyncGenerator[bytes, None]:
        async with _http().stream("POST", url, json=payload, headers=_forward_headers(request)) as upstream:
            async for chunk in upstream.aiter_bytes():
                yield chunk

    return StreamingResponse(generator(), media_type="text/event-stream")


async def _proxy_openai_json(request: Request, kind: str, upstream_path: str) -> Response:
    try:
        payload = await request.json()
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Request body must be JSON.")
    if kind in {"chat", "completions"} and _canonical_model_name(payload.get("model"), kind) == "rassy-smart":
        payload["model"] = _smart_chat_target(payload)
    canonical, model_cfg, backend = _resolve_model(payload.get("model"), kind)
    payload = dict(payload)
    payload["model"] = model_cfg.get("upstream_model", canonical)
    url = _backend_url(backend, upstream_path)
    if payload.get("stream") and kind in {"chat", "completions"}:
        return await _stream_json(url, payload, request)
    return await _post_json(url, payload, request)


@app.get("/health")
async def health() -> dict[str, Any]:
    return {"status": "ok", "service": "RassyGPT", "version": APP_VERSION, "time": int(time.time())}


@app.get("/ready")
async def ready() -> dict[str, Any]:
    statuses = await _backend_statuses()
    required = ["general", "coder", "coder_secondary", "fast", "embed", "rerank", "image", "audio"]
    ok = all(statuses.get(name, {}).get("healthy") for name in required)
    return {"ready": ok, "required": required, "backends": statuses}


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


async def _embedding_vectors(texts: list[str], request: Request) -> list[list[float]]:
    cfg = _load_config()
    model_name = cfg.get("defaults", {}).get("embeddings", "rassy-embed")
    _, model_cfg, backend = _resolve_model(model_name, "embeddings")
    payload = {"model": model_cfg.get("upstream_model", model_name), "input": texts}
    url = _backend_url(backend, "/v1/embeddings")
    resp = await _http().post(url, json=payload, headers=_forward_headers(request))
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
    upstream = await _http().request(request.method, url, content=body, headers=headers)
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
    upstream = await _http().get(url)
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
