import datetime
import hashlib
import json
import os
import re
import asyncio
import uuid
import ipaddress
import logging
from typing import Any, Dict, List, Optional, Set, Tuple

import httpx
from fastapi import BackgroundTasks, FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse, Response, StreamingResponse

app = FastAPI()
logger = logging.getLogger("localai-gateway")


def _env_bool(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _parse_csv_set(value: str) -> Set[str]:
    if not value:
        return set()
    out: Set[str] = set()
    for raw in value.split(","):
        item = raw.strip().lower()
        if item:
            out.add(item)
    return out


LOCALAI_BASE_URL = os.getenv("LOCALAI_BASE_URL", "http://localai:8080").rstrip("/")
LOCALAI_TEXT_BASE_URL = os.getenv("LOCALAI_TEXT_BASE_URL", LOCALAI_BASE_URL).rstrip("/")
LOCALAI_IMAGE_BASE_URL = os.getenv("LOCALAI_IMAGE_BASE_URL", LOCALAI_BASE_URL).rstrip("/")
LOCALAI_WHISPER_BASE_URL = os.getenv("LOCALAI_WHISPER_BASE_URL", LOCALAI_BASE_URL).rstrip("/")
LOCALAI_TTS_BASE_URL = os.getenv("LOCALAI_TTS_BASE_URL", LOCALAI_BASE_URL).rstrip("/")
LOCALAI_RERANK_BASE_URL = os.getenv("LOCALAI_RERANK_BASE_URL", LOCALAI_TEXT_BASE_URL).rstrip("/")
LOCALAI_MUSIC_BASE_URL = os.getenv("LOCALAI_MUSIC_BASE_URL", LOCALAI_BASE_URL).rstrip("/")
LOCALAI_MODELS_INCLUDE_BACKENDS = _env_bool("LOCALAI_MODELS_INCLUDE_BACKENDS", True)
LOCALAI_REQUIRE_RAG = _env_bool("LOCALAI_REQUIRE_RAG", False)
LOCALAI_REQUIRE_IMAGE = _env_bool("LOCALAI_REQUIRE_IMAGE", False)
LOCALAI_REQUIRE_AUDIO = _env_bool("LOCALAI_REQUIRE_AUDIO", False)
MUSIC_ENABLED = _env_bool("MUSIC_ENABLED", False)
LOCALAI_API_KEY = os.getenv("LOCALAI_API_KEY", "")
LOCALAI_TIMEOUT = float(os.getenv("LOCALAI_TIMEOUT", "120"))
GATEWAY_STARTUP_WAIT_SECONDS = float(os.getenv("GATEWAY_STARTUP_WAIT_SECONDS", "60"))
GATEWAY_STARTUP_INTERVAL_SECONDS = float(os.getenv("GATEWAY_STARTUP_INTERVAL_SECONDS", "2"))
GATEWAY_HEALTHCHECK_TIMEOUT = float(os.getenv("GATEWAY_HEALTHCHECK_TIMEOUT", "8"))
GATEWAY_DEPENDENCY_TIMEOUT = float(os.getenv("GATEWAY_DEPENDENCY_TIMEOUT", str(GATEWAY_HEALTHCHECK_TIMEOUT)))
GATEWAY_HEALTH_CACHE_SECONDS = float(os.getenv("GATEWAY_HEALTH_CACHE_SECONDS", "2"))

LOCALAGI_BASE_URL = os.getenv("LOCALAGI_BASE_URL", "http://localagi:3000").rstrip("/")
LOCALAGI_TOOL_MODE = os.getenv("LOCALAGI_TOOL_MODE", "off").strip().lower()
TRUSTED_LOCALAGI_TOOL_MODE = os.getenv("TRUSTED_LOCALAGI_TOOL_MODE", "").strip().lower()
LOCALAGI_TOOL_NAME = os.getenv("LOCALAGI_TOOL_NAME", "localagi_action").strip()
LOCALAGI_ALLOWED_ACTIONS = _parse_csv_set(
    os.getenv(
        "LOCALAGI_ALLOWED_ACTIONS",
        "search,scraper,browse,wikipedia,generate_image,counter,call_agents,github-issue-searcher,"
        "github-issue-reader,github-readme,github-repository-get-content",
    )
)
LOCALAGI_BLOCKED_ACTIONS = _parse_csv_set(
    os.getenv(
        "LOCALAGI_BLOCKED_ACTIONS",
        "shell-command,send-mail,twitter-post,custom,github-repository-create-or-update-content,"
        "github-issue-opener,github-issue-closer,github-issue-commenter,github-issue-labeler",
    )
)
MAX_TOOL_ROUNDS = max(int(os.getenv("MAX_TOOL_ROUNDS", "3")), 1)
LOCALAGI_TOUCH_TIMEOUT = float(os.getenv("LOCALAGI_TOUCH_TIMEOUT", "8"))
TRINITY_ENFORCE_LOCALAGI = _env_bool("TRINITY_ENFORCE_LOCALAGI", True)
TRINITY_LOCALAGI_INCLUDE_HINT = _env_bool("TRINITY_LOCALAGI_INCLUDE_HINT", False)
LOCALAGI_CALL_AGENTS_ENABLED = _env_bool("LOCALAGI_CALL_AGENTS_ENABLED", False)

TOTALRECALL_BASE_URL = os.getenv("TOTALRECALL_BASE_URL", "http://localrecall:8080").rstrip("/")
TOTALRECALL_COLLECTION = os.getenv("TOTALRECALL_COLLECTION", "localai-memory").strip()
MEMORY_ENABLED = _env_bool("MEMORY_ENABLED", True)
MEMORY_TOP_K = int(os.getenv("MEMORY_TOP_K", "5"))
MEMORY_MAX_CHARS = int(os.getenv("MEMORY_MAX_CHARS", "1500"))
MEMORY_SEARCH_TIMEOUT = float(os.getenv("MEMORY_SEARCH_TIMEOUT", "2.5"))
TRINITY_ENFORCE_MEMORY = _env_bool("TRINITY_ENFORCE_MEMORY", True)

GATEWAY_API_KEY = os.getenv("GATEWAY_API_KEY", "")
TRUST_PROXY_HEADERS = _env_bool("TRUST_PROXY_HEADERS", False)

# Multi-user integration controls (trusted upstream app should set these headers)
MULTIUSER_TRUSTED_IPS = os.getenv("MULTIUSER_TRUSTED_IPS", "").strip()
MULTIUSER_USER_HEADERS = os.getenv("MULTIUSER_USER_HEADERS", "user_id,x-user-id").strip()
MULTIUSER_TENANT_HEADERS = os.getenv("MULTIUSER_TENANT_HEADERS", "x-tenant-id").strip()
MULTIUSER_REQUIRE_TRUSTED_USER = _env_bool("MULTIUSER_REQUIRE_TRUSTED_USER", True)
ALLOW_UNTRUSTED_USER_HEADERS = _env_bool("ALLOW_UNTRUSTED_USER_HEADERS", False)
ALLOW_CLIENT_PROVIDED_USER_ID = _env_bool("ALLOW_CLIENT_PROVIDED_USER_ID", False)
ALLOW_CLIENT_PROVIDED_WORKSPACE = _env_bool("ALLOW_CLIENT_PROVIDED_WORKSPACE", False)
CONSOLE_WORKSPACE_ID_HEADERS = ["x-console-workspace-id"]
CONSOLE_WORKSPACE_ROLE_HEADERS = ["x-console-workspace-role"]

# Nextcloud-specific overrides (optional; apply only to trusted IPs)
NEXTCLOUD_TRUSTED_IPS = os.getenv("NEXTCLOUD_TRUSTED_IPS", "").strip()
NEXTCLOUD_USER_HEADER = os.getenv("NEXTCLOUD_USER_HEADER", "").strip().lower()
NEXTCLOUD_COLLECTION = os.getenv("NEXTCLOUD_COLLECTION", "").strip()
NEXTCLOUD_TOOL_MODE = os.getenv("NEXTCLOUD_TOOL_MODE", "").strip().lower()

LOCALAGI_AUTO_CREATE_AGENT = _env_bool("LOCALAGI_AUTO_CREATE_AGENT", False)
LOCALAGI_DEFAULT_AGENT = os.getenv("LOCALAGI_DEFAULT_AGENT", "orchestrator").strip()
LOCALAGI_AGENT_MODEL = os.getenv("LOCALAGI_AGENT_MODEL", "rassy-fast").strip()
LOCALAGI_AGENT_API_URL = os.getenv("LOCALAGI_AGENT_API_URL", LOCALAI_TEXT_BASE_URL).rstrip("/")
LOCALAGI_AGENT_API_KEY = os.getenv("LOCALAGI_AGENT_API_KEY", LOCALAI_API_KEY)
LOCALAGI_AGENT_LOCAL_RAG_URL = os.getenv("LOCALAGI_AGENT_LOCAL_RAG_URL", TOTALRECALL_BASE_URL).rstrip("/")
LOCALAGI_AGENT_SYSTEM_PROMPT = os.getenv(
    "LOCALAGI_AGENT_SYSTEM_PROMPT",
    "You are an orchestration agent that can use configured actions/tools when needed. Keep replies concise.",
)

http_client: Optional[httpx.AsyncClient] = None
known_collections: Set[str] = set()
health_cache: Dict[str, Any] = {"expires_at": 0.0, "payload": None}
health_cache_lock: Optional[asyncio.Lock] = None


def _parse_trusted_ips(value: str) -> List[ipaddress._BaseNetwork]:
    if not value:
        return []
    networks: List[ipaddress._BaseNetwork] = []
    for raw in (item.strip() for item in value.split(",") if item.strip()):
        try:
            if "/" in raw:
                networks.append(ipaddress.ip_network(raw, strict=False))
                continue
            addr = ipaddress.ip_address(raw)
            prefix = 32 if addr.version == 4 else 128
            networks.append(ipaddress.ip_network(f"{addr}/{prefix}", strict=False))
        except ValueError:
            # Ignore invalid entries
            continue
    return networks


NEXTCLOUD_TRUSTED_NETWORKS = _parse_trusted_ips(NEXTCLOUD_TRUSTED_IPS)
MULTIUSER_TRUSTED_NETWORKS = _parse_trusted_ips(MULTIUSER_TRUSTED_IPS)


def _parse_header_names(value: str) -> List[str]:
    if not value:
        return []
    names: List[str] = []
    for raw in (item.strip().lower() for item in value.split(",") if item.strip()):
        if raw:
            names.append(raw)
    return names


MULTIUSER_USER_HEADER_NAMES = _parse_header_names(MULTIUSER_USER_HEADERS)
MULTIUSER_TENANT_HEADER_NAMES = _parse_header_names(MULTIUSER_TENANT_HEADERS)


def _client_ip(request: Request) -> str:
    if TRUST_PROXY_HEADERS:
        xff = request.headers.get("x-forwarded-for", "")
        if xff:
            return xff.split(",")[0].strip()
        xri = request.headers.get("x-real-ip", "")
        if xri:
            return xri.strip()
    return request.client.host if request.client else ""


def _is_nextcloud_request(request: Request) -> bool:
    if not NEXTCLOUD_TRUSTED_NETWORKS:
        return False
    ip = _client_ip(request)
    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return False
    return any(addr in net for net in NEXTCLOUD_TRUSTED_NETWORKS)


def _is_multiuser_trusted_request(request: Request) -> bool:
    if not MULTIUSER_TRUSTED_NETWORKS:
        return False
    ip = _client_ip(request)
    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return False
    return any(addr in net for net in MULTIUSER_TRUSTED_NETWORKS)


def _trusted_header_value(request: Request, headers: List[str]) -> Optional[str]:
    for header in headers:
        value = request.headers.get(header)
        if value and value.strip():
            return value.strip()
    return None


def _trusted_multiuser_identity(request: Request) -> Tuple[Optional[str], Optional[str]]:
    if not _is_multiuser_trusted_request(request):
        return None, None
    user_id = _trusted_header_value(request, MULTIUSER_USER_HEADER_NAMES)
    tenant_id = _trusted_header_value(request, MULTIUSER_TENANT_HEADER_NAMES)
    return user_id, tenant_id


def _nextcloud_user_key(request: Request) -> Optional[str]:
    if not _is_nextcloud_request(request):
        return None
    headers_to_check: List[str] = []
    if NEXTCLOUD_USER_HEADER:
        headers_to_check.append(NEXTCLOUD_USER_HEADER)
    else:
        headers_to_check.extend(
            [
                "x-oc-userid",
                "x-nextcloud-user",
                "x-remote-user",
                "remote-user",
            ]
        )
    for header in headers_to_check:
        value = request.headers.get(header)
        if value and value.strip():
            return value.strip()
    return None


def _auth_headers(api_key: str) -> Dict[str, str]:
    if not api_key:
        return {}
    return {"Authorization": f"Bearer {api_key}"}


def _utc_now() -> datetime.datetime:
    return datetime.datetime.now(datetime.timezone.utc)


def _proxy_target_url(request: Request, target_base_url: str, path: str) -> str:
    target_url = f"{target_base_url.rstrip('/')}{path}"
    if request.url.query:
        return f"{target_url}?{request.url.query}"
    return target_url


def _response_detail(resp: httpx.Response) -> str:
    try:
        detail = resp.text
    except Exception:
        detail = resp.content.decode("utf-8", "ignore") if resp.content else ""
    detail = re.sub(r"\s+", " ", detail or "").strip()
    if not detail:
        return f"upstream returned HTTP {resp.status_code}"
    if len(detail) > 400:
        return detail[:397] + "..."
    return detail


def _proxy_error_status(status_code: int) -> int:
    if status_code == 504:
        return 504
    if 400 <= status_code < 500:
        return status_code
    return 502


def _proxy_http_exception(exc: Exception, service: str) -> HTTPException:
    if isinstance(exc, HTTPException):
        return exc
    if isinstance(exc, httpx.TimeoutException):
        return HTTPException(status_code=504, detail=f"{service} timed out")
    if isinstance(exc, httpx.RequestError):
        return HTTPException(status_code=502, detail=f"{service} unavailable: {exc.__class__.__name__}")
    return HTTPException(status_code=502, detail=f"{service} failed: {exc.__class__.__name__}")


async def _json_payload(request: Request) -> Dict[str, Any]:
    try:
        payload = await request.json()
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="Invalid JSON payload") from exc
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Invalid payload")
    return payload


