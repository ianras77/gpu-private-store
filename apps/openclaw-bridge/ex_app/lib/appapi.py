from __future__ import annotations

import json
import os
from functools import lru_cache
from pathlib import Path
from typing import Any, Mapping
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

from fastapi import Request
from nc_py_api import AsyncNextcloudApp
from nc_py_api.ex_app import LogLvl, SettingsField, SettingsFieldType, SettingsForm, anc_app
from nc_py_api.files import ActionFileInfoEx

from .config import Settings


TOP_MENU_ENTRY_NAME = "openclaw_bridge"
TOP_MENU_DISPLAY_NAME = "OpenClaw"
ICON_PATH = "img/openclaw.svg"


FILE_ACTIONS: tuple[dict[str, Any], ...] = (
    {
        "id": "openclaw_ask",
        "label": "Ask OpenClaw about this file",
        "handler": "file-actions/ask",
        "redirect": "/file-action?action=ask",
        "order": 10,
    },
    {
        "id": "openclaw_summarize",
        "label": "Summarize with OpenClaw",
        "handler": "file-actions/summarize",
        "redirect": "/file-action?action=summarize",
        "order": 20,
    },
    {
        "id": "openclaw_add_workspace",
        "label": "Add to OpenClaw workspace",
        "handler": "file-actions/add",
        "redirect": "/file-action?action=add",
        "order": 30,
    },
)


DECLARATIVE_SETTINGS_PATH = Path(__file__).resolve().parents[2] / "appinfo" / "declarative_settings.json"

ADMIN_SETTINGS_API_TO_FIELD: dict[str, str] = {
    "openclawGatewayBaseUrl": "openclaw_gateway_base_url",
    "gatewayTokenBasedAuth": "openclaw_gateway_token_auth",
    "openclawGatewayToken": "openclaw_gateway_token",
    "openclawControlUiUrl": "openclaw_control_ui_url",
    "openclawTransport": "openclaw_transport",
    "openclawPublicWssUrl": "openclaw_public_wss_url",
    "reverseProxyWssPublicUrl": "reverse_proxy_wss_public_url",
    "openclawChatBackend": "openclaw_chat_backend",
    "enableOpenAiCompatMode": "enable_openai_compat_mode",
    "ollamaGeneralBaseUrl": "ollama_general_base_url",
    "ollamaCodeBaseUrl": "ollama_code_base_url",
    "ollamaEmbedBaseUrl": "ollama_embed_base_url",
    "ollamaChatModel": "ollama_chat_model",
    "ollamaCodeModel": "ollama_code_model",
    "ollamaEmbedModel": "ollama_embed_model",
    "outputFolder": "output_folder",
    "safeTextMimeTypes": "safe_text_mime_types",
}


def ensure_appapi_env_defaults(settings: Settings) -> None:
    os.environ.setdefault("APP_ID", settings.app_id)
    os.environ.setdefault("APP_DISPLAY_NAME", TOP_MENU_DISPLAY_NAME)
    os.environ.setdefault("APP_VERSION", settings.app_version)
    os.environ.setdefault("APP_HOST", settings.app_host)
    os.environ.setdefault("APP_PORT", str(settings.app_port))
    os.environ.setdefault("APP_PROTOCOL", settings.app_protocol)
    os.environ.setdefault("NEXTCLOUD_URL", settings.nextcloud_url)
    os.environ.setdefault("NEXTCLOUD_PUBLIC_URL", settings.nextcloud_public_url)
    os.environ.setdefault("APP_PERSISTENT_STORAGE", settings.app_persistent_storage)


@lru_cache(maxsize=1)
def load_declarative_forms() -> tuple[SettingsForm, ...]:
    payload = json.loads(DECLARATIVE_SETTINGS_PATH.read_text(encoding="utf-8"))
    return tuple(SettingsForm.from_dict(item) for item in payload.get("forms", []))


@lru_cache(maxsize=1)
def form_by_section() -> dict[str, SettingsForm]:
    return {form.section_type: form for form in load_declarative_forms()}


@lru_cache(maxsize=1)
def form_by_id() -> dict[str, SettingsForm]:
    return {form.id: form for form in load_declarative_forms()}


