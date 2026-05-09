import os
import re
import uuid
import json
import math
import hashlib
import asyncio
from typing import Optional, Any, Dict, List, Tuple, Set
from urllib.parse import urlencode

import httpx
import asyncpg
import redis.asyncio as redis
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import JSONResponse, StreamingResponse, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from starlette.middleware.trustedhost import TrustedHostMiddleware

# --- Environment config -----------------------------------------------------

OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11435")
CODE_OLLAMA_BASE_URL = os.getenv("CODE_OLLAMA_BASE_URL", "http://127.0.0.1:11436")

EMBEDDING_OLLAMA_BASE_URL = os.getenv(
    "EMBEDDING_OLLAMA_BASE_URL",
    "http://127.0.0.1:11437"
)
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "nomic-embed-text")
EMBEDDING_UPSTREAM_MODEL = os.getenv("EMBEDDING_UPSTREAM_MODEL", EMBEDDING_MODEL)
EMBEDDING_DIMENSIONS_RAW = os.getenv("EMBEDDING_DIMENSIONS", "").strip()
GENERAL_MODEL_NAME = os.getenv("GENERAL_MODEL_NAME", "gpt-oss:20b")
GENERAL_MODEL_NAMES_RAW = os.getenv("GENERAL_MODEL_NAMES") or GENERAL_MODEL_NAME
DEFAULT_CHAT_MODEL = os.getenv("DEFAULT_CHAT_MODEL") or GENERAL_MODEL_NAME
EMBEDDING_MODEL_NAMES_RAW = os.getenv("EMBEDDING_MODEL_NAMES") or EMBEDDING_MODEL
CODE_MODEL_NAMES_RAW = os.getenv("CODE_MODEL_NAMES", "qwen2.5-coder:7b")
CODE_MODEL_PREFIXES_RAW = os.getenv(
    "CODE_MODEL_PREFIXES",
    "qwen2.5-coder,qwen-coder,deepseek-coder,codegemma,starcoder,coder",
)
PUBLIC_MODEL_NAMES_RAW = os.getenv("PUBLIC_MODEL_NAMES", "")

REDIS_URL = os.getenv("REDIS_URL", "")
REDIS_TTL_SEC = int(os.getenv("REDIS_TTL_SEC", "3600"))
OLLAMA_HTTP_TIMEOUT_SEC = float(os.getenv("OLLAMA_HTTP_TIMEOUT_SEC", "900"))
HEALTH_TAGS_TIMEOUT_SEC = float(os.getenv("HEALTH_TAGS_TIMEOUT_SEC", "5"))
HEALTH_EMBED_TIMEOUT_SEC = float(os.getenv("HEALTH_EMBED_TIMEOUT_SEC", "5"))
HEALTH_RERANK_TIMEOUT_SEC = float(os.getenv("HEALTH_RERANK_TIMEOUT_SEC", "5"))
HTTP_MAX_CONNECTIONS = int(os.getenv("HTTP_MAX_CONNECTIONS", "200"))
HTTP_MAX_KEEPALIVE_CONNECTIONS = int(os.getenv("HTTP_MAX_KEEPALIVE_CONNECTIONS", "50"))
HTTP_KEEPALIVE_EXPIRY_SEC = float(os.getenv("HTTP_KEEPALIVE_EXPIRY_SEC", "30"))

PGHOST = os.getenv("PGHOST", "")
PGPORT = os.getenv("PGPORT", "5432")
PGDATABASE = os.getenv("PGDATABASE", "")
PGUSER = os.getenv("PGUSER", "")
PGPASSWORD = os.getenv("PGPASSWORD", "")

QDRANT_URL = os.getenv("QDRANT_URL", "")
QDRANT_COLLECTION = os.getenv("QDRANT_COLLECTION", "")
QDRANT_VECTOR_SIZE = int(os.getenv("QDRANT_VECTOR_SIZE", "768"))
QDRANT_DISTANCE = os.getenv("QDRANT_DISTANCE", "Cosine")

RERANK_OLLAMA_BASE_URL = os.getenv("RERANK_OLLAMA_BASE_URL", EMBEDDING_OLLAMA_BASE_URL)
RERANK_MODEL = os.getenv("RERANK_MODEL", EMBEDDING_MODEL)
RERANK_STRATEGY = os.getenv("RERANK_STRATEGY", "embedding")  # "embedding" or "generate"
RERANK_GENERATE_CONCURRENCY = max(1, int(os.getenv("RERANK_GENERATE_CONCURRENCY", "2")))
RERANK_TOP_N_DEFAULT = int(os.getenv("RERANK_TOP_N_DEFAULT", "5"))
RERANK_MAX_DOCS = int(os.getenv("RERANK_MAX_DOCS", "50"))
RERANK_MAX_QUERY_CHARS = int(os.getenv("RERANK_MAX_QUERY_CHARS", "20000"))
RERANK_MAX_TOTAL_CHARS = int(os.getenv("RERANK_MAX_TOTAL_CHARS", "200000"))
RERANK_INSTRUCTION = os.getenv(
    "RERANK_INSTRUCTION",
    "Given a web search query, retrieve relevant passages that answer the query",
)
KNOWLEDGE_TOP_K_DEFAULT = int(os.getenv("KNOWLEDGE_TOP_K_DEFAULT", "5"))
KNOWLEDGE_TEXT_MAX_CHARS = int(os.getenv("KNOWLEDGE_TEXT_MAX_CHARS", "4000"))
KNOWLEDGE_MAX_INPUTS = int(os.getenv("KNOWLEDGE_MAX_INPUTS", "128"))
KNOWLEDGE_QUERY_MAX_CHARS = int(os.getenv("KNOWLEDGE_QUERY_MAX_CHARS", "20000"))
KNOWLEDGE_MAX_TOTAL_CHARS = int(os.getenv("KNOWLEDGE_MAX_TOTAL_CHARS", "500000"))

try:
    EMBEDDING_DIMENSIONS = int(EMBEDDING_DIMENSIONS_RAW) if EMBEDDING_DIMENSIONS_RAW else 0
except ValueError:
    EMBEDDING_DIMENSIONS = 0


def _env_flag(name: str, default: str = "0", aliases: Optional[List[str]] = None) -> bool:
    aliases = aliases or []
    raw = os.getenv(name)
    if raw is not None:
        for alias in aliases:
            alias_raw = os.getenv(alias)
            if alias_raw is None or alias_raw == raw:
                continue
            if raw == default and alias_raw != default:
                print(
                    f"[ENV] conflicting values for {name} and {alias}; "
                    f"using non-default {alias}={alias_raw}"
                )
                return alias_raw == "1"
            print(f"[ENV] conflicting values for {name} and {alias}; using {name}={raw}")
        return raw == "1"

    for alias in aliases:
        alias_raw = os.getenv(alias)
        if alias_raw is not None:
            return alias_raw == "1"
    return default == "1"


LOG_REQUEST_BODIES = os.getenv("LOG_REQUEST_BODIES", "0") == "1"
MAX_BODY_LOG_CHARS = int(os.getenv("MAX_BODY_LOG_CHARS", "8192"))
REQUEST_BODY_LIMIT_BYTES = int(os.getenv("REQUEST_BODY_LIMIT_BYTES", "10485760"))
GZIP_MINIMUM_SIZE = int(os.getenv("GZIP_MINIMUM_SIZE", "1024"))
TRUSTED_HOSTS_RAW = os.getenv("TRUSTED_HOSTS", "127.0.0.1,localhost,::1")
STRICT_MODEL_ALLOWLIST = _env_flag("STRICT_MODEL_ALLOWLIST", default="1", aliases=["MODEL_LOCKDOWN"])
ALLOW_CODE_MODEL_PREFIX_ROUTING = os.getenv("ALLOW_CODE_MODEL_PREFIX_ROUTING", "0") == "1"
EXPOSE_EMBED_MODELS_IN_CATALOG = os.getenv("EXPOSE_EMBED_MODELS_IN_CATALOG", "0") == "1"
EXPOSE_RERANK_MODELS_IN_CATALOG = _env_flag(
    "EXPOSE_RERANK_MODELS_IN_CATALOG",
    default="0",
    aliases=["EXPOSE_RERANK_MODEL_IN_CATALOG"],
)
ALLOW_ADMIN_PASSTHROUGH = os.getenv("ALLOW_ADMIN_PASSTHROUGH", "0") == "1"
AUTO_INDEX_EMBED_REQUESTS = os.getenv("AUTO_INDEX_EMBED_REQUESTS", "0") == "1"
QDRANT_UPSERT_WAIT = os.getenv("QDRANT_UPSERT_WAIT", "0") == "1"
REDACT_SENSITIVE_LOGS = os.getenv("REDACT_SENSITIVE_LOGS", "1") == "1"
CHAT_MAX_MESSAGES = int(os.getenv("CHAT_MAX_MESSAGES", "64"))
CHAT_MAX_TOTAL_CHARS = int(os.getenv("CHAT_MAX_TOTAL_CHARS", "500000"))
GENERATE_MAX_PROMPT_CHARS = int(os.getenv("GENERATE_MAX_PROMPT_CHARS", "400000"))
GENERATE_MAX_SUFFIX_CHARS = int(os.getenv("GENERATE_MAX_SUFFIX_CHARS", "60000"))
SHOW_MAX_NAME_CHARS = int(os.getenv("SHOW_MAX_NAME_CHARS", "512"))
MAX_NUM_CTX = int(os.getenv("MAX_NUM_CTX", "81920"))
EMBED_CHUNK_CHARS = int(os.getenv("EMBED_CHUNK_CHARS", "12000"))
EMBED_CHUNK_MIN_CHARS = int(os.getenv("EMBED_CHUNK_MIN_CHARS", "600"))
EMBED_CHUNK_OVERLAP = int(os.getenv("EMBED_CHUNK_OVERLAP", "300"))
EMBED_PRECHUNK_THRESHOLD_CHARS = int(os.getenv("EMBED_PRECHUNK_THRESHOLD_CHARS", "12000"))
EMBED_FALLBACK_MODEL_ON_404 = os.getenv("EMBED_FALLBACK_MODEL_ON_404", "1") == "1"
EMBED_UPSTREAM_MAX_RETRIES = int(os.getenv("EMBED_UPSTREAM_MAX_RETRIES", "3"))
EMBED_UPSTREAM_RETRY_BACKOFF_MS = int(os.getenv("EMBED_UPSTREAM_RETRY_BACKOFF_MS", "250"))

app = FastAPI(title="Ollama-compatible Swiss-army Proxy")

# CORS for browser-based frontends
cors_origins_raw = os.getenv("CORS_ORIGINS", "")
cors_origins = [o.strip() for o in cors_origins_raw.split(",") if o.strip()]
if cors_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=cors_origins,
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["*"],
    )
trusted_hosts = [h.strip() for h in TRUSTED_HOSTS_RAW.split(",") if h.strip()]
if trusted_hosts and "*" not in trusted_hosts:
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=trusted_hosts)
app.add_middleware(GZipMiddleware, minimum_size=max(0, GZIP_MINIMUM_SIZE))

# Global clients/pools
ollama_client: Optional[httpx.AsyncClient] = None
code_client: Optional[httpx.AsyncClient] = None
embed_client: Optional[httpx.AsyncClient] = None
qdrant_client: Optional[httpx.AsyncClient] = None
rerank_client: Optional[httpx.AsyncClient] = None
redis_client: Optional[redis.Redis] = None
pg_pool: Optional[asyncpg.Pool] = None
CODE_MODEL_PREFIXES = [
    prefix.strip().lower()
    for prefix in CODE_MODEL_PREFIXES_RAW.split(",")
    if prefix.strip()
]
DIRECT_CHANNEL_INFERENCE_PATHS = {
    "/api/show",
    "/api/chat",
    "/api/generate",
    "/api/embed",
    "/api/embeddings",
    "/v1/chat/completions",
    "/v1/completions",
    "/v1/embeddings",
}
DIRECT_CHANNEL_STREAMING_PATHS = {
    "/api/chat",
    "/api/generate",
    "/v1/chat/completions",
    "/v1/completions",
}
DIRECT_CHANNEL_ALWAYS_STREAM_PATHS = {
    "/api/create",
    "/api/pull",
    "/api/push",
}

HOP_BY_HOP_HEADERS = {
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade",
    "content-length",
}
SENSITIVE_LOG_KEYS = {
    "content",
    "data",
    "documents",
    "embedding",
    "embeddings",
    "input",
    "message",
    "messages",
    "prompt",
    "response",
    "text",
    "texts",
}


@app.middleware("http")
async def enforce_request_size_limit(request: Request, call_next):
    content_length = request.headers.get("content-length")
    if content_length:
        try:
            if int(content_length) > REQUEST_BODY_LIMIT_BYTES:
                return JSONResponse(
                    content={
                        "error": "request_too_large",
                        "limit_bytes": REQUEST_BODY_LIMIT_BYTES,
                    },
                    status_code=413,
                )
        except ValueError:
            return JSONResponse(content={"error": "invalid_content_length"}, status_code=400)

    response = await call_next(request)
    response.headers.setdefault("cache-control", "no-store")
    response.headers.setdefault("x-content-type-options", "nosniff")
    return response


# --- Startup / shutdown -----------------------------------------------------

async def ensure_qdrant_collection():
    if not (qdrant_client and QDRANT_COLLECTION):
        return
    path = f"/collections/{QDRANT_COLLECTION}"
    try:
        resp = await qdrant_client.get(path)
        if resp.status_code == 200:
            return
        if resp.status_code != 404:
            resp.raise_for_status()

        create_body = {
            "vectors": {
                "size": QDRANT_VECTOR_SIZE,
                "distance": QDRANT_DISTANCE,
            }
        }
        create_resp = await qdrant_client.put(path, json=create_body)
        create_resp.raise_for_status()
        print(f"[QDRANT] Created collection {QDRANT_COLLECTION}")
    except Exception as e:
        print(f"[QDRANT] ensure collection failed: {e}")

