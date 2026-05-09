from __future__ import annotations

import json
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, AsyncIterator
from uuid import uuid4

from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.responses import FileResponse, HTMLResponse
from nc_py_api.ex_app import AppAPIAuthMiddleware, set_handlers
from nc_py_api.files import ActionFileInfoEx
from pydantic import BaseModel, Field

from .appapi import (
    default_preferences,
    enabled_handler,
    ensure_appapi_env_defaults,
    file_action_redirect,
    load_appconfig_values,
    load_user_preferences,
    maybe_nc_app,
    normalize_admin_updates,
    save_appconfig_values,
    save_user_preferences,
)
from .config import Settings, get_settings
from .nextcloud_client import NextcloudClient
from .openclaw_client import OpenClawClient


EX_APP_DIR = Path(__file__).resolve().parents[1]
UI_DIST_DIR = EX_APP_DIR / "ui-dist"
settings = get_settings()


class LocalStateStore:
    def __init__(self, state_path: Path) -> None:
        self.state_path = state_path
        self.state: dict[str, Any] = {
            "adminSettings": {},
            "preferences": {},
            "chatHistory": {},
            "recentOutputs": {},
        }
        self._load()

    def _load(self) -> None:
        if not self.state_path.exists():
            return
        try:
            self.state = json.loads(self.state_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            self.state = {
                "adminSettings": {},
                "preferences": {},
                "chatHistory": {},
                "recentOutputs": {},
            }

    def _save(self) -> None:
        self.state_path.parent.mkdir(parents=True, exist_ok=True)
        self.state_path.write_text(json.dumps(self.state, indent=2), encoding="utf-8")

    def get_preferences(self, user_id: str, defaults: dict[str, Any]) -> dict[str, Any]:
        stored = self.state.setdefault("preferences", {}).get(user_id, {})
        return {**defaults, **stored}

    def get_admin_settings(self) -> dict[str, Any]:
        return dict(self.state.setdefault("adminSettings", {}))

    def set_admin_settings(self, updates: dict[str, Any]) -> dict[str, Any]:
        stored = self.state.setdefault("adminSettings", {})
        stored.update(updates)
        self._save()
        return dict(stored)

    def set_preferences(self, user_id: str, updates: dict[str, Any]) -> dict[str, Any]:
        prefs = self.state.setdefault("preferences", {}).setdefault(user_id, {})
        prefs.update(updates)
        self._save()
        return prefs

    def _history_key(self, user_id: str, session_key: str) -> str:
        return f"{user_id}:{session_key}"

    def add_chat_turn(self, user_id: str, session_key: str, role: str, content: str) -> dict[str, Any]:
        entry = {
            "id": str(uuid4()),
            "role": role,
            "content": content,
            "timestamp": datetime.now(tz=timezone.utc).isoformat(),
        }
        key = self._history_key(user_id, session_key)
        items = self.state.setdefault("chatHistory", {}).setdefault(key, [])
        items.append(entry)
        self._save()
        return entry

    def get_chat(self, user_id: str, session_key: str) -> list[dict[str, Any]]:
        key = self._history_key(user_id, session_key)
        return self.state.setdefault("chatHistory", {}).get(key, [])

    def add_output(self, user_id: str, output: dict[str, Any]) -> None:
        items = self.state.setdefault("recentOutputs", {}).setdefault(user_id, [])
        items.insert(0, output)
        self.state["recentOutputs"][user_id] = items[:20]
        self._save()

    def get_outputs(self, user_id: str) -> list[dict[str, Any]]:
        return self.state.setdefault("recentOutputs", {}).get(user_id, [])


state_store = LocalStateStore(settings.state_file())


@asynccontextmanager
async def lifespan(app: FastAPI):
    ensure_appapi_env_defaults(settings)
    state_store.state_path.parent.mkdir(parents=True, exist_ok=True)
    set_handlers(app, enabled_handler)
    yield


app = FastAPI(title="OpenClaw Bridge ExApp", version=settings.app_version, lifespan=lifespan)
if not settings.allow_local_dev_auth:
    app.add_middleware(AppAPIAuthMiddleware, disable_for=["health", "img/*"])


class PreferencesPayload(BaseModel):
    sessionKey: str | None = None
    sendFileContent: bool | None = None
    advancedModeNewTab: bool | None = None


class FileContextPayload(BaseModel):
    fileIds: list[int] = Field(default_factory=list)
    includeContent: bool | None = None


class ChatSendPayload(BaseModel):
    prompt: str
    sessionKey: str | None = None
    fileIds: list[int] = Field(default_factory=list)
    fileContext: list[dict[str, Any]] = Field(default_factory=list)
    includeContent: bool | None = None
    saveOutput: bool = False
    outputFilename: str | None = None


def _extract_user(request: Request, app_settings: Settings) -> str:
    user = (
        request.scope.get("username")
        or request.headers.get("x-nextcloud-user")
        or request.headers.get("x-remote-user")
        or request.headers.get("oc-user")
    )

    if not user and app_settings.allow_local_dev_auth:
        user = app_settings.pilot_user

    if not user:
        raise HTTPException(status_code=401, detail="Authenticated Nextcloud user header required")

    return str(user)


def _enforce_origin(request: Request, app_settings: Settings) -> None:
    if not app_settings.csrf_trusted_origins:
        return

    origin = request.headers.get("origin")
    if origin and origin not in app_settings.csrf_trusted_origins:
        raise HTTPException(status_code=403, detail="Invalid origin")


def _forward_headers(request: Request) -> dict[str, str]:
    headers: dict[str, str] = {}
    for key in ("authorization", "cookie", "requesttoken"):
        value = request.headers.get(key)
        if value:
            headers[key] = value
    return headers


def require_user(request: Request) -> str:
    return _extract_user(request, settings)


async def effective_settings(
    nc=Depends(maybe_nc_app),
) -> Settings:
    overrides = await load_appconfig_values(nc, settings)
    if nc is None:
        overrides = {**overrides, **state_store.get_admin_settings()}
    return settings.with_overrides(overrides)


async def nextcloud_client_dependency(
    app_settings: Settings = Depends(effective_settings),
) -> AsyncIterator[NextcloudClient]:
    client = NextcloudClient(settings=app_settings)
    try:
        yield client
    finally:
        await client.close()


async def openclaw_client_dependency(
    app_settings: Settings = Depends(effective_settings),
) -> AsyncIterator[OpenClawClient]:
    client = OpenClawClient(settings=app_settings)
    try:
        yield client
    finally:
        await client.close()


async def preferences_for_request(
    user_id: str,
    app_settings: Settings,
    nc,
) -> dict[str, Any]:
    defaults = default_preferences(app_settings)
    if nc is None:
        return state_store.get_preferences(user_id, defaults)
    return await load_user_preferences(nc, defaults)


def _admin_settings_response(app_settings: Settings) -> dict[str, Any]:
    return {
        **app_settings.admin_settings_view(),
        "gatewayTokenConfigured": bool(app_settings.openclaw_gateway_token),
    }


def _resolve_ui_file(path: str) -> Path | None:
    normalized = path.lstrip("/")
    candidates = [UI_DIST_DIR / normalized]
    if normalized.startswith("img/"):
        candidates.append(EX_APP_DIR / normalized)
    for candidate in candidates:
        resolved = candidate.resolve()
        if not resolved.exists() or not resolved.is_file():
            continue
        if UI_DIST_DIR in resolved.parents or (EX_APP_DIR / "img") in resolved.parents:
            return resolved
    return None


def _serve_built_ui(path: str = ""):
    target = path or "index.html"
    candidate = _resolve_ui_file(target)
    if candidate is not None:
        return FileResponse(candidate)

    index_file = UI_DIST_DIR / "index.html"
    if index_file.exists():
        return FileResponse(index_file)

    fallback_html = """
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/><title>OpenClaw Bridge</title></head>
<body>
  <h1>OpenClaw Bridge</h1>
  <p>Frontend assets are not built yet. Build Vue assets and place them under <code>ex_app/ui-dist/</code>.</p>
</body>
</html>
""".strip()
    return HTMLResponse(content=fallback_html)


@app.get("/health")
async def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "appId": settings.app_id,
        "appVersion": settings.app_version,
        "chatBackend": settings.openclaw_chat_backend,
        "timestamp": datetime.now(tz=timezone.utc).isoformat(),
    }