@lru_cache(maxsize=1)
def field_by_key() -> dict[str, SettingsField]:
    fields: dict[str, SettingsField] = {}
    for form in load_declarative_forms():
        for field in form.fields:
            fields[field.id] = field
    return fields


def admin_form() -> SettingsForm:
    return form_by_section()["admin"]


def personal_form() -> SettingsForm:
    return form_by_section()["personal"]


def parse_stored_value(field: SettingsField, raw: str | None) -> Any:
    if raw is None:
        return field.default

    if field.type == SettingsFieldType.CHECKBOX:
        return str(raw).strip().lower() in {"1", "true", "yes", "on"}

    if field.type == SettingsFieldType.NUMBER:
        if isinstance(field.default, int) and not isinstance(field.default, bool):
            return int(raw)
        return float(raw)

    if field.type in {SettingsFieldType.MULTI_CHECKBOX, SettingsFieldType.MULTI_SELECT}:
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            return field.default

    return raw


def serialize_setting_value(field: SettingsField, value: Any) -> str:
    if value is None:
        return ""

    if field.type == SettingsFieldType.CHECKBOX:
        return "1" if bool(value) else "0"

    if field.type == SettingsFieldType.NUMBER:
        return str(value)

    if field.type in {SettingsFieldType.MULTI_CHECKBOX, SettingsFieldType.MULTI_SELECT}:
        return json.dumps(value)

    return str(value)


def appconfig_defaults(settings: Settings) -> dict[str, Any]:
    defaults = settings.admin_config_defaults()
    for field in admin_form().fields:
        defaults.setdefault(field.id, field.default)
    return defaults


def _normalize_admin_value(field_id: str, value: Any) -> Any:
    if value is None:
        return None

    if field_id in {
        "openclaw_gateway_base_url",
        "ollama_general_base_url",
        "ollama_code_base_url",
        "ollama_embed_base_url",
    }:
        return str(value).strip().rstrip("/")

    if field_id in {
        "openclaw_public_wss_url",
        "reverse_proxy_wss_public_url",
        "openclaw_control_ui_url",
        "openclaw_gateway_token",
    }:
        return str(value).strip()

    if field_id in {"openclaw_transport", "openclaw_chat_backend"}:
        return str(value).strip().lower()

    if field_id == "output_folder":
        return str(value).strip().strip("/")

    if field_id == "safe_text_mime_types":
        if isinstance(value, str):
            parts = [item.strip() for item in value.split(",") if item.strip()]
            return ",".join(parts)
        if isinstance(value, (list, tuple, set)):
            parts = [str(item).strip() for item in value if str(item).strip()]
            return ",".join(parts)
        return ""

    return value


def normalize_admin_updates(updates: Mapping[str, Any]) -> dict[str, Any]:
    normalized: dict[str, Any] = {}
    valid_field_ids = {field.id for field in admin_form().fields}

    for key, value in updates.items():
        if value is None or key == "gatewayTokenConfigured":
            continue

        field_id = ADMIN_SETTINGS_API_TO_FIELD.get(key, key)
        if field_id not in valid_field_ids:
            continue

        normalized[field_id] = _normalize_admin_value(field_id, value)

    return normalized


async def maybe_nc_app(request: Request) -> AsyncNextcloudApp | None:
    if not request.headers.get("authorization-app-api"):
        return None

    required_env = ("APP_SECRET", "APP_VERSION", "APP_ID", "NEXTCLOUD_URL")
    if any(not os.getenv(key) for key in required_env):
        return None

    try:
        return anc_app(request)
    except Exception:  # noqa: BLE001
        return None


async def load_appconfig_values(
    nc: AsyncNextcloudApp | None,
    settings: Settings,
) -> dict[str, Any]:
    defaults = appconfig_defaults(settings)
    if nc is None:
        return defaults

    values = dict(defaults)
    try:
        for field in admin_form().fields:
            raw = await nc.appconfig_ex.get_value(field.id, None)
            values[field.id] = parse_stored_value(field, raw)
    except Exception:  # noqa: BLE001
        return defaults
    return values