@app.on_event("startup")
async def on_startup():
    global ollama_client, code_client, embed_client, qdrant_client, rerank_client, redis_client, pg_pool

    limits = httpx.Limits(
        max_connections=max(1, HTTP_MAX_CONNECTIONS),
        max_keepalive_connections=max(1, HTTP_MAX_KEEPALIVE_CONNECTIONS),
        keepalive_expiry=max(1.0, HTTP_KEEPALIVE_EXPIRY_SEC),
    )

    ollama_client = httpx.AsyncClient(
        base_url=OLLAMA_BASE_URL,
        timeout=OLLAMA_HTTP_TIMEOUT_SEC,
        limits=limits,
        follow_redirects=False,
        trust_env=False,
    )
    code_client = httpx.AsyncClient(
        base_url=CODE_OLLAMA_BASE_URL,
        timeout=OLLAMA_HTTP_TIMEOUT_SEC,
        limits=limits,
        follow_redirects=False,
        trust_env=False,
    )
    embed_client = httpx.AsyncClient(
        base_url=EMBEDDING_OLLAMA_BASE_URL,
        timeout=OLLAMA_HTTP_TIMEOUT_SEC,
        limits=limits,
        follow_redirects=False,
        trust_env=False,
    )
    rerank_client = httpx.AsyncClient(
        base_url=RERANK_OLLAMA_BASE_URL,
        timeout=OLLAMA_HTTP_TIMEOUT_SEC,
        limits=limits,
        follow_redirects=False,
        trust_env=False,
    )
    if QDRANT_URL:
        qdrant_client = httpx.AsyncClient(
            base_url=QDRANT_URL,
            timeout=30,
            limits=limits,
            follow_redirects=False,
            trust_env=False,
        )
        await ensure_qdrant_collection()
    if REDIS_URL:
        redis_client = redis.from_url(REDIS_URL, decode_responses=True)

    # Postgres pool (optional)
    if PGHOST and PGDATABASE and PGUSER:
        dsn = (
            f"postgresql://{PGUSER}:{PGPASSWORD}@{PGHOST}:{PGPORT}/{PGDATABASE}"
        )
        try:
            pg_pool = await asyncpg.create_pool(dsn=dsn, min_size=1, max_size=5)
            async with pg_pool.acquire() as conn:
                await conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS api_logs (
                        id UUID PRIMARY KEY,
                        created_at TIMESTAMPTZ DEFAULT now(),
                        route TEXT,
                        method TEXT,
                        model TEXT,
                        status INT,
                        request JSONB,
                        response JSONB
                    );
                    """
                )
            print("[PG] Connected and ensured api_logs exists")
        except Exception as e:
            print(f"[PG] Failed to init Postgres logging: {e}")


@app.on_event("shutdown")
async def on_shutdown():
    global ollama_client, code_client, embed_client, qdrant_client, rerank_client, redis_client, pg_pool
    if ollama_client:
        await ollama_client.aclose()
    if code_client:
        await code_client.aclose()
    if embed_client:
        await embed_client.aclose()
    if qdrant_client:
        await qdrant_client.aclose()
    if rerank_client:
        await rerank_client.aclose()
    if redis_client:
        await redis_client.aclose()
    if pg_pool:
        await pg_pool.close()


# --- Helpers ----------------------------------------------------------------

async def maybe_log_body(label: str, data: str):
    if not LOG_REQUEST_BODIES:
        return
    trimmed = (data[:MAX_BODY_LOG_CHARS] + "…") if len(data) > MAX_BODY_LOG_CHARS else data
    print(f"[{label}] {trimmed}")


def _client_label(client: Optional[httpx.AsyncClient]) -> str:
    if client is None:
        return "uninitialized"
    if client is ollama_client:
        return "general"
    if client is code_client:
        return "code"
    if client is embed_client:
        return "embed"
    if client is rerank_client:
        return "rerank"
    base_url = getattr(client, "base_url", None)
    return str(base_url).rstrip("/") if base_url else "unknown"


def _client_base_url(client: Optional[httpx.AsyncClient]) -> str:
    if client is None:
        return ""
    base_url = getattr(client, "base_url", None)
    return str(base_url).rstrip("/") if base_url else ""


def _raise_upstream_proxy_error(route: str, client: Optional[httpx.AsyncClient], exc: Exception):
    error = "upstream_timeout" if isinstance(exc, httpx.TimeoutException) else "upstream_transport_error"
    status_code = 504 if error == "upstream_timeout" else 502
    raise HTTPException(
        status_code=status_code,
        detail={
            "error": error,
            "route": route,
            "upstream": _client_label(client),
            "detail": str(exc),
        },
    ) from exc


async def _request_upstream(
    client: Optional[httpx.AsyncClient],
    method: str,
    path: str,
    *,
    route: str,
    json_body: Optional[Dict[str, Any]] = None,
    content: Optional[bytes] = None,
    headers: Optional[Dict[str, str]] = None,
    timeout: Optional[float] = None,
) -> httpx.Response:
    if client is None:
        raise HTTPException(
            status_code=503,
            detail={
                "error": "upstream_not_initialized",
                "route": route,
                "upstream": "uninitialized",
            },
        )
    try:
        return await client.request(
            method,
            path,
            json=json_body,
            content=content,
            headers=headers,
            timeout=timeout,
        )
    except httpx.TimeoutException as exc:
        _raise_upstream_proxy_error(route, client, exc)
    except httpx.HTTPError as exc:
        _raise_upstream_proxy_error(route, client, exc)


async def _send_upstream_stream(
    client: Optional[httpx.AsyncClient],
    method: str,
    path: str,
    *,
    route: str,
    json_body: Optional[Dict[str, Any]] = None,
    content: Optional[bytes] = None,
    headers: Optional[Dict[str, str]] = None,
) -> httpx.Response:
    if client is None:
        raise HTTPException(
            status_code=503,
            detail={
                "error": "upstream_not_initialized",
                "route": route,
                "upstream": "uninitialized",
            },
        )
    request = client.build_request(
        method,
        path,
        json=json_body,
        content=content,
        headers=headers,
    )
    try:
        return await client.send(request, stream=True)
    except httpx.TimeoutException as exc:
        _raise_upstream_proxy_error(route, client, exc)
    except httpx.HTTPError as exc:
        _raise_upstream_proxy_error(route, client, exc)


async def log_to_postgres(
    route: str,
    method: str,
    model: Optional[str],
    status: int,
    request_json: Optional[Dict[str, Any]],
    response_json: Optional[Dict[str, Any]],
):
    if not pg_pool:
        return
    safe_request_json = _redact_for_log(request_json)
    safe_response_json = _redact_for_log(response_json)
    try:
        async with pg_pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO api_logs (id, route, method, model, status, request, response)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                """,
                uuid.uuid4(),
                route,
                method,
                model,
                status,
                json.dumps(safe_request_json) if safe_request_json is not None else None,
                json.dumps(safe_response_json) if safe_response_json is not None else None,
            )
    except Exception as e:
        print(f"[PG] log_to_postgres failed: {e}")


async def qdrant_upsert_points(points: List[Dict[str, Any]], wait: Optional[bool] = None) -> bool:
    if not (qdrant_client and QDRANT_COLLECTION and points):
        return False
    wait_value = QDRANT_UPSERT_WAIT if wait is None else bool(wait)
    body = {"points": points}
    try:
        resp = await qdrant_client.put(
            f"/collections/{QDRANT_COLLECTION}/points?wait={'true' if wait_value else 'false'}",
            json=body,
        )
        resp.raise_for_status()
        return True
    except Exception as e:
        print(f"[QDRANT] bulk upsert failed: {e}")
        return False


async def qdrant_search(vector: List[float], limit: int = 5) -> List[Dict[str, Any]]:
    if not (qdrant_client and QDRANT_COLLECTION and vector):
        return []

    path_search = f"/collections/{QDRANT_COLLECTION}/points/search"
    body = {
        "vector": vector,
        "limit": max(1, int(limit)),
        "with_payload": True,
        "with_vector": False,
    }
    try:
        resp = await qdrant_client.post(path_search, json=body)
        if resp.status_code == 404:
            # Compatibility fallback for newer Qdrant API versions.
            resp = await qdrant_client.post(
                f"/collections/{QDRANT_COLLECTION}/points/query",
                json={
                    "query": vector,
                    "limit": max(1, int(limit)),
                    "with_payload": True,
                    "with_vector": False,
                },
            )
        resp.raise_for_status()
        data = resp.json()
        if isinstance(data, dict) and isinstance(data.get("result"), list):
            return data.get("result") or []
    except Exception as e:
        print(f"[QDRANT] search failed: {e}")
    return []


def _extract_last_user_text(messages: List[Dict[str, Any]]) -> str:
    for msg in reversed(messages or []):
        if not isinstance(msg, dict):
            continue
        if str(msg.get("role", "")).lower() != "user":
            continue
        content = msg.get("content")
        if isinstance(content, str) and content.strip():
            return content.strip()
    return ""


async def stream_to_response(upstream_stream: httpx.Response) -> StreamingResponse:
    async def iter_bytes():
        try:
            async for chunk in upstream_stream.aiter_bytes():
                if chunk:
                    yield chunk
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            print(
                f"[STREAM] upstream read failed upstream={upstream_stream.request.url} "
                f"error={repr(exc)}"
            )
        finally:
            try:
                await upstream_stream.aclose()
            except Exception:
                pass

    media_type = upstream_stream.headers.get("content-type", "application/x-ndjson")
    headers = _response_headers(upstream_stream.headers)
    headers.pop("content-type", None)
    headers.setdefault("x-ollama-proxy-upstream", _client_label(upstream_stream.extensions.get("proxy_client")))
    extra_headers = upstream_stream.extensions.get("proxy_extra_headers")
    if isinstance(extra_headers, dict):
        headers.update(extra_headers)
    return StreamingResponse(
        iter_bytes(),
        status_code=upstream_stream.status_code,
        media_type=media_type,
        headers=headers,
    )


async def _stream_upstream_or_error(
    client: httpx.AsyncClient,
    method: str,
    path: str,
    route: str,
    model: Optional[str],
    request_json: Optional[Dict[str, Any]],
    success_log_response_json: Optional[Dict[str, Any]] = None,
    upstream_headers: Optional[Dict[str, str]] = None,
    json_body: Optional[Dict[str, Any]] = None,
    content: Optional[bytes] = None,
    extra_response_headers: Optional[Dict[str, str]] = None,
) -> Response:
    upstream = await _send_upstream_stream(
        client,
        method,
        path,
        route=route,
        json_body=json_body,
        content=content,
        headers=upstream_headers,
    )
    upstream.extensions["proxy_client"] = client
    if extra_response_headers:
        upstream.extensions["proxy_extra_headers"] = extra_response_headers

    if upstream.status_code >= 400:
        error_bytes = await upstream.aread()
        try:
            response_json = json.loads(error_bytes) if error_bytes else None
        except Exception:
            response_json = {"raw": error_bytes.decode("utf-8", errors="ignore")} if error_bytes else None

        await log_to_postgres(
            route=route,
            method=method,
            model=model,
            status=upstream.status_code,
            request_json=request_json,
            response_json=response_json,
        )

        headers = _response_headers(upstream.headers)
        headers.setdefault("x-ollama-proxy-upstream", _client_label(client))
        if extra_response_headers:
            headers.update(extra_response_headers)
        await upstream.aclose()
        return Response(
            content=error_bytes,
            status_code=upstream.status_code,
            headers=headers,
        )

    await log_to_postgres(
        route=route,
        method=method,
        model=model,
        status=upstream.status_code,
        request_json=request_json,
        response_json=success_log_response_json,
    )
    return await stream_to_response(upstream)


async def _stream_post_or_error(
    client: httpx.AsyncClient,
    path: str,
    body_json: Dict[str, Any],
    route: str,
    model: Optional[str],
    request_json: Dict[str, Any],
    success_log_response_json: Optional[Dict[str, Any]] = None,
    upstream_headers: Optional[Dict[str, str]] = None,
) -> Response:
    return await _stream_upstream_or_error(
        client=client,
        method="POST",
        path=path,
        route=route,
        model=model,
        request_json=request_json,
        success_log_response_json=success_log_response_json,
        upstream_headers=upstream_headers,
        json_body=body_json,
    )


def _hash_key(parts: List[str]) -> str:
    raw = "|".join(parts).encode("utf-8", errors="ignore")
    return hashlib.sha256(raw).hexdigest()


async def cache_get(key: str) -> Optional[dict]:
    if not redis_client:
        return None
    try:
        cached = await redis_client.get(key)
        if not cached:
            return None
        return json.loads(cached)
    except Exception:
        return None


async def cache_mget(keys: List[str]) -> List[Optional[dict]]:
    if not redis_client or not keys:
        return [None for _ in keys]
    try:
        cached_values = await redis_client.mget(keys)
    except Exception:
        return [None for _ in keys]

    results: List[Optional[dict]] = []
    for cached in cached_values:
        if not cached:
            results.append(None)
            continue
        try:
            results.append(json.loads(cached))
        except Exception:
            results.append(None)
    return results


async def cache_set(key: str, payload: dict):
    if not redis_client:
        return
    try:
        await redis_client.setex(key, REDIS_TTL_SEC, json.dumps(payload))
    except Exception:
        pass


def _redact_for_log(value: Any) -> Any:
    if value is None or not REDACT_SENSITIVE_LOGS:
        return value
    if isinstance(value, dict):
        redacted: Dict[str, Any] = {}
        for key, item in value.items():
            lowered = str(key).lower()
            if lowered in SENSITIVE_LOG_KEYS:
                if isinstance(item, str):
                    redacted[key] = {"redacted": True, "chars": len(item)}
                elif isinstance(item, list):
                    redacted[key] = {"redacted": True, "items": len(item)}
                else:
                    redacted[key] = {"redacted": True}
            else:
                redacted[key] = _redact_for_log(item)
        return redacted
    if isinstance(value, list):
        return [_redact_for_log(item) for item in value[:25]]
    return value