@app.get("/")
@app.get("/chat")
@app.get("/file-action")
@app.get("/settings")
async def serve_embedded_ui(user_id: str = Depends(require_user)):
    _ = user_id
    return _serve_built_ui()


@app.get("/assets/{asset_path:path}")
async def serve_ui_assets(asset_path: str, user_id: str = Depends(require_user)):
    _ = user_id
    return _serve_built_ui(f"assets/{asset_path}")


@app.get("/img/{asset_path:path}")
async def serve_ui_images(asset_path: str):
    return _serve_built_ui(f"img/{asset_path}")


@app.get("/ui")
@app.get("/ui/")
@app.get("/ui/{full_path:path}")
async def serve_ui(full_path: str = "", user_id: str = Depends(require_user)):
    _ = user_id
    return _serve_built_ui(full_path)


@app.post("/file-actions/ask")
async def file_action_ask(
    payload: ActionFileInfoEx,
    user_id: str = Depends(require_user),
) -> dict[str, Any]:
    _ = user_id
    return {"redirect_handler": file_action_redirect("openclaw_ask", payload)}


@app.post("/file-actions/summarize")
async def file_action_summarize(
    payload: ActionFileInfoEx,
    user_id: str = Depends(require_user),
) -> dict[str, Any]:
    _ = user_id
    return {"redirect_handler": file_action_redirect("openclaw_summarize", payload)}