async def _localai_raw_post(request: Request, path: str, base_url: Optional[str] = None) -> Response:
    _require_gateway_key(request)
    if not http_client:
        raise HTTPException(status_code=503, detail="HTTP client not ready")
    body = await request.body()
    headers = {"Content-Type": request.headers.get("content-type", "application/octet-stream")}
    accept = request.headers.get("accept")
    if accept:
        headers["Accept"] = accept
    headers.update(_auth_headers(LOCALAI_API_KEY))
    target_base_url = (base_url or LOCALAI_TEXT_BASE_URL).rstrip("/")
    target_url = _proxy_target_url(request, target_base_url, path)
    try:
        resp = await http_client.post(target_url, content=body, headers=headers)
    except Exception as exc:
        raise _proxy_http_exception(exc, f"POST {path}") from exc
    if resp.status_code >= 400:
        raise HTTPException(status_code=_proxy_error_status(resp.status_code), detail=_response_detail(resp))
    content_type = resp.headers.get("content-type", "")
    if "application/json" in content_type:
        try:
            return JSONResponse(resp.json())
        except ValueError as exc:
            raise HTTPException(status_code=502, detail="Upstream returned invalid JSON") from exc
    return Response(content=resp.content, media_type=content_type or "application/octet-stream")


async def _localai_raw_get(request: Request, path: str, base_url: Optional[str] = None) -> Response:
    _require_gateway_key(request)
    if not http_client:
        raise HTTPException(status_code=503, detail="HTTP client not ready")
    headers = {}
    accept = request.headers.get("accept")
    if accept:
        headers["Accept"] = accept
    headers.update(_auth_headers(LOCALAI_API_KEY))
    target_base_url = (base_url or LOCALAI_TEXT_BASE_URL).rstrip("/")
    target_url = _proxy_target_url(request, target_base_url, path)
    try:
        resp = await http_client.get(target_url, headers=headers)
    except Exception as exc:
        raise _proxy_http_exception(exc, f"GET {path}") from exc
    if resp.status_code >= 400:
        raise HTTPException(status_code=_proxy_error_status(resp.status_code), detail=_response_detail(resp))
    content_type = resp.headers.get("content-type", "")
    if "application/json" in content_type:
        try:
            return JSONResponse(resp.json())
        except ValueError as exc:
            raise HTTPException(status_code=502, detail="Upstream returned invalid JSON") from exc
    return Response(content=resp.content, media_type=content_type or "application/octet-stream")