def _response_headers(headers: httpx.Headers) -> Dict[str, str]:
    return {
        key: value
        for key, value in headers.items()
        if key.lower() not in HOP_BY_HOP_HEADERS
    }


def _proxied_response_headers(
    headers: httpx.Headers,
    client: Optional[httpx.AsyncClient],
    extra_headers: Optional[Dict[str, str]] = None,
) -> Dict[str, str]:
    filtered = _response_headers(headers)
    filtered.setdefault("x-ollama-proxy-upstream", _client_label(client))
    if extra_headers:
        filtered.update(extra_headers)
    return filtered


def _upstream_headers(request: Request) -> Dict[str, str]:
    return {
        key: value
        for key, value in request.headers.items()
        if key.lower() not in HOP_BY_HOP_HEADERS
        and key.lower() not in {"host", "x-ollama-target"}
        and not key.lower().startswith("x-ollama-proxy-")
    }


async def _read_request_body(request: Request, label: Optional[str] = None) -> bytes:
    cached_body = getattr(request.state, "_proxy_raw_body", None)
    if cached_body is not None:
        raw_body = cached_body
    else:
        chunks: List[bytes] = []
        total_bytes = 0
        async for chunk in request.stream():
            if not chunk:
                continue
            total_bytes += len(chunk)
            if total_bytes > REQUEST_BODY_LIMIT_BYTES:
                raise HTTPException(
                    status_code=413,
                    detail=f"request body exceeds max size of {REQUEST_BODY_LIMIT_BYTES} bytes",
                )
            chunks.append(chunk)
        raw_body = b"".join(chunks)
        request.state._proxy_raw_body = raw_body

    if label:
        await maybe_log_body(label, raw_body.decode("utf-8", errors="ignore"))
    return raw_body


def _parse_json_body(raw_body: bytes) -> Dict[str, Any]:
    if not raw_body:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    try:
        parsed = json.loads(raw_body)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(parsed, dict):
        raise HTTPException(status_code=400, detail="JSON object is required")
    return parsed


def _parse_optional_json_body(raw_body: bytes, content_type: str) -> Optional[Dict[str, Any]]:
    if not raw_body or "application/json" not in str(content_type or "").lower():
        return None
    try:
        parsed = json.loads(raw_body)
    except Exception:
        return None
    return parsed if isinstance(parsed, dict) else None


async def _read_json_request(request: Request, label: Optional[str] = None) -> Tuple[bytes, Dict[str, Any]]:
    raw_body = await _read_request_body(request, label=label)
    return raw_body, _parse_json_body(raw_body)


def _parse_response_payload(resp: httpx.Response) -> Optional[Dict[str, Any]]:
    try:
        parsed = resp.json()
    except Exception:
        parsed = None
    if isinstance(parsed, dict):
        return parsed
    if parsed is not None:
        return {"result": parsed}
    if resp.text:
        return {"raw": resp.text}
    return None


def _embedding_cache_key(model: str, text: str, dimensions: int = 0) -> str:
    dim_key = str(max(0, int(dimensions or 0)))
    return _hash_key(["emb", model, dim_key, text])


def _sum_text_lengths(items: List[str]) -> int:
    return sum(len(item or "") for item in items)


def _validate_max_chars(value: str, limit: int, label: str):
    if len(value) > limit:
        raise HTTPException(
            status_code=413,
            detail=f"{label} exceeds max length of {limit} chars",
        )


def _validate_total_chars(items: List[str], limit: int, label: str):
    total_chars = _sum_text_lengths(items)
    if total_chars > limit:
        raise HTTPException(
            status_code=413,
            detail=f"{label} exceeds max combined length of {limit} chars",
        )


def _parse_int_field(value: Any, label: str) -> int:
    try:
        return int(value)
    except Exception:
        raise HTTPException(status_code=400, detail=f"{label} must be an integer")


def _normalize_model_name(model: Optional[str]) -> str:
    normalized = str(model or "").strip().lower()
    if normalized.endswith(":latest"):
        return normalized[:-7]
    return normalized


def _parse_model_names(raw: str) -> Set[str]:
    return {
        normalized
        for normalized in (_normalize_model_name(name) for name in raw.split(","))
        if normalized
    }


GENERAL_MODEL_NAMES = _parse_model_names(GENERAL_MODEL_NAMES_RAW)
CODE_MODEL_NAMES = _parse_model_names(CODE_MODEL_NAMES_RAW)
EMBEDDING_MODEL_NAMES = _parse_model_names(EMBEDDING_MODEL_NAMES_RAW)
ALLOWED_CHAT_MODEL_NAMES = GENERAL_MODEL_NAMES | CODE_MODEL_NAMES
ALLOWED_EMBED_MODEL_NAMES = set(EMBEDDING_MODEL_NAMES)
_NORMALIZED_EMBEDDING_UPSTREAM_MODEL = _normalize_model_name(EMBEDDING_UPSTREAM_MODEL)
_NORMALIZED_RERANK_MODEL = _normalize_model_name(RERANK_MODEL)
if RERANK_STRATEGY == "embedding" and _NORMALIZED_RERANK_MODEL:
    ALLOWED_EMBED_MODEL_NAMES.add(_NORMALIZED_RERANK_MODEL)

ALLOWED_SHOW_MODEL_NAMES = ALLOWED_CHAT_MODEL_NAMES | ALLOWED_EMBED_MODEL_NAMES
if _NORMALIZED_RERANK_MODEL:
    ALLOWED_SHOW_MODEL_NAMES.add(_NORMALIZED_RERANK_MODEL)

if PUBLIC_MODEL_NAMES_RAW.strip():
    PUBLIC_MODEL_NAMES = _parse_model_names(PUBLIC_MODEL_NAMES_RAW)
else:
    PUBLIC_MODEL_NAMES = set(ALLOWED_CHAT_MODEL_NAMES)
    if EXPOSE_EMBED_MODELS_IN_CATALOG:
        PUBLIC_MODEL_NAMES |= EMBEDDING_MODEL_NAMES
    if EXPOSE_RERANK_MODELS_IN_CATALOG and _NORMALIZED_RERANK_MODEL:
        PUBLIC_MODEL_NAMES.add(_NORMALIZED_RERANK_MODEL)


def _sorted_model_names(model_names: Set[str]) -> List[str]:
    return sorted(name for name in model_names if name)


def _uses_embedding_upstream_alias(model: Optional[str]) -> bool:
    normalized = _normalize_model_name(model)
    return bool(normalized and _NORMALIZED_EMBEDDING_UPSTREAM_MODEL and normalized in EMBEDDING_MODEL_NAMES)


def _embedding_upstream_model(model: Optional[str]) -> str:
    if _uses_embedding_upstream_alias(model):
        return EMBEDDING_UPSTREAM_MODEL
    return _coerce_to_text(model).strip()


def _embedding_response_with_public_model(
    data: Optional[Dict[str, Any]],
    public_model: Optional[str],
) -> Optional[Dict[str, Any]]:
    if isinstance(data, dict) and public_model and _uses_embedding_upstream_alias(public_model):
        data["model"] = public_model
    return data


def _resolve_model(
    model: Optional[str],
    allowed_names: Set[str],
    route: str,
    default_model: Optional[str] = None,
    required: bool = False,
) -> str:
    resolved = _coerce_to_text(model or default_model).strip()
    if not resolved:
        if required:
            raise HTTPException(status_code=400, detail=f"model is required for {route}")
        return ""

    if not STRICT_MODEL_ALLOWLIST:
        return resolved

    normalized = _normalize_model_name(resolved)
    if normalized in allowed_names:
        return resolved

    allowed = ", ".join(_sorted_model_names(allowed_names)) if allowed_names else "(none configured)"
    raise HTTPException(
        status_code=400,
        detail=f"model '{resolved}' is not allowed on {route}; allowed models: {allowed}",
    )


def _configured_model_names_for_target(target: str) -> Set[str]:
    normalized_target = str(target or "").strip().lower()
    if normalized_target == "general":
        return set(GENERAL_MODEL_NAMES)
    if normalized_target == "code":
        return set(CODE_MODEL_NAMES)
    if normalized_target == "embed":
        return set(ALLOWED_EMBED_MODEL_NAMES)
    if normalized_target == "rerank":
        return {_NORMALIZED_RERANK_MODEL} if _NORMALIZED_RERANK_MODEL else set(ALLOWED_EMBED_MODEL_NAMES)
    return set()


def _validate_target_inference_model(
    target: str,
    path: str,
    body_json: Optional[Dict[str, Any]],
):
    if not STRICT_MODEL_ALLOWLIST or not isinstance(body_json, dict):
        return

    normalized_path = f"/{str(path or '').lstrip('/')}".split("?", 1)[0]
    if normalized_path not in DIRECT_CHANNEL_INFERENCE_PATHS:
        return

    allowed_names = _configured_model_names_for_target(target)
    if not allowed_names:
        return

    field = "name" if normalized_path == "/api/show" else "model"
    raw_model = body_json.get(field)
    if raw_model is None:
        return

    _resolve_model(raw_model, allowed_names, f"/{target}{normalized_path}", required=False)


def _embedding_alias_request_body(
    target: str,
    path: str,
    body_json: Optional[Dict[str, Any]],
) -> Optional[Dict[str, Any]]:
    if str(target or "").strip().lower() != "embed" or not isinstance(body_json, dict):
        return body_json

    normalized_path = f"/{str(path or '').lstrip('/')}".split("?", 1)[0]
    if normalized_path not in DIRECT_CHANNEL_INFERENCE_PATHS:
        return body_json

    field = "name" if normalized_path == "/api/show" else "model"
    requested = body_json.get(field)
    if not _uses_embedding_upstream_alias(requested):
        return body_json

    forwarded = dict(body_json)
    forwarded[field] = _embedding_upstream_model(requested)
    return forwarded


def _embedding_alias_response_content(resp: httpx.Response, public_model: Optional[str]) -> bytes:
    if not _uses_embedding_upstream_alias(public_model):
        return resp.content
    data = _parse_response_payload(resp)
    if not isinstance(data, dict):
        return resp.content
    data["model"] = public_model
    return json.dumps(data).encode("utf-8")


def _is_code_model(model: Optional[str]) -> bool:
    normalized = _normalize_model_name(model)
    if not normalized:
        return False
    if normalized in CODE_MODEL_NAMES:
        return True
    if not ALLOW_CODE_MODEL_PREFIX_ROUTING:
        return False
    return any(normalized.startswith(prefix) for prefix in CODE_MODEL_PREFIXES)


def _select_client_for_model(model: Optional[str]) -> httpx.AsyncClient:
    normalized = _normalize_model_name(model)
    if normalized == _NORMALIZED_RERANK_MODEL and rerank_client is not None:
        return rerank_client
    if _is_code_model(model) and code_client is not None:
        return code_client
    if normalized in ALLOWED_EMBED_MODEL_NAMES and embed_client is not None:
        return embed_client
    return ollama_client


def _client_for_target(target: Optional[str]) -> Optional[httpx.AsyncClient]:
    normalized = str(target or "").strip().lower()
    if normalized in ("general", "chat", "default"):
        return ollama_client
    if normalized in ("code", "coder"):
        return code_client
    if normalized in ("embed", "embedding", "embeddings"):
        return embed_client
    if normalized in ("rerank", "reranker"):
        return rerank_client or embed_client
    return None


def _require_direct_channel_client(target: str) -> httpx.AsyncClient:
    client = _client_for_target(target)
    if client is None:
        raise HTTPException(
            status_code=503,
            detail={
                "error": "upstream_not_initialized",
                "upstream": target,
            },
        )
    return client


def _direct_channel_response_headers(target: str, client: httpx.AsyncClient) -> Dict[str, str]:
    return {
        "x-ollama-proxy-upstream": _client_label(client),
        "x-ollama-proxy-target": target,
    }


def _direct_channel_info_response(target: str, client: httpx.AsyncClient) -> JSONResponse:
    return JSONResponse(
        content={
            "target": target,
            "base_path": f"/{target}",
            "upstream": _client_label(client),
            "upstream_base_url": _client_base_url(client),
            "paths": {
                "health": f"/{target}/health",
                "ollama_api": f"/{target}/api",
                "openai_api": f"/{target}/v1",
                "tags": f"/{target}/api/tags",
            },
            "notes": [
                "Fixed-target passthrough to a single Ollama channel.",
                "Model allowlists still apply to inference endpoints when lockdown is enabled.",
                "Mutating raw admin routes stay gated by ALLOW_ADMIN_PASSTHROUGH.",
            ],
        },
        headers=_direct_channel_response_headers(target, client),
    )


def _is_direct_channel_mutation_allowed(method: str, path: str) -> bool:
    if method.upper() not in ("POST", "PUT", "DELETE"):
        return True
    normalized_path = f"/{str(path or '').lstrip('/')}"
    return method.upper() == "POST" and normalized_path in DIRECT_CHANNEL_INFERENCE_PATHS


def _is_direct_channel_stream_request(
    method: str,
    path: str,
    body_json: Optional[Dict[str, Any]],
) -> bool:
    if method.upper() != "POST":
        return False
    normalized_path = f"/{str(path or '').lstrip('/')}"
    if normalized_path in DIRECT_CHANNEL_ALWAYS_STREAM_PATHS:
        return True
    if normalized_path in DIRECT_CHANNEL_STREAMING_PATHS:
        return isinstance(body_json, dict) and bool(body_json.get("stream", False))
    return False