@app.post("/file-actions/add")
async def file_action_add(
    payload: ActionFileInfoEx,
    user_id: str = Depends(require_user),
) -> dict[str, Any]:
    _ = user_id
    return {"redirect_handler": file_action_redirect("openclaw_add_workspace", payload)}


@app.get("/api/me")
async def api_me(
    request: Request,
    user_id: str = Depends(require_user),
    nc=Depends(maybe_nc_app),
    app_settings: Settings = Depends(effective_settings),
    nextcloud: NextcloudClient = Depends(nextcloud_client_dependency),
) -> dict[str, Any]:
    profile = await nextcloud.get_me(_forward_headers(request), fallback_user=user_id)
    prefs = await preferences_for_request(user_id, app_settings, nc)
    return {
        "user": profile,
        "preferences": prefs,
        "localDevAuth": app_settings.allow_local_dev_auth,
    }


@app.get("/api/preferences")
async def get_preferences(
    user_id: str = Depends(require_user),
    nc=Depends(maybe_nc_app),
    app_settings: Settings = Depends(effective_settings),
) -> dict[str, Any]:
    return await preferences_for_request(user_id, app_settings, nc)


@app.post("/api/preferences")
async def set_preferences(
    request: Request,
    payload: PreferencesPayload,
    user_id: str = Depends(require_user),
    nc=Depends(maybe_nc_app),
    app_settings: Settings = Depends(effective_settings),
) -> dict[str, Any]:
    _enforce_origin(request, app_settings)
    updates = payload.model_dump(exclude_none=True)
    defaults = default_preferences(app_settings)

    if nc is None:
        current = state_store.get_preferences(user_id, defaults)
        new_prefs = state_store.set_preferences(user_id, {**current, **updates})
        return {"preferences": new_prefs}

    new_prefs = await save_user_preferences(nc, updates, defaults)
    return {"preferences": new_prefs}


@app.get("/api/admin/settings")
async def admin_settings(
    user_id: str = Depends(require_user),
    app_settings: Settings = Depends(effective_settings),
) -> dict[str, Any]:
    _ = user_id
    return _admin_settings_response(app_settings)