def _require_gateway_key(request: Request) -> None:
    if not GATEWAY_API_KEY:
        raise HTTPException(status_code=503, detail="Gateway API key is not configured")
    auth = request.headers.get("authorization", "")
    token = auth.replace("Bearer", "").strip() if auth else ""
    if token != GATEWAY_API_KEY:
        raise HTTPException(status_code=401, detail="Unauthorized")


def _sanitize_identifier(value: str, max_len: int = 64) -> str:
    clean = re.sub(r"[^a-zA-Z0-9._@-]+", "-", value).strip("-._")
    if not clean:
        return ""
    return clean[:max_len]


def _extract_user_key(request: Request, payload: Dict[str, Any]) -> str:
    nextcloud_user = _nextcloud_user_key(request)
    if nextcloud_user:
        safe = _sanitize_identifier(nextcloud_user)
        return f"nc-{safe or 'user'}"

    trusted_user, _ = _trusted_multiuser_identity(request)
    if trusted_user:
        safe = _sanitize_identifier(trusted_user)
        if safe:
            return safe

    if ALLOW_UNTRUSTED_USER_HEADERS:
        untrusted_headers = list(dict.fromkeys(MULTIUSER_USER_HEADER_NAMES + ["user_id", "x-user-id"]))
        header_user = _trusted_header_value(request, untrusted_headers)
        if header_user:
            safe = _sanitize_identifier(header_user)
            if safe:
                return safe

    if ALLOW_CLIENT_PROVIDED_USER_ID:
        if isinstance(payload.get("user_id"), str) and payload["user_id"].strip():
            safe = _sanitize_identifier(payload["user_id"].strip())
            if safe:
                return safe
        if isinstance(payload.get("user"), str) and payload["user"].strip():
            safe = _sanitize_identifier(payload["user"].strip())
            if safe:
                return safe

    metadata = payload.get("metadata")
    if not isinstance(metadata, dict):
        metadata = {}
    if ALLOW_CLIENT_PROVIDED_USER_ID:
        if isinstance(metadata.get("user_id"), str) and metadata["user_id"].strip():
            safe = _sanitize_identifier(metadata["user_id"].strip())
            if safe:
                return safe

    auth = request.headers.get("authorization")
    if auth:
        return "auth-" + hashlib.sha256(auth.encode("utf-8")).hexdigest()[:12]
    header_session = request.headers.get("x-session-id")
    if header_session:
        return header_session.strip()
    if isinstance(metadata.get("session_id"), str) and metadata["session_id"].strip():
        return metadata["session_id"].strip()
    user_agent = request.headers.get("user-agent", "")
    client_host = request.client.host if request.client else "unknown"
    seed = f"{client_host}|{user_agent}".encode("utf-8")
    anon = "anon-" + hashlib.sha256(seed).hexdigest()[:12]
    if _is_nextcloud_request(request):
        return f"nc-{anon}"
    return anon


