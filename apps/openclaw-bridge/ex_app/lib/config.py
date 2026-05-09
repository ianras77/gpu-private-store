from __future__ import annotations

import os
from dataclasses import dataclass, replace
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, Tuple
from urllib.parse import urlparse


DEFAULT_SAFE_TEXT_MIME_TYPES = (
    "text/plain",
    "text/markdown",
    "text/csv",
    "application/json",
    "application/xml",
    "application/x-yaml",
)


DEFAULT_OLLAMA_GENERAL_URL = "http://127.0.0.1:8090"
DEFAULT_OLLAMA_CODE_URL = "http://127.0.0.1:8092"
DEFAULT_OLLAMA_EMBED_URL = "http://127.0.0.1:8091"


def _as_bool(value: str | None, default: bool) -> bool:
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _as_csv(value: str | None, default: Tuple[str, ...]) -> Tuple[str, ...]:
    if not value:
        return default
    parts = tuple(item.strip() for item in value.split(",") if item.strip())
    return parts or default


def _rstrip_slash(value: str) -> str:
    return value.rstrip("/")


def _normalize_string(value: Any, fallback: str = "") -> str:
    if value is None:
        return fallback
    return str(value).strip()


def _normalize_string_list(value: Any, fallback: Tuple[str, ...]) -> Tuple[str, ...]:
    if value is None:
        return fallback
    if isinstance(value, str):
        return _as_csv(value, fallback)
    if isinstance(value, (list, tuple, set)):
        parts = tuple(str(item).strip() for item in value if str(item).strip())
        return parts or fallback
    return fallback


def _origin_from_url(value: str | None) -> str:
    if not value:
        return ""

    parsed = urlparse(str(value).strip())
    if not parsed.scheme or not parsed.netloc:
        return ""
    return f"{parsed.scheme}://{parsed.netloc}"


def _resolve_csrf_trusted_origins(
    raw_value: str | None,
    nextcloud_url: str,
    nextcloud_public_url: str,
) -> Tuple[str, ...]:
    if raw_value is not None and raw_value.strip():
        return _as_csv(raw_value, ())

    derived: list[str] = []
    for candidate in (_origin_from_url(nextcloud_url), _origin_from_url(nextcloud_public_url)):
        if candidate and candidate not in derived:
            derived.append(candidate)
    return tuple(derived)