async def _proxy_direct_channel_request(request: Request, target: str, path: str) -> Response:
    client = _require_direct_channel_client(target)
    stripped_path = str(path or "").lstrip("/")
    if not stripped_path:
        return _direct_channel_info_response(target, client)
    if stripped_path == "health" and request.method == "GET":
        payload = await _direct_channel_health_payload(target)
        return JSONResponse(
            content=payload,
            headers=_direct_channel_response_headers(target, client),
        )

    upstream_path = f"/{stripped_path}"
    if not ALLOW_ADMIN_PASSTHROUGH and not _is_direct_channel_mutation_allowed(request.method, upstream_path):
        raise HTTPException(
            status_code=403,
            detail="admin passthrough is disabled; set ALLOW_ADMIN_PASSTHROUGH=1 to enable",
        )

    query_items = list(request.query_params.multi_items())
    if query_items:
        upstream_path = f"{upstream_path}?{urlencode(query_items, doseq=True)}"

    body = await _read_request_body(
        request,
        f"DIRECT_{target.upper()}_REQ" if request.method not in ("GET", "HEAD", "OPTIONS") else None,
    )
    body_json = _parse_optional_json_body(body, request.headers.get("content-type", ""))
    route = f"/{target}/{stripped_path}"
    extra_headers = {"x-ollama-proxy-target": target}
    _validate_target_inference_model(target, stripped_path, body_json)
    model = body_json.get("model") if isinstance(body_json, dict) else None
    forwarded_body_json = _embedding_alias_request_body(target, stripped_path, body_json)
    if forwarded_body_json is not body_json:
        body = json.dumps(forwarded_body_json).encode("utf-8")
    upstream_headers = _upstream_headers(request)

    if _is_direct_channel_stream_request(request.method, stripped_path, forwarded_body_json):
        return await _stream_upstream_or_error(
            client=client,
            method=request.method,
            path=upstream_path,
            route=route,
            model=model,
            request_json=forwarded_body_json,
            upstream_headers=upstream_headers,
            content=body if body else None,
            extra_response_headers=extra_headers,
        )

    resp = await _request_upstream(
        client,
        request.method,
        upstream_path,
        route=route,
        content=body if body else None,
        headers=upstream_headers,
    )

    if request.method in ("POST", "PUT", "DELETE"):
        await log_to_postgres(
            route=route,
            method=request.method,
            model=model,
            status=resp.status_code,
            request_json=body_json,
            response_json=_parse_response_payload(resp),
        )

    content = _embedding_alias_response_content(resp, model)
    return Response(
        content=content,
        status_code=resp.status_code,
        headers=_proxied_response_headers(resp.headers, client, extra_headers=extra_headers),
    )


def _resolve_passthrough_client(
    request: Request,
    body_json: Optional[Dict[str, Any]],
) -> httpx.AsyncClient:
    explicit_target = (
        request.query_params.get("target")
        or request.headers.get("x-ollama-target")
        or (
            body_json.get("target")
            if isinstance(body_json, dict) and isinstance(body_json.get("target"), str)
            else None
        )
    )
    if explicit_target:
        client = _client_for_target(explicit_target)
        if client is None:
            raise HTTPException(
                status_code=400,
                detail="unknown passthrough target; use general, code, embed, or rerank",
            )
        return client

    candidates: List[Optional[str]] = []
    if isinstance(body_json, dict):
        candidates.extend(
            [
                body_json.get("model"),
                body_json.get("name"),
                body_json.get("source"),
                body_json.get("destination"),
            ]
        )
    selected_clients = [
        _select_client_for_model(candidate)
        for candidate in candidates
        if candidate
    ]
    selected_labels = {_client_label(client) for client in selected_clients if client is not None}
    if len(selected_labels) > 1:
        raise HTTPException(
            status_code=400,
            detail="ambiguous passthrough target; set x-ollama-target or ?target=",
        )
    if selected_clients:
        return selected_clients[0]
    return ollama_client


def _filter_models(models: List[Dict[str, Any]], allowed_names: Set[str]) -> List[Dict[str, Any]]:
    if not allowed_names:
        return models

    filtered: List[Dict[str, Any]] = []
    for model in models:
        model_id = model.get("model") or model.get("name")
        if _normalize_model_name(model_id) in allowed_names:
            filtered.append(model)
    return filtered


def _embedding_catalog_models(models: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    if not _NORMALIZED_EMBEDDING_UPSTREAM_MODEL:
        return models

    output: List[Dict[str, Any]] = []
    alias_names = _sorted_model_names(EMBEDDING_MODEL_NAMES)
    for model in models:
        if not isinstance(model, dict):
            continue
        model_id = model.get("model") or model.get("name")
        if _normalize_model_name(model_id) != _NORMALIZED_EMBEDDING_UPSTREAM_MODEL:
            output.append(model)
            continue

        for alias in alias_names:
            aliased = dict(model)
            if "model" in aliased:
                aliased["model"] = alias
            if "name" in aliased:
                aliased["name"] = alias
            output.append(aliased)

    return output


def _available_model_names(payload: Optional[Dict[str, Any]]) -> Set[str]:
    if not isinstance(payload, dict):
        return set()
    models = payload.get("models")
    if not isinstance(models, list):
        return set()
    names: Set[str] = set()
    for model in models:
        if not isinstance(model, dict):
            continue
        model_id = model.get("model") or model.get("name")
        normalized = _normalize_model_name(model_id)
        if normalized:
            names.add(normalized)
    return names


def _content_fragments(value: Any) -> List[str]:
    if isinstance(value, str):
        return [value]
    if isinstance(value, list):
        fragments: List[str] = []
        for item in value:
            fragments.extend(_content_fragments(item))
        return fragments
    if isinstance(value, dict):
        fragments: List[str] = []
        if "content" in value:
            fragments.extend(_content_fragments(value.get("content")))
        if "text" in value:
            fragments.extend(_content_fragments(value.get("text")))
        return fragments
    return []


def _validate_chat_payload(body_json: Dict[str, Any]):
    messages = body_json.get("messages")
    if not isinstance(messages, list) or not messages:
        return
    if len(messages) > CHAT_MAX_MESSAGES:
        raise HTTPException(
            status_code=413,
            detail=f"messages exceeds max count of {CHAT_MAX_MESSAGES}",
        )
    total_chars = 0
    for message in messages:
        if isinstance(message, dict):
            total_chars += _sum_text_lengths(_content_fragments(message.get("content")))
    if total_chars > CHAT_MAX_TOTAL_CHARS:
        raise HTTPException(
            status_code=413,
            detail=f"messages exceed max combined length of {CHAT_MAX_TOTAL_CHARS} chars",
        )


def _validate_generate_payload(body_json: Dict[str, Any]):
    prompt = _coerce_to_text(body_json.get("prompt") or "")
    if prompt:
        _validate_max_chars(prompt, GENERATE_MAX_PROMPT_CHARS, "prompt")
    suffix = _coerce_to_text(body_json.get("suffix") or "")
    if suffix:
        _validate_max_chars(suffix, GENERATE_MAX_SUFFIX_CHARS, "suffix")


def _validate_requested_num_ctx(body_json: Dict[str, Any]):
    options = body_json.get("options")
    if not isinstance(options, dict):
        return
    raw_num_ctx = options.get("num_ctx")
    if raw_num_ctx is None:
        return
    try:
        num_ctx = int(raw_num_ctx)
    except Exception:
        raise HTTPException(status_code=400, detail="options.num_ctx must be an integer")
    if num_ctx <= 0:
        raise HTTPException(status_code=400, detail="options.num_ctx must be positive")
    if num_ctx > MAX_NUM_CTX:
        raise HTTPException(
            status_code=413,
            detail=f"options.num_ctx exceeds max of {MAX_NUM_CTX}",
        )


async def _fetch_tags_payload(client: Optional[httpx.AsyncClient]) -> Dict[str, Any]:
    name = _client_label(client)
    if client is None:
        return {"models": [], "_upstream": name, "_error": "client not initialized"}
    try:
        resp = await _request_upstream(client, "GET", "/api/tags", route=f"/api/tags[{name}]")
    except HTTPException as exc:
        detail = exc.detail if isinstance(exc.detail, str) else json.dumps(exc.detail, ensure_ascii=False)
        print(f"[CATALOG] tags fetch failed upstream={name} detail={detail}")
        return {"models": [], "_upstream": name, "_error": detail}

    data = _parse_response_payload(resp)
    if not isinstance(data, dict):
        return {"models": [], "_upstream": name, "_error": "invalid upstream response"}
    if resp.status_code >= 400:
        detail = data.get("detail") if isinstance(data.get("detail"), str) else json.dumps(data, ensure_ascii=False)
        print(f"[CATALOG] tags fetch http_error upstream={name} status={resp.status_code} detail={detail}")
        return {
            "models": [],
            "_upstream": name,
            "_error": f"status={resp.status_code} {detail}",
        }
    data["_upstream"] = name
    if name == "embed" and isinstance(data.get("models"), list):
        data["models"] = _embedding_catalog_models(data["models"])
    return data


async def _fetch_ps_payload(client: Optional[httpx.AsyncClient]) -> Dict[str, Any]:
    name = _client_label(client)
    if client is None:
        return {"models": [], "_upstream": name, "_error": "client not initialized"}
    try:
        resp = await _request_upstream(client, "GET", "/api/ps", route=f"/api/ps[{name}]")
    except HTTPException as exc:
        detail = exc.detail if isinstance(exc.detail, str) else json.dumps(exc.detail, ensure_ascii=False)
        print(f"[CATALOG] ps fetch failed upstream={name} detail={detail}")
        return {"models": [], "_upstream": name, "_error": detail}

    data = _parse_response_payload(resp)
    if not isinstance(data, dict):
        return {"models": [], "_upstream": name, "_error": "invalid upstream response"}
    if resp.status_code >= 400:
        detail = data.get("detail") if isinstance(data.get("detail"), str) else json.dumps(data, ensure_ascii=False)
        print(f"[CATALOG] ps fetch http_error upstream={name} status={resp.status_code} detail={detail}")
        return {
            "models": [],
            "_upstream": name,
            "_error": f"status={resp.status_code} {detail}",
        }
    data["_upstream"] = name
    return data


def _merge_models(payloads: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    seen: Dict[str, Dict[str, Any]] = {}
    for payload in payloads:
        models = payload.get("models")
        if not isinstance(models, list):
            continue
        for model in models:
            if not isinstance(model, dict):
                continue
            key = str(model.get("digest") or model.get("model") or model.get("name") or "")
            if not key:
                continue
            seen[key] = model
    return list(seen.values())


def _openai_models_payload(models: List[Dict[str, Any]]) -> Dict[str, Any]:
    data: List[Dict[str, Any]] = []
    for model in models:
        model_id = model.get("model") or model.get("name")
        if not model_id:
            continue
        data.append(
            {
                "id": model_id,
                "object": "model",
                "created": 0,
                "owned_by": "ollama",
            }
        )
    return {"object": "list", "data": data}


def _degraded_catalog_headers(payloads: List[Dict[str, Any]]) -> Dict[str, str]:
    degraded_upstreams = [
        payload.get("_upstream")
        for payload in payloads
        if isinstance(payload, dict) and payload.get("_error")
    ]
    degraded_upstreams = [name for name in degraded_upstreams if name]
    if not degraded_upstreams:
        return {}
    return {
        "x-ollama-proxy-degraded": "1",
        "x-ollama-proxy-unhealthy-upstreams": ",".join(sorted(set(degraded_upstreams))),
    }


def _catalog_clients() -> List[Optional[httpx.AsyncClient]]:
    clients: List[Optional[httpx.AsyncClient]] = [ollama_client, code_client, embed_client]
    seen_base_urls = {
        _client_base_url(client)
        for client in clients
        if _client_base_url(client)
    }
    rerank_base_url = _client_base_url(rerank_client)
    if rerank_client is not None and rerank_base_url and rerank_base_url not in seen_base_urls:
        clients.append(rerank_client)
    return clients


def _serialize_scored_results(scored: List[Tuple[int, float]]) -> Dict[str, Any]:
    return {
        "scores": [
            {"index": int(idx), "relevance_score": float(score)}
            for idx, score in scored
        ]
    }


def _deserialize_scored_results(payload: Optional[dict]) -> Optional[List[Tuple[int, float]]]:
    if not isinstance(payload, dict):
        return None
    raw_scores = payload.get("scores")
    if not isinstance(raw_scores, list):
        return None

    scored: List[Tuple[int, float]] = []
    for item in raw_scores:
        if not isinstance(item, dict):
            return None
        try:
            idx = int(item.get("index"))
            score = float(item.get("relevance_score"))
        except Exception:
            return None
        scored.append((idx, score))
    return scored


async def _maybe_index_embedding_vectors(
    route: str,
    model: Optional[str],
    input_texts: List[str],
    vectors: List[List[float]],
):
    if not AUTO_INDEX_EMBED_REQUESTS or not vectors:
        return

    points: List[Dict[str, Any]] = []
    for idx, vec in enumerate(vectors):
        point_payload: Dict[str, Any] = {
            "source": "ollama-proxy",
            "type": "embedding",
            "route": route,
            "model": model,
            "index": idx,
        }
        if idx < len(input_texts):
            point_payload["text"] = input_texts[idx][:KNOWLEDGE_TEXT_MAX_CHARS]
        points.append(
            {
                "id": str(uuid.uuid4()),
                "vector": vec,
                "payload": point_payload,
            }
        )
    ok = await qdrant_upsert_points(points)
    if not ok:
        print(f"[QDRANT] index failed route={route} count={len(points)}")


def normalize_embedding_body(body_json: Dict[str, Any], mode: str) -> Dict[str, Any]:
    """
    Normalize incoming embedding payloads from Ollama/OpenAI-style clients.
    mode:
      - "embeddings": target /api/embeddings (expects prompt)
      - "embed": target /api/embed (expects input)
    """
    body = dict(body_json or {})
    # Honor the client-requested model; use default only when omitted.
    if not body.get("model"):
        body["model"] = EMBEDDING_MODEL

    dimensions = _normalize_dimensions_value(body.get("dimensions", EMBEDDING_DIMENSIONS))
    if dimensions > 0:
        body["dimensions"] = dimensions
    else:
        body.pop("dimensions", None)

    derived = _derive_input_value(body)
    if "input" not in body and "prompt" not in body and derived is not None:
        body["input"] = derived

    prompt = body.get("prompt")
    input_value = body.get("input")

    # Maximal compatibility: coerce non-string embedding payloads into text.
    if prompt is not None and not isinstance(prompt, str):
        prompt = _coerce_to_text(prompt)
        body["prompt"] = prompt
    if input_value is not None:
        if isinstance(input_value, list):
            input_value = [_coerce_to_text(x) for x in input_value]
            body["input"] = input_value
        elif not isinstance(input_value, str):
            input_value = _coerce_to_text(input_value)
            body["input"] = input_value

    if mode == "embeddings":
        if prompt is None:
            if isinstance(input_value, str):
                body["prompt"] = input_value
            elif isinstance(input_value, list):
                first_str = next((x for x in input_value if isinstance(x, str)), None)
                if first_str is not None:
                    body["prompt"] = first_str
    elif mode == "embed":
        if input_value is None and isinstance(prompt, str):
            body["input"] = prompt
    return body


def extract_embedding_vectors(data: Any) -> List[List[float]]:
    """
    Handles:
      - {"embedding": [...]}
      - {"embeddings": [[...], ...]} or {"embeddings": [...]}
      - OpenAI-style {"data": [{"embedding": [...]}, ...]}
    """
    vectors: List[List[float]] = []
    if not isinstance(data, dict):
        return vectors

    emb = data.get("embedding")
    if isinstance(emb, list):
        vectors.append(emb)

    embs = data.get("embeddings")
    if isinstance(embs, list) and embs:
        if isinstance(embs[0], list):
            for vec in embs:
                if isinstance(vec, list):
                    vectors.append(vec)
        else:
            vectors.append(embs)

    openai_data = data.get("data")
    if isinstance(openai_data, list):
        for item in openai_data:
            if isinstance(item, dict) and isinstance(item.get("embedding"), list):
                vectors.append(item["embedding"])

    return vectors


def _coerce_to_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="ignore")
    if isinstance(value, (dict, list, tuple, int, float, bool)):
        try:
            return json.dumps(value, ensure_ascii=False)
        except Exception:
            return str(value)
    return str(value)


def _normalize_embed_inputs(input_value: Any) -> List[str]:
    if input_value is None:
        return []
    if isinstance(input_value, list):
        return [_coerce_to_text(item) for item in input_value]
    return [_coerce_to_text(input_value)]


def _derive_input_value(body: Dict[str, Any]) -> Any:
    """
    Accept common embedding payload aliases from varied clients.
    Priority favors explicit embedding fields first.
    """
    for key in ("input", "prompt", "texts", "documents", "text", "content", "query", "message", "messages"):
        if key in body and body.get(key) is not None:
            return body.get(key)
    return None


def _normalize_dimensions_value(value: Any) -> int:
    if value in (None, "", 0, "0"):
        return 0
    try:
        normalized = int(value)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="dimensions must be an integer") from exc
    if normalized < 0:
        raise HTTPException(status_code=400, detail="dimensions must be non-negative")
    return normalized