def _extract_workspace_context(request: Request, payload: Dict[str, Any]) -> Dict[str, Optional[str]]:
    metadata = payload.get("metadata")
    if not isinstance(metadata, dict):
        metadata = {}
    console_context = metadata.get("console_context") if isinstance(metadata.get("console_context"), dict) else {}
    trusted_request = _is_multiuser_trusted_request(request)

    workspace_id = ""
    if trusted_request:
        for header in CONSOLE_WORKSPACE_ID_HEADERS:
            value = request.headers.get(header)
            if value and value.strip():
                workspace_id = value.strip()
                break
    if not workspace_id and ALLOW_CLIENT_PROVIDED_WORKSPACE:
        workspace_id = str(console_context.get("workspaceId") or "").strip()
    if not workspace_id and ALLOW_CLIENT_PROVIDED_WORKSPACE and isinstance(metadata.get("workspace_id"), str):
        workspace_id = metadata.get("workspace_id", "").strip()

    workspace_role = ""
    if trusted_request:
        for header in CONSOLE_WORKSPACE_ROLE_HEADERS:
            value = request.headers.get(header)
            if value and value.strip():
                workspace_role = value.strip()
                break
    if not workspace_role and ALLOW_CLIENT_PROVIDED_WORKSPACE:
        workspace_role = str(console_context.get("workspaceRole") or "").strip()

    workspace_slug = str(console_context.get("workspaceSlug") or "").strip() if ALLOW_CLIENT_PROVIDED_WORKSPACE else ""

    safe_workspace_id = _sanitize_identifier(workspace_id)
    safe_workspace_role = _sanitize_identifier(workspace_role, max_len=32)
    safe_workspace_slug = _sanitize_identifier(workspace_slug)
    return {
        "workspace_id": safe_workspace_id or None,
        "workspace_role": safe_workspace_role or None,
        "workspace_slug": safe_workspace_slug or None,
    }


def _extract_tenant_key(request: Request, payload: Dict[str, Any]) -> str:
    _, trusted_tenant = _trusted_multiuser_identity(request)
    if trusted_tenant:
        safe = _sanitize_identifier(trusted_tenant)
        if safe:
            return safe
    workspace_ctx = _extract_workspace_context(request, payload)
    if workspace_ctx["workspace_id"]:
        return workspace_ctx["workspace_id"]
    if not ALLOW_CLIENT_PROVIDED_WORKSPACE:
        return ""
    metadata = payload.get("metadata")
    if not isinstance(metadata, dict):
        metadata = {}
    tenant = metadata.get("tenant_id")
    if isinstance(tenant, str) and tenant.strip():
        safe = _sanitize_identifier(tenant.strip())
        if safe:
            return safe
    return ""


def _scope_key(user_key: str, workspace_key: str) -> str:
    if workspace_key:
        return f"{user_key}::{workspace_key}"
    return f"{user_key}::user-only"


def _collection_for_scope(base: str, scope_key: str) -> str:
    suffix = hashlib.sha1(scope_key.encode("utf-8")).hexdigest()[:12]
    safe_base = re.sub(r"[^a-zA-Z0-9_-]+", "-", base).strip("-")
    prefix = safe_base if safe_base else "memory"
    return f"{prefix}-{suffix}"


def _extract_request_context(request: Request, payload: Dict[str, Any]) -> Dict[str, Optional[str]]:
    user_key = _extract_user_key(request, payload)
    workspace_key = _extract_tenant_key(request, payload)
    workspace_ctx = _extract_workspace_context(request, payload)
    return {
        "user_id": user_key,
        "workspace_id": workspace_key or workspace_ctx.get("workspace_id"),
        "workspace_role": workspace_ctx.get("workspace_role"),
        "workspace_slug": workspace_ctx.get("workspace_slug"),
        "scope_key": _scope_key(user_key, workspace_key),
    }


def _last_user_message(messages: List[Dict[str, Any]]) -> Optional[str]:
    for msg in reversed(messages):
        if msg.get("role") == "user" and isinstance(msg.get("content"), str):
            return msg["content"]
    return None


def _memory_disabled(request: Request, payload: Dict[str, Any]) -> bool:
    if TRINITY_ENFORCE_MEMORY:
        return False
    if request.headers.get("x-disable-memory", "").lower() in {"1", "true", "yes", "on"}:
        return True
    metadata = payload.get("metadata") or {}
    return bool(metadata.get("disable_memory"))


def _should_add_localagi_tool(
    request: Request,
    payload: Dict[str, Any],
    tool_mode: Optional[str] = None,
) -> bool:
    mode = (tool_mode or LOCALAGI_TOOL_MODE).strip().lower()
    if mode == "off":
        return False
    if mode == "force":
        return True
    if request.headers.get("x-use-localagi-tools", "").lower() in {"1", "true", "yes", "on"}:
        return True
    metadata = payload.get("metadata") or {}
    if metadata.get("use_localagi_tools") or metadata.get("use_localagi"):
        return True
    if "tools" in payload or "functions" in payload:
        return True
    return False


def _effective_localagi_tool_mode(request: Request) -> str:
    if _is_nextcloud_request(request) and NEXTCLOUD_TOOL_MODE:
        return NEXTCLOUD_TOOL_MODE
    if _is_multiuser_trusted_request(request) and TRUSTED_LOCALAGI_TOOL_MODE:
        return TRUSTED_LOCALAGI_TOOL_MODE
    return LOCALAGI_TOOL_MODE


def _localagi_tool_schema() -> Dict[str, Any]:
    return {
        "type": "function",
        "function": {
            "name": LOCALAGI_TOOL_NAME,
            "description": "Run a LocalAGI action by name. Use this to invoke LocalAGI tools.",
            "parameters": {
                "type": "object",
                "properties": {
                    "action": {"type": "string", "description": "LocalAGI action name"},
                    "config": {"type": "object", "description": "LocalAGI action config"},
                    "params": {"type": "object", "description": "LocalAGI action params"},
                },
                "required": ["action"],
            },
        },
    }


def _add_localagi_tool(payload: Dict[str, Any]) -> None:
    tool = _localagi_tool_schema()
    if "tools" in payload:
        payload["tools"] = list(payload.get("tools") or []) + [tool]
        return
    if "functions" in payload:
        payload["functions"] = list(payload.get("functions") or []) + [tool["function"]]
        return
    payload["tools"] = [tool]


def _prepare_payload_for_localai(payload: Dict[str, Any], user_key: str) -> Dict[str, Any]:
    out = dict(payload)
    source_user_id = out.pop("user_id", None)
    # LocalAI currently rejects metadata on chat requests; keep it for gateway-only routing.
    out.pop("metadata", None)
    if not out.get("user"):
        if isinstance(source_user_id, str) and source_user_id.strip():
            out["user"] = _sanitize_identifier(source_user_id.strip())
        elif user_key:
            out["user"] = user_key
    return out


def _inject_memory(messages: List[Dict[str, Any]], memory_block: str) -> List[Dict[str, Any]]:
    if not memory_block:
        return messages
    memory_msg = {"role": "system", "content": memory_block}
    idx = 0
    while idx < len(messages) and messages[idx].get("role") == "system":
        idx += 1
    return messages[:idx] + [memory_msg] + messages[idx:]


async def _ensure_collection(name: str) -> None:
    if not http_client:
        return
    if name in known_collections:
        return
    timeout = httpx.Timeout(MEMORY_SEARCH_TIMEOUT)
    try:
        resp = await http_client.get(f"{TOTALRECALL_BASE_URL}/api/collections", timeout=timeout)
        data = resp.json() if resp.status_code == 200 else {}
        collections = data.get("data", {}).get("collections") or []
        if name in collections:
            known_collections.add(name)
            return
        create_resp = await http_client.post(
            f"{TOTALRECALL_BASE_URL}/api/collections",
            json={"name": name},
            timeout=timeout,
        )
        if create_resp.status_code < 400:
            known_collections.add(name)
    except Exception:
        return