@dataclass(frozen=True)
class Settings:
    app_id: str
    app_version: str
    app_host: str
    app_port: int
    app_protocol: str
    app_persistent_storage: str
    pilot_user: str
    allow_local_dev_auth: bool
    nextcloud_url: str
    nextcloud_public_url: str
    nextcloud_verify_tls: bool
    nextcloud_ocs_path: str
    nextcloud_webdav_root: str
    openclaw_gateway_base_url: str
    openclaw_gateway_token_auth: bool
    openclaw_gateway_token: str
    openclaw_public_wss_url: str
    reverse_proxy_wss_public_url: str
    openclaw_control_ui_url: str
    openclaw_transport: str
    openclaw_chat_backend: str
    enable_openai_compat_mode: bool
    ollama_general_base_url: str
    ollama_code_base_url: str
    ollama_embed_base_url: str
    ollama_chat_model: str
    ollama_code_model: str
    ollama_embed_model: str
    output_folder: str
    default_send_file_content: bool
    default_advanced_mode_new_tab: bool
    safe_text_mime_types: Tuple[str, ...]
    request_timeout_seconds: float
    csrf_trusted_origins: Tuple[str, ...]

    @classmethod
    def from_env(cls) -> "Settings":
        nextcloud_url = _rstrip_slash(os.getenv("NEXTCLOUD_URL", "http://127.0.0.1/nextcloud"))
        nextcloud_public_url = _rstrip_slash(os.getenv("NEXTCLOUD_PUBLIC_URL", nextcloud_url))

        return cls(
            app_id=os.getenv("APP_ID", "openclaw_bridge"),
            app_version=os.getenv("APP_VERSION", "0.2.0"),
            app_host=os.getenv("APP_HOST", "127.0.0.1"),
            app_port=int(os.getenv("APP_PORT", "18090")),
            app_protocol=os.getenv("APP_PROTOCOL", "http").strip().lower(),
            app_persistent_storage=os.getenv("APP_PERSISTENT_STORAGE", "/tmp/openclaw_bridge"),
            pilot_user=os.getenv("PILOT_USER", "ian"),
            allow_local_dev_auth=_as_bool(os.getenv("ALLOW_LOCAL_DEV_AUTH"), False),
            nextcloud_url=nextcloud_url,
            nextcloud_public_url=nextcloud_public_url,
            nextcloud_verify_tls=_as_bool(os.getenv("NEXTCLOUD_VERIFY_TLS"), True),
            nextcloud_ocs_path=os.getenv("NEXTCLOUD_OCS_PATH", "/ocs/v2.php"),
            nextcloud_webdav_root=os.getenv("NEXTCLOUD_WEBDAV_ROOT", "/remote.php/dav/files"),
            openclaw_gateway_base_url=_rstrip_slash(
                os.getenv("OPENCLAW_GATEWAY_BASE_URL", "http://127.0.0.1:18789")
            ),
            openclaw_gateway_token_auth=_as_bool(os.getenv("OPENCLAW_GATEWAY_TOKEN_AUTH"), True),
            openclaw_gateway_token=os.getenv("OPENCLAW_GATEWAY_TOKEN", "").strip(),
            openclaw_public_wss_url=os.getenv("OPENCLAW_PUBLIC_WSS_URL", "").strip(),
            reverse_proxy_wss_public_url=os.getenv("REVERSE_PROXY_WSS_PUBLIC_URL", "").strip(),
            openclaw_control_ui_url=os.getenv("OPENCLAW_CONTROL_UI_URL", "").strip(),
            openclaw_transport=os.getenv("OPENCLAW_TRANSPORT", "http").strip().lower(),
            openclaw_chat_backend=os.getenv("OPENCLAW_CHAT_BACKEND", "auto").strip().lower(),
            enable_openai_compat_mode=_as_bool(os.getenv("ENABLE_OPENAI_COMPAT_MODE"), False),
            ollama_general_base_url=_rstrip_slash(
                os.getenv("OLLAMA_GENERAL_BASE_URL", DEFAULT_OLLAMA_GENERAL_URL)
            ),
            ollama_code_base_url=_rstrip_slash(
                os.getenv("OLLAMA_CODE_BASE_URL", DEFAULT_OLLAMA_CODE_URL)
            ),
            ollama_embed_base_url=_rstrip_slash(
                os.getenv("OLLAMA_EMBED_BASE_URL", DEFAULT_OLLAMA_EMBED_URL)
            ),
            ollama_chat_model=os.getenv("OLLAMA_CHAT_MODEL", "").strip(),
            ollama_code_model=os.getenv("OLLAMA_CODE_MODEL", "").strip(),
            ollama_embed_model=os.getenv("OLLAMA_EMBED_MODEL", "").strip(),
            output_folder=os.getenv("OPENCLAW_OUTPUT_FOLDER", "OpenClaw/Outputs").strip("/"),
            default_send_file_content=_as_bool(os.getenv("DEFAULT_SEND_FILE_CONTENT"), True),
            default_advanced_mode_new_tab=_as_bool(
                os.getenv("DEFAULT_ADVANCED_MODE_NEW_TAB"),
                True,
            ),
            safe_text_mime_types=_as_csv(
                os.getenv("SAFE_TEXT_MIME_TYPES"),
                DEFAULT_SAFE_TEXT_MIME_TYPES,
            ),
            request_timeout_seconds=float(os.getenv("REQUEST_TIMEOUT_SECONDS", "30")),
            csrf_trusted_origins=_resolve_csrf_trusted_origins(
                os.getenv("CSRF_TRUSTED_ORIGINS"),
                nextcloud_url,
                nextcloud_public_url,
            ),
        )

    def default_user_preferences(self) -> Dict[str, Any]:
        return {
            "sessionKey": "default",
            "sendFileContent": self.default_send_file_content,
            "advancedModeNewTab": self.default_advanced_mode_new_tab,
        }

    def admin_config_defaults(self) -> Dict[str, Any]:
        return {
            "openclaw_gateway_base_url": self.openclaw_gateway_base_url,
            "openclaw_gateway_token_auth": self.openclaw_gateway_token_auth,
            "openclaw_gateway_token": self.openclaw_gateway_token,
            "openclaw_public_wss_url": self.openclaw_public_wss_url,
            "reverse_proxy_wss_public_url": self.reverse_proxy_wss_public_url,
            "openclaw_control_ui_url": self.openclaw_control_ui_url,
            "openclaw_transport": self.openclaw_transport,
            "openclaw_chat_backend": self.openclaw_chat_backend,
            "enable_openai_compat_mode": self.enable_openai_compat_mode,
            "ollama_general_base_url": self.ollama_general_base_url,
            "ollama_code_base_url": self.ollama_code_base_url,
            "ollama_embed_base_url": self.ollama_embed_base_url,
            "ollama_chat_model": self.ollama_chat_model,
            "ollama_code_model": self.ollama_code_model,
            "ollama_embed_model": self.ollama_embed_model,
            "output_folder": self.output_folder,
            "safe_text_mime_types": ",".join(self.safe_text_mime_types),
        }

    def apply_admin_overrides(self, overrides: Dict[str, Any] | None) -> "Settings":
        if not overrides:
            return self

        current = self.admin_settings_view()
        merged = {**current, **overrides}

        return replace(
            self,
            openclaw_gateway_base_url=_rstrip_slash(
                _normalize_string(
                    merged.get("openclawGatewayBaseUrl", self.openclaw_gateway_base_url),
                    self.openclaw_gateway_base_url,
                )
            ),
            openclaw_gateway_token_auth=_as_bool(
                _normalize_string(
                    merged.get("gatewayTokenBasedAuth", self.openclaw_gateway_token_auth),
                    str(self.openclaw_gateway_token_auth),
                ),
                self.openclaw_gateway_token_auth,
            ),
            openclaw_gateway_token=_normalize_string(
                merged.get("openclawGatewayToken", self.openclaw_gateway_token),
                self.openclaw_gateway_token,
            ),
            openclaw_public_wss_url=_normalize_string(
                merged.get("openclawPublicWssUrl", self.openclaw_public_wss_url),
                self.openclaw_public_wss_url,
            ),
            reverse_proxy_wss_public_url=_normalize_string(
                merged.get("reverseProxyWssPublicUrl", self.reverse_proxy_wss_public_url),
                self.reverse_proxy_wss_public_url,
            ),
            openclaw_control_ui_url=_normalize_string(
                merged.get("openclawControlUiUrl", self.openclaw_control_ui_url),
                self.openclaw_control_ui_url,
            ),
            openclaw_transport=_normalize_string(
                merged.get("openclawTransport", self.openclaw_transport),
                self.openclaw_transport,
            ).lower(),
            openclaw_chat_backend=_normalize_string(
                merged.get("openclawChatBackend", self.openclaw_chat_backend),
                self.openclaw_chat_backend,
            ).lower(),
            enable_openai_compat_mode=_as_bool(
                _normalize_string(
                    merged.get("enableOpenAiCompatMode", self.enable_openai_compat_mode),
                    str(self.enable_openai_compat_mode),
                ),
                self.enable_openai_compat_mode,
            ),
            ollama_general_base_url=_rstrip_slash(
                _normalize_string(
                    merged.get("ollamaGeneralBaseUrl", self.ollama_general_base_url),
                    self.ollama_general_base_url,
                )
            ),
            ollama_code_base_url=_rstrip_slash(
                _normalize_string(
                    merged.get("ollamaCodeBaseUrl", self.ollama_code_base_url),
                    self.ollama_code_base_url,
                )
            ),
            ollama_embed_base_url=_rstrip_slash(
                _normalize_string(
                    merged.get("ollamaEmbedBaseUrl", self.ollama_embed_base_url),
                    self.ollama_embed_base_url,
                )
            ),
            ollama_chat_model=_normalize_string(
                merged.get("ollamaChatModel", self.ollama_chat_model),
                self.ollama_chat_model,
            ),
            ollama_code_model=_normalize_string(
                merged.get("ollamaCodeModel", self.ollama_code_model),
                self.ollama_code_model,
            ),
            ollama_embed_model=_normalize_string(
                merged.get("ollamaEmbedModel", self.ollama_embed_model),
                self.ollama_embed_model,
            ),
            output_folder=_normalize_string(
                merged.get("outputFolder", self.output_folder),
                self.output_folder,
            ).strip("/"),
            safe_text_mime_types=_normalize_string_list(
                merged.get("safeTextMimeTypes", self.safe_text_mime_types),
                self.safe_text_mime_types,
            ),
        )

    def admin_settings_view(self) -> Dict[str, Any]:
        return {
            "openclawGatewayBaseUrl": self.openclaw_gateway_base_url,
            "gatewayTokenBasedAuth": self.openclaw_gateway_token_auth,
            "reverseProxyWssPublicUrl": self.reverse_proxy_wss_public_url,
            "openclawPublicWssUrl": self.openclaw_public_wss_url,
            "openclawControlUiUrl": self.openclaw_control_ui_url,
            "openclawTransport": self.openclaw_transport,
            "openclawChatBackend": self.openclaw_chat_backend,
            "enableOpenAiCompatMode": self.enable_openai_compat_mode,
            "ollamaGeneralBaseUrl": self.ollama_general_base_url,
            "ollamaCodeBaseUrl": self.ollama_code_base_url,
            "ollamaEmbedBaseUrl": self.ollama_embed_base_url,
            "ollamaChatModel": self.ollama_chat_model,
            "ollamaCodeModel": self.ollama_code_model,
            "ollamaEmbedModel": self.ollama_embed_model,
            "outputFolder": self.output_folder,
            "safeTextMimeTypes": list(self.safe_text_mime_types),
        }

    def with_overrides(self, overrides: Dict[str, Any] | None) -> "Settings":
        if not overrides:
            return self

        resolved: Dict[str, Any] = {}
        for key, value in overrides.items():
            if not hasattr(self, key):
                continue
            if key in {
                "openclaw_gateway_base_url",
                "ollama_general_base_url",
                "ollama_code_base_url",
                "ollama_embed_base_url",
            }:
                resolved[key] = _rstrip_slash(_normalize_string(value, str(getattr(self, key))))
                continue
            if key in {
                "openclaw_public_wss_url",
                "reverse_proxy_wss_public_url",
                "openclaw_control_ui_url",
                "openclaw_gateway_token",
            }:
                resolved[key] = _normalize_string(value, str(getattr(self, key)))
                continue
            if key in {"openclaw_transport", "openclaw_chat_backend"}:
                resolved[key] = _normalize_string(value, str(getattr(self, key))).lower()
                continue
            if key in {"openclaw_gateway_token_auth", "enable_openai_compat_mode"}:
                resolved[key] = _as_bool(
                    _normalize_string(value, str(getattr(self, key))),
                    bool(getattr(self, key)),
                )
                continue
            if key == "output_folder":
                resolved[key] = _normalize_string(value, str(getattr(self, key))).strip("/")
                continue
            if key == "safe_text_mime_types":
                resolved[key] = _normalize_string_list(value, self.safe_text_mime_types)
                continue
            resolved[key] = value
        return replace(self, **resolved)

    def state_file(self) -> Path:
        return Path(self.app_persistent_storage) / "state.json"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings.from_env()