async def save_appconfig_values(
    nc: AsyncNextcloudApp,
    updates: Mapping[str, Any],
    settings: Settings,
) -> dict[str, Any]:
    current = await load_appconfig_values(nc, settings)
    normalized = normalize_admin_updates(updates)
    saved = dict(current)

    for key, value in normalized.items():
        field = field_by_key().get(key)
        if field is None:
            continue
        await nc.appconfig_ex.set_value(
            key,
            serialize_setting_value(field, value),
            sensitive=getattr(field, "sensitive", None),
        )
        saved[key] = value

    return saved


async def load_user_preferences(
    nc: AsyncNextcloudApp | None,
    defaults: dict[str, Any],
) -> dict[str, Any]:
    if nc is None:
        return defaults

    values = dict(defaults)
    try:
        for field in personal_form().fields:
            raw = await nc.preferences_ex.get_value(field.id, None)
            values[field.id] = parse_stored_value(field, raw)
    except Exception:  # noqa: BLE001
        return defaults
    return values


async def save_user_preferences(
    nc: AsyncNextcloudApp,
    updates: dict[str, Any],
    defaults: dict[str, Any],
) -> dict[str, Any]:
    current = await load_user_preferences(nc, defaults)
    saved = dict(current)

    for key, value in updates.items():
        field = field_by_key().get(key)
        if field is None:
            continue
        await nc.preferences_ex.set_value(key, serialize_setting_value(field, value))
        saved[key] = value

    return saved


def default_preferences(settings: Settings) -> dict[str, Any]:
    defaults = settings.default_user_preferences()
    for field in personal_form().fields:
        defaults.setdefault(field.id, field.default)
    return defaults


async def register_ui_surfaces(nc: AsyncNextcloudApp) -> None:
    await nc.ui.top_menu.register(
        TOP_MENU_ENTRY_NAME,
        TOP_MENU_DISPLAY_NAME,
        icon=ICON_PATH,
    )

    for action in FILE_ACTIONS:
        await nc.ui.files_dropdown_menu.register_ex(
            action["id"],
            action["label"],
            action["handler"],
            icon=ICON_PATH,
            mime="file",
            order=action["order"],
        )

    for form in load_declarative_forms():
        await nc.ui.settings.register_form(form)


async def unregister_ui_surfaces(nc: AsyncNextcloudApp) -> None:
    for form in load_declarative_forms():
        await nc.ui.settings.unregister_form(form.id, not_fail=True)

    for action in FILE_ACTIONS:
        await nc.ui.files_dropdown_menu.unregister(action["id"], not_fail=True)

    await nc.ui.top_menu.unregister(TOP_MENU_ENTRY_NAME, not_fail=True)


async def enabled_handler(enabled: bool, nc: AsyncNextcloudApp) -> str:
    try:
        if enabled:
            await register_ui_surfaces(nc)
            await nc.log(LogLvl.INFO, "OpenClaw Bridge surfaces registered.")
        else:
            await unregister_ui_surfaces(nc)
            await nc.log(LogLvl.INFO, "OpenClaw Bridge surfaces unregistered.")
    except Exception as exc:  # noqa: BLE001
        message = f"OpenClaw Bridge lifecycle failed: {exc}"
        try:
            await nc.log(LogLvl.ERROR, message)
        except Exception:  # noqa: BLE001
            pass
        return message[:250]

    return ""


def file_action_redirect(action_id: str, payload: ActionFileInfoEx | None = None) -> str:
    for action in FILE_ACTIONS:
        if action["id"] == action_id:
            redirect = str(action["redirect"])
            if payload is None:
                return redirect

            file_ids = [str(item.fileId) for item in payload.files if getattr(item, "fileId", None) is not None]
            if not file_ids:
                return redirect

            parsed = urlparse(redirect)
            params = dict(parse_qsl(parsed.query, keep_blank_values=True))
            params["fileIds"] = ",".join(file_ids)
            params["selectionCount"] = str(len(file_ids))
            return urlunparse(parsed._replace(query=urlencode(params)))
    raise KeyError(action_id)