async def _search_memory(collection: str, query: str) -> List[str]:
    if not http_client or not query:
        return []
    await _ensure_collection(collection)
    timeout = httpx.Timeout(MEMORY_SEARCH_TIMEOUT)
    try:
        max_results = max(MEMORY_TOP_K, 1)
        attempted: Set[int] = set()
        while max_results >= 1:
            if max_results in attempted:
                return []
            attempted.add(max_results)
            resp = await http_client.post(
                f"{TOTALRECALL_BASE_URL}/api/collections/{collection}/search",
                json={"query": query, "max_results": max_results},
                timeout=timeout,
            )
            if resp.status_code == 200:
                data = resp.json()
                results = data.get("data", {}).get("results") or []
                texts: List[str] = []
                for item in results:
                    if isinstance(item, str):
                        texts.append(item)
                    elif isinstance(item, dict):
                        if "content" in item and isinstance(item["content"], str):
                            texts.append(item["content"])
                        elif "text" in item and isinstance(item["text"], str):
                            texts.append(item["text"])
                        else:
                            texts.append(json.dumps(item, ensure_ascii=True))
                    else:
                        texts.append(str(item))
                return texts

            details = ""
            try:
                error_payload = resp.json()
                if isinstance(error_payload, dict):
                    details = str((error_payload.get("error") or {}).get("details") or "")
            except Exception:
                details = resp.text or ""

            if "nResults must be <=" not in details:
                return []
            match = re.search(r"nResults must be <=\s*(\d+)", details)
            if match:
                allowed = int(match.group(1))
                if allowed < 1:
                    return []
                max_results = min(max_results - 1, allowed)
                continue
            if max_results == 1:
                return []
            max_results = 1
    except Exception:
        return []


def _format_memory_block(memories: List[str]) -> str:
    if not memories:
        return ""
    header = "Memory (retrieved, most relevant first):"
    lines = [header]
    total = len(header) + 1
    for mem in memories:
        cleaned = mem.strip().replace("\n", " ")
        if not cleaned:
            continue
        entry = f"- {cleaned}"
        if total + len(entry) + 1 > MEMORY_MAX_CHARS:
            break
        lines.append(entry)
        total += len(entry) + 1
    return "\n".join(lines)


async def _store_memory(
    collection: str,
    user_key: str,
    scope_key: str,
    workspace_id: Optional[str],
    workspace_role: Optional[str],
    model: Optional[str],
    user_message: Optional[str],
    assistant_message: Optional[str],
    tool_outputs: List[Dict[str, Any]],
) -> None:
    if not http_client or not user_message or not assistant_message:
        return
    await _ensure_collection(collection)
    timestamp = _utc_now().isoformat().replace("+00:00", "Z")
    payload = {
        "timestamp": timestamp,
        "user_key": user_key,
        "scope_key": scope_key,
        "workspace_id": workspace_id,
        "workspace_role": workspace_role,
        "model": model,
        "user_message": user_message,
        "assistant_message": assistant_message,
        "tool_outputs": tool_outputs,
    }
    content = json.dumps(payload, ensure_ascii=True, indent=2)
    filename = f"memory-{timestamp}-{uuid.uuid4().hex[:8]}.txt"
    try:
        await http_client.post(
            f"{TOTALRECALL_BASE_URL}/api/collections/{collection}/upload",
            files={"file": (filename, content.encode("utf-8"), "text/plain")},
        )
    except Exception:
        return


async def _run_localagi_action(action: str, config: Dict[str, Any], params: Dict[str, Any]) -> Dict[str, Any]:
    if not http_client:
        raise RuntimeError("HTTP client not ready")
    try:
        resp = await http_client.post(
            f"{LOCALAGI_BASE_URL}/api/action/{action}/run",
            json={"action": action, "config": config or {}, "params": params or {}},
            timeout=httpx.Timeout(LOCALAGI_TOUCH_TIMEOUT),
        )
    except httpx.TimeoutException as exc:
        raise RuntimeError(f"LocalAGI action timed out: {action}") from exc
    except httpx.RequestError as exc:
        raise RuntimeError(f"LocalAGI unavailable for action {action}: {exc.__class__.__name__}") from exc
    if resp.status_code >= 400:
        raise RuntimeError(f"LocalAGI action failed: {resp.status_code} {_response_detail(resp)}")
    try:
        return resp.json()
    except ValueError as exc:
        raise RuntimeError(f"LocalAGI returned invalid JSON for action {action}") from exc


async def _trinity_localagi_engage(scope_key: str, user_message: Optional[str]) -> str:
    """Run lightweight LocalAGI actions on every chat request to keep AGI active."""
    if not http_client:
        return ""
    counter_name = "scope-" + hashlib.sha1(scope_key.encode("utf-8")).hexdigest()[:12]
    timeout = httpx.Timeout(LOCALAGI_TOUCH_TIMEOUT)
    # Keep a per-user heartbeat/counter in LocalAGI.
    try:
        await http_client.post(
            f"{LOCALAGI_BASE_URL}/api/action/counter/run",
            json={"action": "counter", "config": {}, "params": {"name": counter_name}},
            timeout=timeout,
        )
    except Exception:
        pass

    # Ask the default LocalAGI agent for a compact orchestration hint.
    if not LOCALAGI_CALL_AGENTS_ENABLED:
        return ""
    try:
        resp = await http_client.post(
            f"{LOCALAGI_BASE_URL}/api/action/call_agents/run",
            json={
                "action": "call_agents",
                "config": {},
                "params": {
                    "agent_name": LOCALAGI_DEFAULT_AGENT,
                    "message": (user_message or "")[:2000],
                },
            },
            timeout=timeout,
        )
        if resp.status_code < 400:
            data = resp.json()
            hint = str(data.get("Result") or "").strip()
            return hint[:1200]
    except Exception:
        pass
    return ""


def _dependency_targets() -> Dict[str, Tuple[str, Dict[str, str]]]:
    targets = {
        "gpt_models": (f"{LOCALAI_TEXT_BASE_URL}/v1/models", _auth_headers(LOCALAI_API_KEY)),
        "localagi": (f"{LOCALAGI_BASE_URL}/api/agents", {}),
        "localrecall": (f"{TOTALRECALL_BASE_URL}/api/collections", {}),
    }
    if LOCALAI_REQUIRE_RAG:
        targets["gpt_rag"] = (f"{LOCALAI_RERANK_BASE_URL}/v1/rag/models", _auth_headers(LOCALAI_API_KEY))
    if LOCALAI_REQUIRE_IMAGE:
        targets["gpt_image"] = (f"{LOCALAI_IMAGE_BASE_URL}/v1/images/models", _auth_headers(LOCALAI_API_KEY))
    if LOCALAI_REQUIRE_AUDIO:
        targets["gpt_audio"] = (f"{LOCALAI_WHISPER_BASE_URL}/v1/audio/models", _auth_headers(LOCALAI_API_KEY))
    if MUSIC_ENABLED:
        targets["gpt_music"] = (f"{LOCALAI_MUSIC_BASE_URL}/v1/audio/music/models", _auth_headers(LOCALAI_API_KEY))
    return targets