@app.post("/api/admin/settings")
async def set_admin_settings(
    request: Request,
    payload: dict[str, Any],
    user_id: str = Depends(require_user),
    nc=Depends(maybe_nc_app),
    app_settings: Settings = Depends(effective_settings),
) -> dict[str, Any]:
    _ = user_id
    _enforce_origin(request, app_settings)
    updates = {key: value for key, value in payload.items() if value is not None}

    if nc is None:
        current = state_store.get_admin_settings()
        stored = state_store.set_admin_settings({**current, **normalize_admin_updates(updates)})
        resolved = settings.with_overrides(stored)
        return {"settings": _admin_settings_response(resolved)}

    saved = await save_appconfig_values(nc, updates, settings)
    resolved = settings.with_overrides(saved)
    return {"settings": _admin_settings_response(resolved)}


@app.get("/api/chat/history")
async def chat_history(
    request: Request,
    sessionKey: str | None = Query(default=None),
    user_id: str = Depends(require_user),
    nc=Depends(maybe_nc_app),
    app_settings: Settings = Depends(effective_settings),
    openclaw: OpenClawClient = Depends(openclaw_client_dependency),
) -> dict[str, Any]:
    prefs = await preferences_for_request(user_id, app_settings, nc)
    session_key = sessionKey or prefs["sessionKey"]
    local_items = state_store.get_chat(user_id, session_key)

    remote_items: dict[str, Any] = {"items": []}
    try:
        remote_items = await openclaw.chat_history(session_key, user_id)
    except Exception:  # noqa: BLE001
        remote_items = {"items": []}

    return {
        "sessionKey": session_key,
        "local": local_items,
        "remote": remote_items,
    }