def _split_text_chunks(text: str, chunk_chars: int, overlap_chars: int) -> List[str]:
    if chunk_chars <= 0:
        return [text]
    if len(text) <= chunk_chars:
        return [text]

    overlap = max(0, min(overlap_chars, chunk_chars - 1))
    step = chunk_chars - overlap
    chunks: List[str] = []
    idx = 0
    n = len(text)
    while idx < n:
        end = min(n, idx + chunk_chars)
        chunks.append(text[idx:end])
        if end >= n:
            break
        idx += step
    return chunks


def _mean_pool(vectors: List[List[float]]) -> List[float]:
    if not vectors:
        return []
    if len(vectors) == 1:
        return vectors[0]
    dim = len(vectors[0])
    pooled = [0.0] * dim
    valid_count = 0
    for vec in vectors:
        if len(vec) != dim:
            continue
        valid_count += 1
        for i, v in enumerate(vec):
            pooled[i] += float(v)
    if valid_count == 0:
        return []
    denom = float(valid_count)
    return [v / denom for v in pooled]


def _is_context_length_error(status_code: int, data: Optional[Dict[str, Any]], raw_text: str) -> bool:
    if status_code < 400:
        return False
    msg = raw_text or ""
    if isinstance(data, dict):
        err = data.get("error")
        if isinstance(err, dict):
            msg = json.dumps(err, ensure_ascii=False)
        elif err is not None:
            msg = str(err)
    lowered = msg.lower()
    return (
        "context length" in lowered
        or "input length exceeds" in lowered
        or "too long" in lowered
    )


def _is_model_not_found_error(status_code: int, data: Optional[Dict[str, Any]], raw_text: str) -> bool:
    if status_code != 404:
        return False
    msg = raw_text or ""
    if isinstance(data, dict):
        err = data.get("error")
        if isinstance(err, dict):
            msg = json.dumps(err, ensure_ascii=False)
        elif err is not None:
            msg = str(err)
    lowered = msg.lower()
    return "not found" in lowered and "model" in lowered


def _is_chunk_retryable_error(status_code: int, data: Optional[Dict[str, Any]], raw_text: str) -> bool:
    if _is_context_length_error(status_code, data, raw_text):
        return True
    if status_code >= 500:
        return True

    msg = raw_text or ""
    if isinstance(data, dict):
        err = data.get("error")
        if isinstance(err, dict):
            msg = json.dumps(err, ensure_ascii=False)
        elif err is not None:
            msg = str(err)

    lowered = msg.lower()
    return (
        "embedding request" in lowered
        or "internal server error" in lowered
        or " eof" in lowered
        or lowered.endswith("eof")
    )


async def _post_embed_once(payload: Dict[str, Any]) -> Tuple[int, Optional[Dict[str, Any]], str]:
    if not embed_client:
        return 500, {"error": "embed_client_not_initialized"}, ""

    max_retries = max(1, EMBED_UPSTREAM_MAX_RETRIES)
    backoff_ms = max(0, EMBED_UPSTREAM_RETRY_BACKOFF_MS)
    last_exc: Optional[Exception] = None

    for attempt in range(1, max_retries + 1):
        try:
            resp = await embed_client.post("/api/embed", json=payload)
            raw_text = resp.text or ""
            data: Optional[Dict[str, Any]] = None
            try:
                parsed = resp.json()
                if isinstance(parsed, dict):
                    data = parsed
                elif parsed is not None:
                    data = {"result": parsed}
            except Exception:
                if raw_text:
                    data = {"raw": raw_text}
            return resp.status_code, data, raw_text
        except httpx.HTTPError as exc:
            last_exc = exc
            print(
                "[EMBED] transport error "
                f"attempt={attempt}/{max_retries} error={repr(exc)}"
            )
            if attempt < max_retries and backoff_ms > 0:
                await asyncio.sleep((backoff_ms * attempt) / 1000.0)

    detail = str(last_exc) if last_exc else "unknown transport failure"
    return 502, {
        "error": "embed_upstream_transport_error",
        "detail": detail,
        "attempts": max_retries,
        "embed_base_url": EMBEDDING_OLLAMA_BASE_URL,
    }, detail