async def _dependency_probe(
    name: str,
    url: str,
    headers: Optional[Dict[str, str]],
    timeout_seconds: float,
) -> Tuple[str, bool, str]:
    if not http_client:
        return name, False, "http client not ready"
    try:
        resp = await http_client.get(url, headers=headers, timeout=httpx.Timeout(timeout_seconds))
    except httpx.TimeoutException:
        return name, False, "timeout"
    except httpx.RequestError as exc:
        return name, False, exc.__class__.__name__
    except Exception as exc:
        return name, False, exc.__class__.__name__
    if 200 <= resp.status_code < 300:
        return name, True, ""
    return name, False, f"HTTP {resp.status_code}: {_response_detail(resp)}"


async def _dependency_summary(
    timeout_seconds: float,
    use_cache: bool = True,
) -> Dict[str, Any]:
    if not http_client:
        return {
            "status": "degraded",
            "dependencies": {"http_client": False},
            "errors": {"http_client": "not ready"},
        }
    now = _utc_now().timestamp()
    cached_payload = health_cache.get("payload")
    if use_cache and cached_payload and float(health_cache.get("expires_at") or 0.0) > now:
        return cached_payload

    async def compute() -> Dict[str, Any]:
        probes = [
            _dependency_probe(name, url, headers, timeout_seconds)
            for name, (url, headers) in _dependency_targets().items()
        ]
        results = await asyncio.gather(*probes)
        deps: Dict[str, bool] = {}
        errors: Dict[str, str] = {}
        for name, ok, detail in results:
            deps[name] = ok
            if detail:
                errors[name] = detail
        status = "ok" if deps and all(deps.values()) else "degraded"
        return {"status": status, "dependencies": deps, "errors": errors}

    if not use_cache or not health_cache_lock:
        return await compute()

    async with health_cache_lock:
        cached_payload = health_cache.get("payload")
        now = _utc_now().timestamp()
        if cached_payload and float(health_cache.get("expires_at") or 0.0) > now:
            return cached_payload
        payload = await compute()
        health_cache["payload"] = payload
        health_cache["expires_at"] = now + GATEWAY_HEALTH_CACHE_SECONDS
        return payload


async def _wait_for_trinity() -> None:
    if not http_client:
        return
    deadline = _utc_now().timestamp() + GATEWAY_STARTUP_WAIT_SECONDS
    last_payload: Dict[str, Any] = {"status": "degraded", "dependencies": {}, "errors": {}}
    while _utc_now().timestamp() < deadline:
        last_payload = await _dependency_summary(GATEWAY_DEPENDENCY_TIMEOUT, use_cache=False)
        if last_payload["status"] == "ok":
            return
        await asyncio.sleep(GATEWAY_STARTUP_INTERVAL_SECONDS)
    logger.warning(
        "startup dependencies still degraded after %.1fs: %s",
        GATEWAY_STARTUP_WAIT_SECONDS,
        json.dumps(last_payload, ensure_ascii=True, sort_keys=True),
    )


async def _ensure_localagi_agent() -> None:
    if not http_client:
        return
    try:
        timeout = httpx.Timeout(GATEWAY_DEPENDENCY_TIMEOUT)
        resp = await http_client.get(f"{LOCALAGI_BASE_URL}/api/agents", timeout=timeout)
        if resp.status_code != 200:
            return
        agents = resp.json().get("agents") or []
        if LOCALAGI_DEFAULT_AGENT in agents:
            return
        payload = {
            "name": LOCALAGI_DEFAULT_AGENT,
            "description": "LocalAI orchestration agent",
            "model": LOCALAGI_AGENT_MODEL,
            "api_url": LOCALAGI_AGENT_API_URL,
            "api_key": LOCALAGI_AGENT_API_KEY,
            "local_rag_url": LOCALAGI_AGENT_LOCAL_RAG_URL,
            "enable_kb": False,
            "kb_results": 5,
            "long_term_memory": False,
            "summary_long_term_memory": False,
            "system_prompt": LOCALAGI_AGENT_SYSTEM_PROMPT,
        }
        await http_client.post(f"{LOCALAGI_BASE_URL}/api/agent/create", json=payload, timeout=timeout)
    except Exception:
        return


async def _localai_post(path: str, payload: Dict[str, Any], base_url: Optional[str] = None) -> Dict[str, Any]:
    if not http_client:
        raise HTTPException(status_code=503, detail="HTTP client not ready")
    headers = {"Content-Type": "application/json", **_auth_headers(LOCALAI_API_KEY)}
    target_base_url = (base_url or LOCALAI_TEXT_BASE_URL).rstrip("/")
    try:
        resp = await http_client.post(f"{target_base_url}{path}", json=payload, headers=headers)
    except Exception as exc:
        raise _proxy_http_exception(exc, f"POST {path}") from exc
    if resp.status_code >= 400:
        raise HTTPException(status_code=_proxy_error_status(resp.status_code), detail=_response_detail(resp))
    try:
        return resp.json()
    except ValueError as exc:
        raise HTTPException(status_code=502, detail="Upstream returned invalid JSON") from exc


def _extract_models_list(payload: Any) -> List[Dict[str, Any]]:
    if not isinstance(payload, dict):
        return []
    if isinstance(payload.get("data"), list):
        return [item for item in payload["data"] if isinstance(item, dict)]
    if isinstance(payload.get("models"), list):
        return [item for item in payload["models"] if isinstance(item, dict)]
    return []


async def _fetch_models_from_localai(base_url: str) -> List[Dict[str, Any]]:
    if not http_client:
        raise HTTPException(status_code=503, detail="HTTP client not ready")
    headers = {"Content-Type": "application/json", **_auth_headers(LOCALAI_API_KEY)}
    try:
        resp = await http_client.get(f"{base_url.rstrip('/')}/v1/models", headers=headers)
    except Exception as exc:
        raise _proxy_http_exception(exc, "GET /v1/models") from exc
    if resp.status_code >= 400:
        raise HTTPException(status_code=_proxy_error_status(resp.status_code), detail=_response_detail(resp))
    try:
        return _extract_models_list(resp.json())
    except ValueError as exc:
        raise HTTPException(status_code=502, detail="Upstream returned invalid JSON") from exc


def _extract_tool_calls(message: Dict[str, Any]) -> List[Dict[str, Any]]:
    if isinstance(message.get("tool_calls"), list):
        return message["tool_calls"]
    if isinstance(message.get("function_call"), dict):
        return [{
            "id": f"call_{uuid.uuid4().hex}",
            "type": "function",
            "function": message["function_call"],
        }]
    return []