@app.post("/api/chat/send")
async def chat_send(
    request: Request,
    payload: ChatSendPayload,
    user_id: str = Depends(require_user),
    nc=Depends(maybe_nc_app),
    app_settings: Settings = Depends(effective_settings),
    nextcloud: NextcloudClient = Depends(nextcloud_client_dependency),
    openclaw: OpenClawClient = Depends(openclaw_client_dependency),
) -> dict[str, Any]:
    _enforce_origin(request, app_settings)
    clean_prompt = payload.prompt.strip()
    if not clean_prompt:
        raise HTTPException(status_code=400, detail="Prompt is required")

    prefs = await preferences_for_request(user_id, app_settings, nc)
    session_key = payload.sessionKey or prefs["sessionKey"]
    include_content = prefs["sendFileContent"] if payload.includeContent is None else payload.includeContent
    file_context = list(payload.fileContext)

    if payload.fileIds:
        file_context = await nextcloud.build_file_context(
            user_id=user_id,
            file_ids=payload.fileIds,
            upstream_headers=_forward_headers(request),
            include_content=include_content,
            safe_text_mime_types=app_settings.safe_text_mime_types,
        )

    result = await openclaw.send_prompt(
        prompt=clean_prompt,
        session_key=session_key,
        user_id=user_id,
        file_context=file_context,
    )

    state_store.add_chat_turn(user_id, session_key, "user", clean_prompt)
    assistant_turn = state_store.add_chat_turn(user_id, session_key, "assistant", result.get("reply", ""))

    saved_output: dict[str, Any] | None = None
    if payload.saveOutput and assistant_turn["content"]:
        stamp = datetime.now(tz=timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        filename = payload.outputFilename or f"openclaw-output-{stamp}.md"
        saved_output = await nextcloud.save_output(
            user_id=user_id,
            text=assistant_turn["content"],
            filename=filename,
            folder=app_settings.output_folder,
            upstream_headers=_forward_headers(request),
        )
        state_store.add_output(
            user_id,
            {
                "filename": filename,
                "path": saved_output["path"],
                "savedAt": datetime.now(tz=timezone.utc).isoformat(),
            },
        )

    return {
        "sessionKey": session_key,
        "reply": result.get("reply", ""),
        "provider": result.get("provider"),
        "model": result.get("model"),
        "fallback": result.get("fallback"),
        "fileContext": file_context,
        "savedOutput": saved_output,
    }


@app.get("/api/file-context")
async def file_context_get(
    request: Request,
    fileIds: str = Query(default=""),
    includeContent: bool | None = Query(default=None),
    user_id: str = Depends(require_user),
    nc=Depends(maybe_nc_app),
    app_settings: Settings = Depends(effective_settings),
    nextcloud: NextcloudClient = Depends(nextcloud_client_dependency),
) -> dict[str, Any]:
    ids = [int(part) for part in fileIds.split(",") if part.strip().isdigit()]
    prefs = await preferences_for_request(user_id, app_settings, nc)
    include_content = prefs["sendFileContent"] if includeContent is None else includeContent
    items = await nextcloud.build_file_context(
        user_id=user_id,
        file_ids=ids,
        upstream_headers=_forward_headers(request),
        include_content=include_content,
        safe_text_mime_types=app_settings.safe_text_mime_types,
    )
    return {"items": items}


@app.post("/api/file-context")
async def file_context_post(
    request: Request,
    payload: FileContextPayload,
    user_id: str = Depends(require_user),
    nc=Depends(maybe_nc_app),
    app_settings: Settings = Depends(effective_settings),
    nextcloud: NextcloudClient = Depends(nextcloud_client_dependency),
) -> dict[str, Any]:
    _enforce_origin(request, app_settings)
    prefs = await preferences_for_request(user_id, app_settings, nc)
    include_content = prefs["sendFileContent"] if payload.includeContent is None else payload.includeContent
    items = await nextcloud.build_file_context(
        user_id=user_id,
        file_ids=payload.fileIds,
        upstream_headers=_forward_headers(request),
        include_content=include_content,
        safe_text_mime_types=app_settings.safe_text_mime_types,
    )
    return {"items": items}


@app.get("/api/gateway/status")
async def gateway_status(
    user_id: str = Depends(require_user),
    openclaw: OpenClawClient = Depends(openclaw_client_dependency),
) -> dict[str, Any]:
    _ = user_id
    status = await openclaw.health()
    return {
        "reachable": status.reachable,
        "statusCode": status.status_code,
        "latencyMs": status.latency_ms,
        "detail": status.detail,
    }


@app.get("/api/ollama/status")
async def ollama_status(
    user_id: str = Depends(require_user),
    openclaw: OpenClawClient = Depends(openclaw_client_dependency),
) -> dict[str, Any]:
    _ = user_id
    return await openclaw.ollama_status()


@app.get("/api/open-control-ui-url")
async def open_control_ui_url(
    user_id: str = Depends(require_user),
    app_settings: Settings = Depends(effective_settings),
) -> dict[str, Any]:
    _ = user_id
    if app_settings.openclaw_control_ui_url:
        return {
            "available": True,
            "url": app_settings.openclaw_control_ui_url,
            "message": "",
        }

    if app_settings.openclaw_gateway_base_url:
        return {
            "available": True,
            "url": app_settings.openclaw_gateway_base_url,
            "message": "Using the configured gateway URL because no dedicated control UI URL is set.",
        }

    return {
        "available": False,
        "url": "",
        "message": "The control UI URL is not configured yet.",
    }


@app.get("/api/recent-outputs")
async def recent_outputs(user_id: str = Depends(require_user)) -> dict[str, Any]:
    return {"items": state_store.get_outputs(user_id)}


@app.get("/api/openai-compat-config")
async def openai_compat_config(
    user_id: str = Depends(require_user),
    app_settings: Settings = Depends(effective_settings),
) -> dict[str, Any]:
    _ = user_id
    if not app_settings.enable_openai_compat_mode:
        return {
            "enabled": False,
            "warning": "Disabled by default. Enable only for controlled operator validation.",
        }

    return {
        "enabled": True,
        "baseUrl": f"{app_settings.openclaw_gateway_base_url}/v1",
        "warning": "Operator-level endpoint; this is not a per-user isolation boundary.",
    }