async def _embed_with_chunking(base_payload: Dict[str, Any], model: str, inputs: List[str]) -> Tuple[int, Dict[str, Any]]:
    merged_vectors: List[List[float]] = []
    min_chunk_size = max(1, EMBED_CHUNK_MIN_CHARS)

    for item in inputs:
        text = item or ""
        chunk_chars = max(min_chunk_size, EMBED_CHUNK_CHARS)
        chunk_vectors: Optional[List[List[float]]] = None

        while chunk_chars >= min_chunk_size:
            chunks = _split_text_chunks(text, chunk_chars, EMBED_CHUNK_OVERLAP)
            current_vectors: List[List[float]] = []
            should_reduce_chunk = False

            for chunk in chunks:
                payload = dict(base_payload)
                payload["input"] = chunk
                status, data, raw_text = await _post_embed_once(payload)

                if status >= 400:
                    if _is_chunk_retryable_error(status, data, raw_text) and chunk_chars > min_chunk_size:
                        should_reduce_chunk = True
                        break
                    if data is None:
                        return status, {"error": "embedding_failed", "detail": raw_text}
                    return status, data

                vectors = extract_embedding_vectors(data)
                if not vectors:
                    return 500, {"error": "embedding response missing vectors"}
                current_vectors.append(vectors[0])

            if should_reduce_chunk:
                next_chunk = max(min_chunk_size, chunk_chars // 2)
                if next_chunk == chunk_chars:
                    break
                chunk_chars = next_chunk
                continue

            chunk_vectors = current_vectors
            break

        if not chunk_vectors:
            return 413, {
                "error": "input_too_large_for_embedder",
                "detail": "Unable to embed input with chunk fallback",
                "model": model,
            }

        pooled = _mean_pool(chunk_vectors)
        if not pooled:
            return 500, {"error": "embedding response missing vectors"}
        merged_vectors.append(pooled)

    return 200, {"model": model, "embeddings": merged_vectors}


async def _post_embed_with_fallback(body_json: Dict[str, Any]) -> Tuple[int, Optional[Dict[str, Any]]]:
    """
    First attempt pass-through /api/embed.
    If Ollama returns context-length errors, split long inputs and merge chunk vectors.
    """
    requested_model = _resolve_model(
        body_json.get("model"),
        ALLOWED_EMBED_MODEL_NAMES,
        "/api/embed",
        default_model=EMBEDDING_MODEL,
        required=True,
    )
    body_json = dict(body_json)
    body_json["model"] = _embedding_upstream_model(requested_model)
    inputs = _normalize_embed_inputs(_derive_input_value(body_json))
    model = requested_model
    base_payload = dict(body_json)
    base_payload.pop("input", None)
    base_payload.pop("prompt", None)
    base_payload["model"] = _embedding_upstream_model(model)

    prechunk_threshold = max(1, EMBED_PRECHUNK_THRESHOLD_CHARS)
    if inputs and any(len(item) > prechunk_threshold for item in inputs):
        return await _embed_with_chunking(base_payload, model, inputs)

    primary_status, primary_data, primary_text = await _post_embed_once(body_json)

    if (
        EMBED_FALLBACK_MODEL_ON_404
        and requested_model != EMBEDDING_MODEL
        and _is_model_not_found_error(primary_status, primary_data, primary_text)
    ):
        retry_payload = dict(body_json)
        retry_payload["model"] = _embedding_upstream_model(EMBEDDING_MODEL)
        retry_status, retry_data, retry_text = await _post_embed_once(retry_payload)
        if isinstance(retry_data, dict):
            retry_data["requested_model"] = requested_model
            retry_data["fallback_model_used"] = EMBEDDING_MODEL
            _embedding_response_with_public_model(retry_data, EMBEDDING_MODEL)
        if retry_status < 400:
            return retry_status, retry_data
        # Keep progressing to long-input fallback checks if applicable.
        primary_status, primary_data, primary_text = retry_status, retry_data, retry_text
        model = EMBEDDING_MODEL
        base_payload["model"] = _embedding_upstream_model(model)

    if not _is_chunk_retryable_error(primary_status, primary_data, primary_text):
        return primary_status, _embedding_response_with_public_model(primary_data, requested_model)

    if not inputs:
        return primary_status, primary_data

    status, chunked = await _embed_with_chunking(base_payload, model, inputs)
    if isinstance(chunked, dict):
        if isinstance(primary_data, dict):
            if primary_data.get("requested_model"):
                chunked["requested_model"] = primary_data.get("requested_model")
            if primary_data.get("fallback_model_used"):
                chunked["fallback_model_used"] = primary_data.get("fallback_model_used")
        return status, chunked
    return status, {"error": "embedding_failed"}


def cosine_similarity(vec_a: List[float], vec_b: List[float]) -> float:
    if not vec_a or not vec_b or len(vec_a) != len(vec_b):
        return 0.0
    dot = sum(a * b for a, b in zip(vec_a, vec_b))
    norm_a = math.sqrt(sum(a * a for a in vec_a))
    norm_b = math.sqrt(sum(b * b for b in vec_b))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


async def get_embedding(text: str, model: str) -> Optional[List[float]]:
    status, data = await get_embeddings([text], model)
    if status >= 400 or not isinstance(data, dict):
        return None
    vectors = extract_embedding_vectors(data)
    return vectors[0] if vectors else None


async def get_embeddings(texts: List[str], model: str) -> Tuple[int, Dict[str, Any]]:
    model = _resolve_model(
        model,
        ALLOWED_EMBED_MODEL_NAMES,
        "/api/embed",
        default_model=EMBEDDING_MODEL,
        required=True,
    )
    if not embed_client:
        return 500, {"error": "embed_client_not_initialized"}
    if not texts:
        return 200, {"model": model, "embeddings": []}

    dimensions = max(0, EMBEDDING_DIMENSIONS)
    resolved: List[Optional[List[float]]] = [None] * len(texts)
    uncached_texts: List[str] = []
    uncached_indexes: List[int] = []
    uncached_keys: List[str] = []
    cache_keys = [_embedding_cache_key(model, text, dimensions) for text in texts]
    cached_results = await cache_mget(cache_keys)

    for idx, text in enumerate(texts):
        key = cache_keys[idx]
        cached = cached_results[idx]
        if cached and isinstance(cached.get("embedding"), list):
            resolved[idx] = cached["embedding"]
            continue
        uncached_texts.append(text)
        uncached_indexes.append(idx)
        uncached_keys.append(key)

    upstream_data: Optional[Dict[str, Any]] = None
    if uncached_texts:
        upstream_payload: Dict[str, Any] = {"model": model}
        if dimensions > 0:
            upstream_payload["dimensions"] = dimensions
        upstream_payload["input"] = uncached_texts if len(uncached_texts) > 1 else uncached_texts[0]
        status, upstream_data = await _post_embed_with_fallback(upstream_payload)
        if status >= 400:
            if upstream_data is not None:
                return status, upstream_data
            return status, {"error": "embedding_failed"}

        vectors = extract_embedding_vectors(upstream_data)
        if len(vectors) != len(uncached_texts):
            return 502, {
                "error": "embedding_batch_mismatch",
                "requested": len(uncached_texts),
                "received": len(vectors),
            }

        for idx, vec, key in zip(uncached_indexes, vectors, uncached_keys):
            resolved[idx] = vec
            await cache_set(key, {"embedding": vec})

    if any(vec is None for vec in resolved):
        return 502, {"error": "embedding_resolution_incomplete"}

    response_payload: Dict[str, Any] = {
        "model": upstream_data.get("model", model) if isinstance(upstream_data, dict) else model,
        "embeddings": [vec for vec in resolved if vec is not None],
    }
    if dimensions > 0:
        response_payload["dimensions"] = dimensions
    if isinstance(upstream_data, dict):
        if upstream_data.get("requested_model"):
            response_payload["requested_model"] = upstream_data.get("requested_model")
        if upstream_data.get("fallback_model_used"):
            response_payload["fallback_model_used"] = upstream_data.get("fallback_model_used")
    return 200, response_payload


async def rerank_with_embeddings(query: str, documents: List[str], top_n: int):
    status, data = await get_embeddings([query] + documents, RERANK_MODEL)
    if status >= 400 or not isinstance(data, dict):
        raise HTTPException(status_code=500, detail="Failed to get query embedding")
    vectors = extract_embedding_vectors(data)
    if len(vectors) != len(documents) + 1:
        raise HTTPException(status_code=500, detail="Failed to get rerank embeddings")
    query_vec = vectors[0]
    scored: List[Tuple[int, float]] = []
    for idx, doc in enumerate(documents):
        doc_vec = vectors[idx + 1]
        score = cosine_similarity(query_vec, doc_vec)
        scored.append((idx, score))
    scored.sort(key=lambda x: x[1], reverse=True)
    return scored[:top_n]


async def rerank_with_generate(query: str, documents: List[str], top_n: int):
    if not rerank_client:
        raise HTTPException(status_code=500, detail="Rerank client not configured")
    semaphore = asyncio.Semaphore(max(1, RERANK_GENERATE_CONCURRENCY))

    async def score_document(idx: int, doc: str) -> Tuple[int, float]:
        prompt = (
            f"<Instruct>{RERANK_INSTRUCTION}</Instruct>\n"
            f"<Query>{query}</Query>\n"
            f"<Document>{doc}</Document>\n"
            "Respond with only a floating point relevance score between 0 and 1.\n"
            "<Score>"
        )
        body = {
            "model": RERANK_MODEL,
            "prompt": prompt,
            "stream": False,
            "options": {"temperature": 0},
        }
        async with semaphore:
            resp = await _request_upstream(
                rerank_client,
                "POST",
                "/api/generate",
                route="/api/rerank",
                json_body=body,
            )
        if resp.status_code >= 400:
            raise HTTPException(
                status_code=resp.status_code,
                detail=_parse_response_payload(resp) or {"error": "rerank_generate_failed"},
            )
        data = _parse_response_payload(resp) or {}
        text = (data.get("response") or "").strip()
        match = re.search(r"[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?", text)
        try:
            score = float(match.group(0)) if match else 0.0
        except Exception:
            score = 0.0
        score = min(1.0, max(0.0, score))
        return idx, score

    scored = list(await asyncio.gather(*(score_document(idx, doc) for idx, doc in enumerate(documents))))
    scored.sort(key=lambda x: x[1], reverse=True)
    return scored[:top_n]


async def rerank_documents(query: str, documents: List[str]) -> List[Tuple[int, float]]:
    if not documents:
        return []
    cache_key = _hash_key(["rerank", RERANK_MODEL, RERANK_STRATEGY, query] + documents)
    cached = await cache_get(cache_key)
    scored = _deserialize_scored_results(cached)
    if scored is None:
        if RERANK_STRATEGY == "generate":
            scored = await rerank_with_generate(query, documents, len(documents))
        else:
            scored = await rerank_with_embeddings(query, documents, len(documents))
        await cache_set(cache_key, _serialize_scored_results(scored))
    return scored


async def _maybe_rerank_hits(query: str, hits: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    if not hits or not query.strip() or not _normalize_model_name(RERANK_MODEL):
        return hits

    documents = [_coerce_to_text(hit.get("text")) for hit in hits]
    try:
        scored = await rerank_documents(query, documents)
    except Exception as e:
        print(f"[RERANK] knowledge rerank failed: {e}")
        return hits

    reranked_hits: List[Dict[str, Any]] = []
    for idx, score in scored:
        if idx < 0 or idx >= len(hits):
            continue
        hit = dict(hits[idx])
        hit["rerank_score"] = float(score)
        reranked_hits.append(hit)
    return reranked_hits or hits


# --- Explicit Ollama endpoints ----------------------------------------------

@app.get("/api/tags")
async def api_tags():
    payloads = await asyncio.gather(*(_fetch_tags_payload(client) for client in _catalog_clients()))
    models = _merge_models(list(payloads))
    models = _filter_models(models, PUBLIC_MODEL_NAMES)
    return JSONResponse(
        content={"models": models},
        status_code=200,
        headers=_degraded_catalog_headers(list(payloads)),
    )


@app.get("/api/ps")
async def api_ps():
    payloads = await asyncio.gather(*(_fetch_ps_payload(client) for client in _catalog_clients()))
    models = _merge_models(list(payloads))
    models = _filter_models(models, ALLOWED_SHOW_MODEL_NAMES)
    return JSONResponse(
        content={"models": models},
        status_code=200,
        headers=_degraded_catalog_headers(list(payloads)),
    )


@app.get("/v1/models")
async def v1_models():
    payloads = await asyncio.gather(*(_fetch_tags_payload(client) for client in _catalog_clients()))
    models = _merge_models(list(payloads))
    models = _filter_models(models, PUBLIC_MODEL_NAMES)
    return JSONResponse(
        content=_openai_models_payload(models),
        status_code=200,
        headers=_degraded_catalog_headers(list(payloads)),
    )


@app.post("/api/show")
async def api_show(request: Request):
    _, body_json = await _read_json_request(request, "SHOW_REQ")
    model = body_json.get("name")
    if model:
        _validate_max_chars(_coerce_to_text(model), SHOW_MAX_NAME_CHARS, "name")
    model = _resolve_model(model, ALLOWED_SHOW_MODEL_NAMES, "/api/show", required=True)
    body_json["name"] = model
    client = _select_client_for_model(model)
    resp = await _request_upstream(
        client,
        "POST",
        "/api/show",
        route="/api/show",
        json_body=body_json,
        headers=_upstream_headers(request),
    )
    response_json = _parse_response_payload(resp)

    await log_to_postgres(
        route="/api/show",
        method="POST",
        model=model,
        status=resp.status_code,
        request_json=body_json,
        response_json=response_json,
    )

    return Response(
        content=resp.content,
        status_code=resp.status_code,
        headers=_proxied_response_headers(resp.headers, client),
    )


@app.post("/api/chat")
async def api_chat(request: Request):
    _, body_json = await _read_json_request(request, "CHAT_REQ")
    _validate_chat_payload(body_json)
    _validate_requested_num_ctx(body_json)
    stream = body_json.get("stream", False)
    model = _resolve_model(
        body_json.get("model"),
        ALLOWED_CHAT_MODEL_NAMES,
        "/api/chat",
        default_model=DEFAULT_CHAT_MODEL,
        required=True,
    )
    body_json["model"] = model
    client = _select_client_for_model(model)
    upstream_headers = _upstream_headers(request)

    if stream:
        return await _stream_post_or_error(
            client,
            "/api/chat",
            body_json,
            "/api/chat",
            model,
            body_json,
            success_log_response_json={"stream": True},
            upstream_headers=upstream_headers,
        )

    resp = await _request_upstream(
        client,
        "POST",
        "/api/chat",
        route="/api/chat",
        json_body=body_json,
        headers=upstream_headers,
    )
    await maybe_log_body("CHAT_RESP", resp.text)
    resp_json = _parse_response_payload(resp)

    await log_to_postgres(
        route="/api/chat",
        method="POST",
        model=model,
        status=resp.status_code,
        request_json=body_json,
        response_json=resp_json,
    )

    return Response(
        content=resp.content,
        status_code=resp.status_code,
        headers=_proxied_response_headers(resp.headers, client),
    )


@app.post("/api/generate")
async def api_generate(request: Request):
    _, body_json = await _read_json_request(request, "GEN_REQ")
    _validate_generate_payload(body_json)
    _validate_requested_num_ctx(body_json)
    stream = body_json.get("stream", False)
    model = _resolve_model(
        body_json.get("model"),
        ALLOWED_CHAT_MODEL_NAMES,
        "/api/generate",
        default_model=DEFAULT_CHAT_MODEL,
        required=True,
    )
    body_json["model"] = model
    client = _select_client_for_model(model)
    upstream_headers = _upstream_headers(request)

    if stream:
        return await _stream_post_or_error(
            client,
            "/api/generate",
            body_json,
            "/api/generate",
            model,
            body_json,
            success_log_response_json={"stream": True},
            upstream_headers=upstream_headers,
        )

    resp = await _request_upstream(
        client,
        "POST",
        "/api/generate",
        route="/api/generate",
        json_body=body_json,
        headers=upstream_headers,
    )
    await maybe_log_body("GEN_RESP", resp.text)
    resp_json = _parse_response_payload(resp)

    await log_to_postgres(
        route="/api/generate",
        method="POST",
        model=model,
        status=resp.status_code,
        request_json=body_json,
        response_json=resp_json,
    )

    return Response(
        content=resp.content,
        status_code=resp.status_code,
        headers=_proxied_response_headers(resp.headers, client),
    )


@app.post("/v1/chat/completions")
async def v1_chat_completions(request: Request):
    _, body_json = await _read_json_request(request, "V1_CHAT_REQ")
    _validate_chat_payload(body_json)
    _validate_requested_num_ctx(body_json)
    stream = body_json.get("stream", False)
    model = _resolve_model(
        body_json.get("model"),
        ALLOWED_CHAT_MODEL_NAMES,
        "/v1/chat/completions",
        default_model=DEFAULT_CHAT_MODEL,
        required=True,
    )
    body_json["model"] = model
    client = _select_client_for_model(model)
    upstream_headers = _upstream_headers(request)

    if stream:
        return await _stream_post_or_error(
            client,
            "/v1/chat/completions",
            body_json,
            "/v1/chat/completions",
            model,
            body_json,
            success_log_response_json={"stream": True},
            upstream_headers=upstream_headers,
        )

    resp = await _request_upstream(
        client,
        "POST",
        "/v1/chat/completions",
        route="/v1/chat/completions",
        json_body=body_json,
        headers=upstream_headers,
    )
    await maybe_log_body("V1_CHAT_RESP", resp.text)
    resp_json = _parse_response_payload(resp)

    await log_to_postgres(
        route="/v1/chat/completions",
        method="POST",
        model=model,
        status=resp.status_code,
        request_json=body_json,
        response_json=resp_json,
    )

    return Response(
        content=resp.content,
        status_code=resp.status_code,
        headers=_proxied_response_headers(resp.headers, client),
    )


@app.post("/v1/completions")
async def v1_completions(request: Request):
    _, body_json = await _read_json_request(request, "V1_COMP_REQ")
    _validate_generate_payload(body_json)
    _validate_requested_num_ctx(body_json)
    stream = body_json.get("stream", False)
    model = _resolve_model(
        body_json.get("model"),
        ALLOWED_CHAT_MODEL_NAMES,
        "/v1/completions",
        default_model=DEFAULT_CHAT_MODEL,
        required=True,
    )
    body_json["model"] = model
    client = _select_client_for_model(model)
    upstream_headers = _upstream_headers(request)

    if stream:
        return await _stream_post_or_error(
            client,
            "/v1/completions",
            body_json,
            "/v1/completions",
            model,
            body_json,
            success_log_response_json={"stream": True},
            upstream_headers=upstream_headers,
        )

    resp = await _request_upstream(
        client,
        "POST",
        "/v1/completions",
        route="/v1/completions",
        json_body=body_json,
        headers=upstream_headers,
    )
    await maybe_log_body("V1_COMP_RESP", resp.text)
    resp_json = _parse_response_payload(resp)

    await log_to_postgres(
        route="/v1/completions",
        method="POST",
        model=model,
        status=resp.status_code,
        request_json=body_json,
        response_json=resp_json,
    )

    return Response(
        content=resp.content,
        status_code=resp.status_code,
        headers=_proxied_response_headers(resp.headers, client),
    )


@app.post("/api/embeddings")
async def api_embeddings(request: Request):
    """
    Legacy Ollama embeddings endpoint compatibility.
    We route to /api/embed upstream because it is more robust for longer inputs,
    then normalize back to {"embedding": [...]} shape for legacy clients.
    """
    _, request_json = await _read_json_request(request, "EMB_REQ")
    body_json = normalize_embedding_body(request_json, mode="embed")
    requested_model = _resolve_model(
        body_json.get("model"),
        ALLOWED_EMBED_MODEL_NAMES,
        "/api/embeddings",
        default_model=EMBEDDING_MODEL,
        required=True,
    )
    body_json["model"] = requested_model

    status, data = await _post_embed_with_fallback(body_json)
    await maybe_log_body("EMB_RESP", json.dumps(data, ensure_ascii=False) if data is not None else "")

    # Try to extract vector(s) and upsert in Qdrant
    try:
        input_texts = _normalize_embed_inputs(_derive_input_value(body_json))
        vectors = extract_embedding_vectors(data)
        await _maybe_index_embedding_vectors("/api/embeddings", requested_model, input_texts, vectors)
    except Exception as e:
        print(f"[EMB_QDRANT] indexing error: {e}")

    await log_to_postgres(
        route="/api/embeddings",
        method="POST",
        model=requested_model,
        status=status,
        request_json=body_json,
        response_json=data,
    )

    if data is None:
        return JSONResponse(content={"error": "embedding_failed"}, status_code=status)

    # Keep /api/embeddings response compatible with legacy Ollama clients.
    vectors = extract_embedding_vectors(data)
    if vectors:
        compat = {
            "embedding": vectors[0],
            "embeddings": vectors,
            "model": data.get("model", requested_model),
        }
        if isinstance(data, dict) and data.get("fallback_model_used"):
            compat["fallback_model_used"] = data.get("fallback_model_used")
            compat["requested_model"] = data.get("requested_model", requested_model)
        return JSONResponse(content=compat, status_code=status)

    return JSONResponse(content=data, status_code=status)


@app.post("/api/embed")
async def api_embed(request: Request):
    """
    Modern Ollama embedding endpoint.
    Routes to the central embedder and honors client model.
    """
    _, request_json = await _read_json_request(request, "EMBED_REQ")
    body_json = normalize_embedding_body(request_json, mode="embed")
    requested_model = _resolve_model(
        body_json.get("model"),
        ALLOWED_EMBED_MODEL_NAMES,
        "/api/embed",
        default_model=EMBEDDING_MODEL,
        required=True,
    )
    body_json["model"] = requested_model
    status, data = await _post_embed_with_fallback(body_json)
    await maybe_log_body("EMBED_RESP", json.dumps(data, ensure_ascii=False) if data is not None else "")

    try:
        input_texts = _normalize_embed_inputs(_derive_input_value(body_json))
        vectors = extract_embedding_vectors(data)
        await _maybe_index_embedding_vectors("/api/embed", requested_model, input_texts, vectors)
    except Exception as e:
        print(f"[EMBED_QDRANT] indexing error: {e}")

    await log_to_postgres(
        route="/api/embed",
        method="POST",
        model=requested_model,
        status=status,
        request_json=body_json,
        response_json=data,
    )

    if data is not None:
        return JSONResponse(content=data, status_code=status)
    return JSONResponse(content={"error": "embedding_failed"}, status_code=status)


@app.post("/v1/embeddings")
async def v1_embeddings(request: Request):
    """
    OpenAI-compatible embeddings route.
    """
    _, incoming = await _read_json_request(request, "V1_EMBED_REQ")
    input_value = incoming.get("input")
    incoming_model = incoming.get("model")
    if input_value is None and incoming.get("prompt") is not None:
        input_value = incoming.get("prompt")
    if input_value is None:
        raise HTTPException(status_code=400, detail="input is required")

    upstream_payload = {"input": input_value}
    if incoming_model is not None:
        upstream_payload["model"] = incoming_model
    upstream_body = normalize_embedding_body(upstream_payload, mode="embed")
    requested_model = _resolve_model(
        upstream_body.get("model"),
        ALLOWED_EMBED_MODEL_NAMES,
        "/v1/embeddings",
        default_model=EMBEDDING_MODEL,
        required=True,
    )
    upstream_body["model"] = requested_model
    status, data = await _post_embed_with_fallback(upstream_body)

    if status >= 400:
        if data is not None:
            return JSONResponse(content=data, status_code=status)
        return JSONResponse(content={"error": "embedding_failed"}, status_code=status)

    vectors = extract_embedding_vectors(data)
    openai_data = [
        {"object": "embedding", "index": idx, "embedding": vec}
        for idx, vec in enumerate(vectors)
    ]
    response_payload = {
        "object": "list",
        "data": openai_data,
        "model": data.get("model", requested_model) if isinstance(data, dict) else requested_model,
        "usage": {"prompt_tokens": 0, "total_tokens": 0},
    }

    try:
        input_texts = _normalize_embed_inputs(input_value)
        await _maybe_index_embedding_vectors("/v1/embeddings", requested_model, input_texts, vectors)
    except Exception as e:
        print(f"[V1_EMBED_QDRANT] indexing error: {e}")

    await log_to_postgres(
        route="/v1/embeddings",
        method="POST",
        model=requested_model,
        status=status,
        request_json=incoming,
        response_json=response_payload,
    )

    return JSONResponse(content=response_payload, status_code=status)


@app.post("/api/knowledge/upsert")
async def api_knowledge_upsert(request: Request):
    """
    Upsert one or many text documents into the shared knowledge collection.
    Payload:
      {
        "text": "single doc" | "input": "single doc",
        "texts": ["doc1", "doc2"] | "documents": [...],
        "ids": ["optional-id-1", ...],
        "metadata": {...},
        "namespace": "optional-group",
        "model": "optional-embed-model"
      }
    """
    _, body_json = await _read_json_request(request, "KNOWLEDGE_UPSERT_REQ")
    _require_knowledge_backend()

    source_value: Any = None
    for key in ("texts", "documents", "input", "text", "content", "query"):
        if body_json.get(key) is not None:
            source_value = body_json.get(key)
            break
    input_texts = _normalize_embed_inputs(source_value)
    if not input_texts:
        raise HTTPException(status_code=400, detail="text or texts is required")
    if len(input_texts) > KNOWLEDGE_MAX_INPUTS:
        raise HTTPException(status_code=413, detail=f"too many texts; max {KNOWLEDGE_MAX_INPUTS}")
    _validate_total_chars(input_texts, KNOWLEDGE_MAX_TOTAL_CHARS, "knowledge input")

    model = _resolve_model(
        body_json.get("model"),
        ALLOWED_EMBED_MODEL_NAMES,
        "/api/knowledge/upsert",
        default_model=EMBEDDING_MODEL,
        required=True,
    )
    metadata = body_json.get("metadata")
    namespace = body_json.get("namespace")
    requested_ids = body_json.get("ids")
    if not isinstance(metadata, dict):
        metadata = {}
    if not isinstance(namespace, str):
        namespace = None
    if not isinstance(requested_ids, list):
        requested_ids = []

    points: List[Dict[str, Any]] = []
    inserted_ids: List[str] = []

    status, data = await get_embeddings(input_texts, model)
    if status >= 400:
        return JSONResponse(content=data, status_code=status)
    vectors = extract_embedding_vectors(data)
    if len(vectors) != len(input_texts):
        return JSONResponse(content={"error": "embedding response missing vectors"}, status_code=500)

    for idx, text in enumerate(input_texts):
        point_id = str(requested_ids[idx]) if idx < len(requested_ids) and requested_ids[idx] else str(uuid.uuid4())
        payload: Dict[str, Any] = {
            "text": text[:KNOWLEDGE_TEXT_MAX_CHARS],
            "metadata": metadata,
            "source": "knowledge_api",
            "model": model,
        }
        if namespace:
            payload["namespace"] = namespace

        points.append({
            "id": point_id,
            "vector": vectors[idx],
            "payload": payload,
        })
        inserted_ids.append(point_id)

    ok = await qdrant_upsert_points(points)
    if not ok:
        return JSONResponse(
            content={"error": "knowledge_upsert_failed", "collection": QDRANT_COLLECTION},
            status_code=500,
        )

    response_payload = {
        "status": "ok",
        "count": len(inserted_ids),
        "ids": inserted_ids,
        "model": model,
        "vector_dim": len(points[0]["vector"]) if points else 0,
        "collection": QDRANT_COLLECTION,
    }
    await log_to_postgres(
        route="/api/knowledge/upsert",
        method="POST",
        model=model,
        status=200,
        request_json=body_json,
        response_json=response_payload,
    )
    return JSONResponse(content=response_payload, status_code=200)


@app.post("/api/knowledge/search")
async def api_knowledge_search(request: Request):
    """
    Semantic search over the shared knowledge collection.
    Payload:
      {
        "query": "text",
        "top_k": 5,
        "namespace": "optional-group",
        "model": "optional-embed-model"
      }
    """
    _, body_json = await _read_json_request(request, "KNOWLEDGE_SEARCH_REQ")
    _require_knowledge_backend()

    query = _coerce_to_text(body_json.get("query") or body_json.get("text") or "")
    if not query.strip():
        raise HTTPException(status_code=400, detail="query is required")
    _validate_max_chars(query, KNOWLEDGE_QUERY_MAX_CHARS, "query")

    raw_top_k = body_json.get("top_k")
    top_k = _parse_int_field(KNOWLEDGE_TOP_K_DEFAULT if raw_top_k is None else raw_top_k, "top_k")
    top_k = max(1, min(top_k, 50))
    namespace = body_json.get("namespace")
    model = _resolve_model(
        body_json.get("model"),
        ALLOWED_EMBED_MODEL_NAMES,
        "/api/knowledge/search",
        default_model=EMBEDDING_MODEL,
        required=True,
    )

    status, data = await _post_embed_with_fallback({"model": model, "input": query})
    if status >= 400:
        if data is None:
            return JSONResponse(content={"error": "embedding_failed"}, status_code=status)
        return JSONResponse(content=data, status_code=status)

    vectors = extract_embedding_vectors(data)
    if not vectors:
        return JSONResponse(content={"error": "embedding response missing vectors"}, status_code=500)

    raw_hits = await qdrant_search(vectors[0], limit=max(top_k * 3, top_k))
    hits: List[Dict[str, Any]] = []
    for item in raw_hits:
        if not isinstance(item, dict):
            continue
        payload = item.get("payload") if isinstance(item.get("payload"), dict) else {}
        if namespace and payload.get("namespace") != namespace:
            continue
        hits.append({
            "id": item.get("id"),
            "score": item.get("score"),
            "text": payload.get("text"),
            "metadata": payload.get("metadata"),
            "payload": payload,
        })
        if len(hits) >= max(top_k * 3, top_k):
            break

    hits = await _maybe_rerank_hits(query, hits)
    hits = hits[:top_k]

    response_payload = {
        "query": query,
        "model": model,
        "top_k": top_k,
        "count": len(hits),
        "results": hits,
        "collection": QDRANT_COLLECTION,
    }
    await log_to_postgres(
        route="/api/knowledge/search",
        method="POST",
        model=model,
        status=200,
        request_json=body_json,
        response_json=response_payload,
    )
    return JSONResponse(content=response_payload, status_code=200)


@app.post("/api/knowledge/chat")
async def api_knowledge_chat(request: Request):
    """
    Chat with retrieval-augmented context from Qdrant knowledge memory.
    Payload:
      {
        "model": "gpt-oss:20b",
        "messages": [...],
        "top_k": 5,
        "knowledge_query": "optional explicit retrieval query",
        "namespace": "optional-group",
        "stream": false
      }
    """
    _, body_json = await _read_json_request(request, "KNOWLEDGE_CHAT_REQ")
    _require_knowledge_backend()

    _validate_chat_payload(body_json)
    _validate_requested_num_ctx(body_json)
    model = _resolve_model(
        body_json.get("model"),
        ALLOWED_CHAT_MODEL_NAMES,
        "/api/knowledge/chat",
        default_model=DEFAULT_CHAT_MODEL,
        required=True,
    )
    body_json["model"] = model
    messages = body_json.get("messages")
    if not isinstance(messages, list) or not messages:
        raise HTTPException(status_code=400, detail="messages is required")
    client = _select_client_for_model(model)
    upstream_headers = _upstream_headers(request)

    raw_top_k = body_json.get("top_k")
    top_k = _parse_int_field(KNOWLEDGE_TOP_K_DEFAULT if raw_top_k is None else raw_top_k, "top_k")
    top_k = max(1, min(top_k, 20))
    namespace = body_json.get("namespace")
    query = _coerce_to_text(body_json.get("knowledge_query") or _extract_last_user_text(messages))
    if query.strip():
        _validate_max_chars(query, KNOWLEDGE_QUERY_MAX_CHARS, "knowledge_query")

    context_hits: List[Dict[str, Any]] = []
    candidate_hits: List[Dict[str, Any]] = []
    if query.strip():
        status, emb_data = await _post_embed_with_fallback({"model": EMBEDDING_MODEL, "input": query})
        if status < 400:
            emb_vectors = extract_embedding_vectors(emb_data)
            if emb_vectors:
                raw_hits = await qdrant_search(emb_vectors[0], limit=max(top_k * 3, top_k))
                for item in raw_hits:
                    if not isinstance(item, dict):
                        continue
                    payload = item.get("payload") if isinstance(item.get("payload"), dict) else {}
                    if namespace and payload.get("namespace") != namespace:
                        continue
                    text = payload.get("text")
                    if not isinstance(text, str) or not text.strip():
                        continue
                    candidate_hits.append({
                        "id": item.get("id"),
                        "score": item.get("score"),
                        "text": text,
                        "metadata": payload.get("metadata"),
                    })
                    if len(candidate_hits) >= max(top_k * 3, top_k):
                        break
                context_hits = await _maybe_rerank_hits(query, candidate_hits)
                context_hits = context_hits[:top_k]

    augmented_messages = list(messages)
    if context_hits:
        context_lines = []
        for i, hit in enumerate(context_hits, start=1):
            text = (hit.get("text") or "").strip()
            score = hit.get("score")
            context_lines.append(f"[{i}] (score={score}) {text}")
        context_block = "Knowledge context (most relevant first):\n" + "\n".join(context_lines)

        system_msg = {"role": "system", "content": context_block}
        if augmented_messages and isinstance(augmented_messages[0], dict) and augmented_messages[0].get("role") == "system":
            first_content = _coerce_to_text(augmented_messages[0].get("content"))
            augmented_messages[0] = {
                "role": "system",
                "content": f"{first_content}\n\n{context_block}",
            }
        else:
            augmented_messages = [system_msg] + augmented_messages

    stream = bool(body_json.get("stream", False))
    upstream_payload = dict(body_json)
    upstream_payload["messages"] = augmented_messages
    upstream_payload.pop("top_k", None)
    upstream_payload.pop("knowledge_query", None)
    upstream_payload.pop("namespace", None)

    if stream:
        return await _stream_post_or_error(
            client,
            "/api/chat",
            upstream_payload,
            "/api/knowledge/chat",
            model,
            body_json,
            success_log_response_json={"context_hits": context_hits, "stream": True},
            upstream_headers=upstream_headers,
        )

    resp = await _request_upstream(
        client,
        "POST",
        "/api/chat",
        route="/api/knowledge/chat",
        json_body=upstream_payload,
        headers=upstream_headers,
    )
    resp_json = _parse_response_payload(resp) or {}

    if isinstance(resp_json, dict):
        resp_json["knowledge"] = {
            "hits": context_hits,
            "count": len(context_hits),
        }

    await log_to_postgres(
        route="/api/knowledge/chat",
        method="POST",
        model=model,
        status=resp.status_code,
        request_json=body_json,
        response_json=resp_json if isinstance(resp_json, dict) else None,
    )
    return JSONResponse(
        content=resp_json,
        status_code=resp.status_code,
        headers={"x-ollama-proxy-upstream": _client_label(client)},
    )


@app.post("/api/rerank")
async def api_rerank(request: Request):
    """
    Rerank endpoint (proxy-defined).
    Payload:
      {
        "query": "string",
        "documents": ["doc1", "doc2", ...],
        "top_n": 5,
        "return_documents": true
      }
    """
    _, body_json = await _read_json_request(request, "RERANK_REQ")

    query = body_json.get("query") or body_json.get("prompt")
    documents = body_json.get("documents") or body_json.get("inputs")
    raw_top_n = body_json.get("top_n")
    if raw_top_n is None:
        raw_top_n = body_json.get("topN")
    if raw_top_n is None:
        raw_top_n = RERANK_TOP_N_DEFAULT
    return_docs = bool(body_json.get("return_documents", True))

    if not query or not documents:
        raise HTTPException(status_code=400, detail="query and documents are required")
    if not isinstance(documents, list):
        raise HTTPException(status_code=400, detail="documents must be a list")

    query = _coerce_to_text(query)
    _validate_max_chars(query, RERANK_MAX_QUERY_CHARS, "query")
    documents = [str(d) for d in documents][:RERANK_MAX_DOCS]
    _validate_total_chars([query] + documents, RERANK_MAX_TOTAL_CHARS, "rerank input")
    top_n = max(1, min(_parse_int_field(raw_top_n, "top_n"), len(documents)))

    scored = await rerank_documents(query, documents)

    results = []
    for idx, score in scored[:top_n]:
        entry = {"index": idx, "relevance_score": float(score)}
        if return_docs:
            entry["document"] = documents[idx]
        results.append(entry)

    response = {
        "model": RERANK_MODEL,
        "query": query,
        "results": results
    }

    await log_to_postgres(
        route="/api/rerank",
        method="POST",
        model=RERANK_MODEL,
        status=200,
        request_json=body_json,
        response_json=response,
    )

    return JSONResponse(content=response, status_code=200)


# --- Catch-all passthrough for other /api/* endpoints -----------------------

@app.api_route("/api/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"])
async def api_passthrough(request: Request, path: str):
    """
    Covers:
      /api/pull, /api/create, /api/delete, /api/ps, etc.
    """
    # already explicitly handled
    if path in ("chat", "generate", "embed", "embeddings", "show", "tags", "ps"):
        raise HTTPException(status_code=404, detail="Handled by specific route")
    if not ALLOW_ADMIN_PASSTHROUGH and request.method in ("POST", "PUT", "DELETE"):
        raise HTTPException(
            status_code=403,
            detail="admin passthrough is disabled; set ALLOW_ADMIN_PASSTHROUGH=1 to enable",
        )

    method = request.method
    query_items = [
        (key, value)
        for key, value in request.query_params.multi_items()
        if key != "target"
    ]
    upstream_path = f"/api/{path}"
    if query_items:
        upstream_path = f"{upstream_path}?{urlencode(query_items, doseq=True)}"

    request_label = f"API_{path.replace('/', '_').upper()}_REQ"
    body = await _read_request_body(request, request_label if request.method != "GET" else None)
    body_json: Optional[Dict[str, Any]] = None
    if body and "application/json" in request.headers.get("content-type", "").lower():
        try:
            parsed = json.loads(body)
            if isinstance(parsed, dict):
                body_json = parsed
        except Exception:
            body_json = None

    client = _resolve_passthrough_client(request, body_json)
    forwarded_body_json = body_json
    if isinstance(body_json, dict) and "target" in body_json:
        forwarded_body_json = dict(body_json)
        forwarded_body_json.pop("target", None)
        body = json.dumps(forwarded_body_json).encode("utf-8")
    passthrough_model = None
    if isinstance(forwarded_body_json, dict):
        passthrough_model = forwarded_body_json.get("model") or forwarded_body_json.get("name")
    if _is_direct_channel_stream_request(method, upstream_path, forwarded_body_json):
        return await _stream_upstream_or_error(
            client=client,
            method=method,
            path=upstream_path,
            route=f"/api/{path}",
            model=passthrough_model,
            request_json=forwarded_body_json if isinstance(forwarded_body_json, dict) else None,
            upstream_headers=_upstream_headers(request),
            content=body if body else None,
        )
    resp = await _request_upstream(
        client,
        method,
        upstream_path,
        route=f"/api/{path}",
        content=body if body else None,
        headers=_upstream_headers(request),
    )

    # We don't log every aux endpoint to Postgres by default to keep noise down,
    # but you could add log_to_postgres here if you want complete tracing.

    return Response(
        content=resp.content,
        status_code=resp.status_code,
        headers=_proxied_response_headers(resp.headers, client),
    )


# --- Health check -----------------------------------------------------------

def _missing_configured_models(
    available_models: Set[str],
    configured_models: Set[str],
) -> List[str]:
    return sorted(
        model
        for model in configured_models
        if model and model not in available_models
    )


@app.get("/health")
async def health():
    r = await _request_upstream(
        ollama_client,
        "GET",
        "/api/tags",
        route="/health",
        timeout=HEALTH_TAGS_TIMEOUT_SEC,
    )
    if r.status_code >= 400:
        raise HTTPException(
            status_code=500,
            detail={"error": "general_healthcheck_failed", "status": r.status_code},
        )
    data = _parse_response_payload(r)
    available_models = _available_model_names(data)
    configured_models = {name for name in GENERAL_MODEL_NAMES if name}
    missing_models = _missing_configured_models(available_models, configured_models)
    if missing_models:
        raise HTTPException(
            status_code=500,
            detail={
                "error": "general_models_missing",
                "configured_models": sorted(configured_models),
                "missing_models": missing_models,
                "available_models": sorted(available_models),
            },
        )
    rerank_summary: Optional[Dict[str, Any]] = None
    normalized_rerank_model = _normalize_model_name(RERANK_MODEL)
    normalized_embed_model = _normalize_model_name(EMBEDDING_MODEL)
    if normalized_rerank_model and (
        RERANK_STRATEGY == "generate" or normalized_rerank_model != normalized_embed_model
    ):
        rerank_status = await health_rerank()
        rerank_summary = {
            "strategy": rerank_status.get("strategy"),
            "model": rerank_status.get("model"),
            "rerank_base_url": rerank_status.get("rerank_base_url"),
        }

    response = {
        "status": "ok",
        "general_base_url": OLLAMA_BASE_URL,
        "model": GENERAL_MODEL_NAME,
        "configured_models": sorted(configured_models),
        "available_model_count": len(available_models),
    }
    if rerank_summary is not None:
        response["rerank"] = rerank_summary
    return response


@app.get("/health/code")
async def health_code():
    if code_client is None:
        raise HTTPException(status_code=500, detail="code client not initialized")
    r = await _request_upstream(
        code_client,
        "GET",
        "/api/tags",
        route="/health/code",
        timeout=HEALTH_TAGS_TIMEOUT_SEC,
    )
    if r.status_code >= 400:
        raise HTTPException(
            status_code=500,
            detail={"error": "code_healthcheck_failed", "status": r.status_code},
        )
    data = _parse_response_payload(r)
    available_models = _available_model_names(data)
    configured_models = {name for name in CODE_MODEL_NAMES if name}
    missing_models = _missing_configured_models(available_models, configured_models)
    if missing_models:
        raise HTTPException(
            status_code=500,
            detail={
                "error": "code_models_missing",
                "configured_models": sorted(configured_models),
                "missing_models": missing_models,
                "available_models": sorted(available_models),
            },
        )
    return {
        "status": "ok",
        "code_base_url": CODE_OLLAMA_BASE_URL,
        "configured_models": sorted(configured_models),
        "available_model_count": len(available_models),
    }


@app.get("/health/embed")
async def health_embed():
    if embed_client is None:
        raise HTTPException(status_code=500, detail="embed client not initialized")
    resp = await _request_upstream(
        embed_client,
        "GET",
        "/api/tags",
        route="/health/embed",
        timeout=HEALTH_EMBED_TIMEOUT_SEC,
    )
    status = resp.status_code
    data = _parse_response_payload(resp)
    if status >= 400 or not isinstance(data, dict):
        raise HTTPException(
            status_code=500,
            detail={
                "error": "embed_healthcheck_failed",
                "status": status,
                "detail": data,
            },
        )
    available_models = _available_model_names(data)
    configured_models = {name for name in EMBEDDING_MODEL_NAMES if name}
    missing_models = sorted(
        model
        for model in configured_models
        if _normalize_model_name(_embedding_upstream_model(model)) not in available_models
    )
    if missing_models:
        raise HTTPException(
            status_code=500,
            detail={
                "error": "embed_models_missing",
                "configured_models": sorted(configured_models),
                "upstream_model": EMBEDDING_UPSTREAM_MODEL,
                "missing_models": missing_models,
                "available_models": sorted(available_models),
            },
        )
    return {
        "status": "ok",
        "embed_base_url": EMBEDDING_OLLAMA_BASE_URL,
        "model": EMBEDDING_MODEL,
        "configured_models": sorted(configured_models),
        "upstream_model": EMBEDDING_UPSTREAM_MODEL,
        "available_model_count": len(available_models),
    }


@app.get("/health/rerank")
async def health_rerank():
    client = rerank_client if RERANK_STRATEGY == "generate" else (rerank_client or embed_client)
    if client is None:
        raise HTTPException(status_code=500, detail="rerank client not initialized")
    resp = await _request_upstream(
        client,
        "GET",
        "/api/tags",
        route="/health/rerank",
        timeout=HEALTH_RERANK_TIMEOUT_SEC,
    )
    status = resp.status_code
    data = _parse_response_payload(resp)
    if status >= 400 or not isinstance(data, dict):
        raise HTTPException(
            status_code=500,
            detail={
                "error": "rerank_healthcheck_failed",
                "status": status,
                "detail": data,
            },
        )
    available_models = _available_model_names(data)
    normalized_model = _normalize_model_name(RERANK_MODEL)
    if normalized_model and normalized_model not in available_models:
        raise HTTPException(
            status_code=500,
            detail={
                "error": "rerank_model_missing",
                "model": RERANK_MODEL,
                "available_models": sorted(available_models),
            },
        )
    return {
        "status": "ok",
        "strategy": RERANK_STRATEGY,
        "rerank_base_url": RERANK_OLLAMA_BASE_URL,
        "model": RERANK_MODEL,
        "available_model_count": len(available_models),
    }


@app.get("/health/knowledge")
async def health_knowledge():
    _require_knowledge_backend()
    if qdrant_client is None:
        raise HTTPException(status_code=500, detail="qdrant client not initialized")
    resp = await qdrant_client.get(f"/collections/{QDRANT_COLLECTION}")
    status = resp.status_code
    data = _parse_response_payload(resp)
    if status >= 400 or not isinstance(data, dict):
        raise HTTPException(
            status_code=500,
            detail={
                "error": "knowledge_healthcheck_failed",
                "status": status,
                "detail": data,
            },
        )
    result = data.get("result") if isinstance(data.get("result"), dict) else {}
    config = result.get("config") if isinstance(result.get("config"), dict) else {}
    params = config.get("params") if isinstance(config.get("params"), dict) else {}
    vectors = params.get("vectors")
    if isinstance(vectors, dict) and "size" in vectors:
        vector_size = vectors.get("size")
        distance = vectors.get("distance")
    else:
        vector_size = None
        distance = None
    return {
        "status": "ok",
        "qdrant_url": QDRANT_URL,
        "collection": QDRANT_COLLECTION,
        "vector_size": vector_size,
        "distance": distance,
        "points_count": result.get("points_count"),
        "indexed_vectors_count": result.get("indexed_vectors_count"),
    }


def _require_knowledge_backend():
    if qdrant_client and QDRANT_COLLECTION:
        return
    raise HTTPException(
        status_code=503,
        detail={
            "error": "knowledge_backend_not_configured",
            "qdrant_url_configured": bool(QDRANT_URL),
            "qdrant_collection_configured": bool(QDRANT_COLLECTION),
        },
    )


async def _direct_channel_health_payload(target: str) -> Dict[str, Any]:
    if target == "general":
        return await health()
    if target == "code":
        return await health_code()
    if target == "embed":
        return await health_embed()
    if target == "rerank":
        return await health_rerank()
    raise HTTPException(status_code=404, detail="unknown channel")


@app.get("/general")
@app.get("/general/")
async def direct_general_info():
    return _direct_channel_info_response("general", _require_direct_channel_client("general"))


@app.api_route("/general/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"])
async def direct_general_passthrough(request: Request, path: str):
    return await _proxy_direct_channel_request(request, "general", path)


@app.get("/code")
@app.get("/code/")
async def direct_code_info():
    return _direct_channel_info_response("code", _require_direct_channel_client("code"))


@app.api_route("/code/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"])
async def direct_code_passthrough(request: Request, path: str):
    return await _proxy_direct_channel_request(request, "code", path)


@app.get("/embed")
@app.get("/embed/")
async def direct_embed_info():
    return _direct_channel_info_response("embed", _require_direct_channel_client("embed"))


@app.api_route("/embed/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"])
async def direct_embed_passthrough(request: Request, path: str):
    return await _proxy_direct_channel_request(request, "embed", path)


@app.get("/rerank")
@app.get("/rerank/")
async def direct_rerank_info():
    return _direct_channel_info_response("rerank", _require_direct_channel_client("rerank"))


@app.api_route("/rerank/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"])
async def direct_rerank_passthrough(request: Request, path: str):
    return await _proxy_direct_channel_request(request, "rerank", path)