def _parse_tool_args(raw_args: Any) -> Dict[str, Any]:
    if raw_args is None:
        return {}
    if isinstance(raw_args, dict):
        return raw_args
    if isinstance(raw_args, str):
        try:
            return json.loads(raw_args)
        except Exception:
            return {"_raw": raw_args}
    return {"_raw": str(raw_args)}


def _is_localagi_action_allowed(action: str) -> Tuple[bool, str]:
    normalized = action.strip().lower()
    if not normalized:
        return False, "Missing LocalAGI action name"
    if normalized in LOCALAGI_BLOCKED_ACTIONS:
        return False, f"LocalAGI action blocked by policy: {normalized}"
    if LOCALAGI_ALLOWED_ACTIONS and normalized not in LOCALAGI_ALLOWED_ACTIONS:
        return False, f"LocalAGI action not in allowlist: {normalized}"
    return True, ""


async def _run_localai_with_tools(payload: Dict[str, Any]) -> Tuple[Dict[str, Any], List[Dict[str, Any]]]:
    messages = list(payload.get("messages") or [])
    tool_outputs: List[Dict[str, Any]] = []
    result: Dict[str, Any] = {}
    for _ in range(MAX_TOOL_ROUNDS):
        payload["messages"] = messages
        result = await _localai_post("/v1/chat/completions", payload)
        choices = result.get("choices") or []
        if not choices:
            return result, tool_outputs
        message = choices[0].get("message") or {}
        tool_calls = _extract_tool_calls(message)
        if not tool_calls:
            return result, tool_outputs
        messages.append({"role": "assistant", "content": message.get("content"), "tool_calls": tool_calls})
        for call in tool_calls:
            function = call.get("function") or {}
            name = function.get("name") or ""
            args = _parse_tool_args(function.get("arguments"))
            tool_call_id = call.get("id") or f"call_{uuid.uuid4().hex}"
            if name != LOCALAGI_TOOL_NAME:
                tool_result = {"error": f"Unsupported tool: {name}"}
            else:
                action = args.get("action")
                if not action:
                    tool_result = {"error": "Missing action for localagi_action"}
                else:
                    allowed, reason = _is_localagi_action_allowed(str(action))
                    if not allowed:
                        tool_result = {"error": reason}
                        logger.warning("blocked_localagi_action action=%s reason=%s", action, reason)
                        tool_outputs.append({"tool": name, "args": args, "result": tool_result})
                        messages.append({
                            "role": "tool",
                            "tool_call_id": tool_call_id,
                            "name": name,
                            "content": json.dumps(tool_result, ensure_ascii=True),
                        })
                        continue
                    config = args.get("config") or {}
                    params = args.get("params") or {}
                    try:
                        tool_result = await _run_localagi_action(action, config, params)
                    except Exception as exc:
                        tool_result = {"error": str(exc)}
                        logger.warning("localagi_action_failed action=%s error=%s", action, tool_result["error"])
            tool_outputs.append({"tool": name, "args": args, "result": tool_result})
            messages.append({
                "role": "tool",
                "tool_call_id": tool_call_id,
                "name": name,
                "content": json.dumps(tool_result, ensure_ascii=True),
            })
    return result, tool_outputs


@app.on_event("startup")
async def _startup() -> None:
    global http_client, health_cache_lock
    logging.basicConfig(level=getattr(logging, os.getenv("LOG_LEVEL", "INFO").upper(), logging.INFO))
    logger.setLevel(getattr(logging, os.getenv("LOG_LEVEL", "INFO").upper(), logging.INFO))
    limits = httpx.Limits(max_keepalive_connections=128, max_connections=256)
    http_client = httpx.AsyncClient(timeout=LOCALAI_TIMEOUT, limits=limits)
    health_cache_lock = asyncio.Lock()
    health_cache["expires_at"] = 0.0
    health_cache["payload"] = None
    if not GATEWAY_API_KEY:
        logger.error("gateway_api_key_missing requests will fail closed until GATEWAY_API_KEY is configured")
    await _wait_for_trinity()
    if LOCALAGI_AUTO_CREATE_AGENT:
        await _ensure_localagi_agent()


@app.on_event("shutdown")
async def _shutdown() -> None:
    global http_client, health_cache_lock
    if http_client:
        await http_client.aclose()
    http_client = None
    health_cache_lock = None
    health_cache["expires_at"] = 0.0
    health_cache["payload"] = None


@app.get("/healthz")
async def healthz() -> JSONResponse:
    payload = await _dependency_summary(GATEWAY_HEALTHCHECK_TIMEOUT, use_cache=True)
    status_code = 200 if payload.get("status") == "ok" else 503
    return JSONResponse(payload, status_code=status_code)


@app.get("/readyz")
async def readyz() -> Response:
    payload = await _dependency_summary(GATEWAY_HEALTHCHECK_TIMEOUT, use_cache=True)
    if payload.get("status") != "ok":
        return JSONResponse(payload, status_code=503)
    return Response(content="ok", media_type="text/plain")


@app.post("/v1/chat/completions")
async def chat_completions(request: Request, background_tasks: BackgroundTasks) -> JSONResponse:
    _require_gateway_key(request)
    payload = await _json_payload(request)
    messages = list(payload.get("messages") or [])
    if not messages:
        raise HTTPException(status_code=400, detail="Missing messages")

    trusted_user, _ = _trusted_multiuser_identity(request)
    if MULTIUSER_REQUIRE_TRUSTED_USER and _is_multiuser_trusted_request(request) and not trusted_user:
        raise HTTPException(status_code=400, detail="Missing trusted user identity header")

    ctx = _extract_request_context(request, payload)
    user_key = str(ctx.get("user_id") or "")
    workspace_id = str(ctx.get("workspace_id") or "")
    workspace_role = str(ctx.get("workspace_role") or "")
    scope_key = str(ctx.get("scope_key") or _scope_key(user_key, workspace_id))

    logger.info(
        "chat_context user_id=%s workspace_id=%s workspace_role=%s scope_key=%s",
        user_key,
        workspace_id or "-",
        workspace_role or "-",
        scope_key,
    )
    if not workspace_id:
        logger.warning(
            "workspace scope missing; using user-only fallback user_id=%s scope_key=%s",
            user_key,
            scope_key,
        )
    if workspace_role and not workspace_id:
        logger.warning(
            "workspace_role received without workspace_id user_id=%s workspace_role=%s",
            user_key,
            workspace_role,
        )

    collection_base = TOTALRECALL_COLLECTION
    if _is_nextcloud_request(request) and NEXTCLOUD_COLLECTION:
        collection_base = NEXTCLOUD_COLLECTION
    collection = _collection_for_scope(collection_base, scope_key)
    user_message = _last_user_message(messages)

    localagi_hint = ""
    if TRINITY_ENFORCE_LOCALAGI:
        if TRINITY_LOCALAGI_INCLUDE_HINT:
            localagi_hint = await _trinity_localagi_engage(scope_key, user_message)
        else:
            # Keep LocalAGI engaged on every request without adding front-path latency.
            background_tasks.add_task(_trinity_localagi_engage, scope_key, user_message)

    if MEMORY_ENABLED and not _memory_disabled(request, payload) and user_message:
        memories = await _search_memory(collection, user_message)
        memory_block = _format_memory_block(memories)
        messages = _inject_memory(messages, memory_block)

    if localagi_hint:
        messages = _inject_memory(messages, f"LocalAGI orchestration hint:\n- {localagi_hint}")

    payload["messages"] = messages

    tool_mode = _effective_localagi_tool_mode(request)
    if _should_add_localagi_tool(request, payload, tool_mode=tool_mode):
        _add_localagi_tool(payload)
    localai_payload = _prepare_payload_for_localai(payload, user_key)

    if payload.get("stream"):
        async def stream() -> Any:
            if not http_client:
                raise HTTPException(status_code=503, detail="HTTP client not ready")
            headers = {"Content-Type": "application/json", **_auth_headers(LOCALAI_API_KEY)}
            url = f"{LOCALAI_TEXT_BASE_URL}/v1/chat/completions"
            buffer: List[str] = []
            async with http_client.stream("POST", url, json=localai_payload, headers=headers) as resp:
                if resp.status_code >= 400:
                    detail = await resp.aread()
                    raise HTTPException(status_code=502, detail=detail.decode("utf-8", "ignore"))
                async for line in resp.aiter_lines():
                    if line is None:
                        continue
                    if line.startswith("data: "):
                        data = line[6:]
                        if data.strip() == "[DONE]":
                            break
                        try:
                            obj = json.loads(data)
                            delta = (obj.get("choices") or [{}])[0].get("delta") or {}
                            if isinstance(delta.get("content"), str):
                                buffer.append(delta["content"])
                        except Exception:
                            pass
                    yield line + "\n"
            assistant_text = "".join(buffer).strip()
            if MEMORY_ENABLED and not _memory_disabled(request, payload) and user_message and assistant_text:
                await _store_memory(
                    collection,
                    user_key,
                    scope_key,
                    workspace_id or None,
                    workspace_role or None,
                    payload.get("model"),
                    user_message,
                    assistant_text,
                    [],
                )
        return StreamingResponse(stream(), media_type="text/event-stream")

    result, tool_outputs = await _run_localai_with_tools(localai_payload)
    assistant_text = None
    try:
        assistant_text = result.get("choices")[0].get("message", {}).get("content")
    except Exception:
        assistant_text = None

    if MEMORY_ENABLED and not _memory_disabled(request, payload) and user_message and assistant_text:
        background_tasks.add_task(
            _store_memory,
            collection,
            user_key,
            scope_key,
            workspace_id or None,
            workspace_role or None,
            payload.get("model"),
            user_message,
            assistant_text,
            tool_outputs,
        )

    return JSONResponse(result)


@app.post("/v1/embeddings")
async def embeddings(request: Request) -> JSONResponse:
    _require_gateway_key(request)
    payload = await _json_payload(request)
    result = await _localai_post("/v1/embeddings", payload, base_url=LOCALAI_TEXT_BASE_URL)
    return JSONResponse(result)


@app.post("/v1/responses")
async def responses(request: Request) -> Response:
    return await _localai_raw_post(request, "/v1/responses", base_url=LOCALAI_TEXT_BASE_URL)


@app.post("/v1/rerank")
async def rerank(request: Request) -> Response:
    return await _localai_raw_post(request, "/v1/rerank", base_url=LOCALAI_RERANK_BASE_URL)


@app.post("/v1/images/generations")
async def images_generations(request: Request) -> Response:
    return await _localai_raw_post(request, "/v1/images/generations", base_url=LOCALAI_IMAGE_BASE_URL)


@app.post("/v1/audio/transcriptions")
async def audio_transcriptions(request: Request) -> Response:
    return await _localai_raw_post(request, "/v1/audio/transcriptions", base_url=LOCALAI_WHISPER_BASE_URL)


@app.post("/v1/audio/translations")
async def audio_translations(request: Request) -> Response:
    return await _localai_raw_post(request, "/v1/audio/translations", base_url=LOCALAI_WHISPER_BASE_URL)


@app.post("/v1/audio/speech")
async def audio_speech(request: Request) -> Response:
    return await _localai_raw_post(request, "/v1/audio/speech", base_url=LOCALAI_TTS_BASE_URL)


@app.post("/v1/audio/music")
async def audio_music(request: Request) -> Response:
    if not MUSIC_ENABLED:
        raise HTTPException(status_code=503, detail="Experimental music backend is disabled")
    return await _localai_raw_post(request, "/v1/audio/music", base_url=LOCALAI_MUSIC_BASE_URL)


@app.get("/v1/audio/models")
async def audio_models(request: Request) -> Response:
    return await _localai_raw_get(request, "/v1/audio/models", base_url=LOCALAI_WHISPER_BASE_URL)


@app.get("/v1/audio/music/models")
async def audio_music_models(request: Request) -> Response:
    if not MUSIC_ENABLED:
        _require_gateway_key(request)
        return JSONResponse({"object": "list", "data": []})
    return await _localai_raw_get(request, "/v1/audio/music/models", base_url=LOCALAI_MUSIC_BASE_URL)


@app.get("/v1/rag/models")
async def rag_models(request: Request) -> Response:
    return await _localai_raw_get(request, "/v1/rag/models", base_url=LOCALAI_RERANK_BASE_URL)


@app.get("/v1/models")
async def models(request: Request) -> JSONResponse:
    _require_gateway_key(request)
    base_urls = [LOCALAI_TEXT_BASE_URL]
    if LOCALAI_MODELS_INCLUDE_BACKENDS:
        base_urls.extend(
            [
                LOCALAI_IMAGE_BASE_URL,
                LOCALAI_WHISPER_BASE_URL,
                LOCALAI_TTS_BASE_URL,
                LOCALAI_RERANK_BASE_URL,
            ]
        )
        if MUSIC_ENABLED:
            base_urls.append(LOCALAI_MUSIC_BASE_URL)
    unique_base_urls = list(dict.fromkeys(url.rstrip("/") for url in base_urls if url))

    merged: List[Dict[str, Any]] = []
    seen_ids: Set[str] = set()
    last_error: Optional[HTTPException] = None

    for base_url in unique_base_urls:
        try:
            models_list = await _fetch_models_from_localai(base_url)
        except HTTPException as exc:
            last_error = exc
            continue
        for model in models_list:
            model_id = str(model.get("id") or "").strip()
            if model_id and model_id in seen_ids:
                continue
            if model_id:
                seen_ids.add(model_id)
            merged.append(model)

    if not merged and last_error:
        raise last_error
    return JSONResponse({"object": "list", "data": merged})
