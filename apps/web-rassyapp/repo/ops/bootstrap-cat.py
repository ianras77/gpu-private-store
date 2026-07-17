#!/usr/bin/env python3
"""Bootstrap Cheshire Cat metadata so Ollama and package-owned auth stay enforced."""

from __future__ import annotations

import json
import os
import sys
import time
import uuid
from pathlib import Path

import bcrypt
import requests


def _patch_cat_embedder_auth(api_key: str) -> bool:
    source_path = Path("/app/cat/factory/custom_embedder.py")
    if not api_key.strip() or not source_path.exists():
        return False
    source = source_path.read_text()
    if "_rassyapp_gateway_headers" in source or "import httpx\n" not in source:
        return False
    helper = '''

def _rassyapp_gateway_headers():
    api_key = (os.getenv("CAT_OLLAMA_API_KEY") or os.getenv("OLLAMA_API_KEY") or "").strip()
    return {"Authorization": f"Bearer {api_key}"} if api_key else {}
'''
    source = source.replace("import httpx\n", f"import httpx\n{helper}", 1)
    source = source.replace("httpx.post(self.url, data=payload, timeout=None)", "httpx.post(self.url, data=payload, headers=_rassyapp_gateway_headers(), timeout=None)")
    source_path.write_text(source)
    return True


ADMIN_PERMISSIONS = {
    "STATUS": ["WRITE", "EDIT", "LIST", "READ", "DELETE"],
    "MEMORY": ["WRITE", "EDIT", "LIST", "READ", "DELETE"],
    "CONVERSATION": ["WRITE", "EDIT", "LIST", "READ", "DELETE"],
    "SETTINGS": ["WRITE", "EDIT", "LIST", "READ", "DELETE"],
    "LLM": ["WRITE", "EDIT", "LIST", "READ", "DELETE"],
    "EMBEDDER": ["WRITE", "EDIT", "LIST", "READ", "DELETE"],
    "AUTH_HANDLER": ["WRITE", "EDIT", "LIST", "READ", "DELETE"],
    "USERS": ["WRITE", "EDIT", "LIST", "READ", "DELETE"],
    "UPLOAD": ["WRITE", "EDIT", "LIST", "READ", "DELETE"],
    "PLUGINS": ["WRITE", "EDIT", "LIST", "READ", "DELETE"],
    "STATIC": ["WRITE", "EDIT", "LIST", "READ", "DELETE"],
}


def _env(name: str, default: str) -> str:
    value = os.getenv(name, default).strip()
    return value or default


def _env_flag(name: str, default: bool = True) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default

    normalized = raw.strip().lower()
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"0", "false", "no", "off"}:
        return False
    return default


def _ensure_entry(items: dict, name: str, category: str | None, default_value: dict) -> dict:
    for item in items.values():
        if isinstance(item, dict) and item.get("name") == name:
            return item

    numeric_keys = [int(key) for key in items if str(key).isdigit()]
    next_key = str(max(numeric_keys, default=0) + 1)
    entry = {
        "name": name,
        "value": default_value,
        "category": category,
        "setting_id": str(uuid.uuid4()),
        "updated_at": int(time.time()),
    }
    items[next_key] = entry
    return entry


def _hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def _ensure_core_user(items: dict, username: str, password: str) -> str | None:
    if not username or not password:
        return None

    users_entry = _ensure_entry(items, "users", None, {})
    users_value = users_entry.setdefault("value", {})

    for user in users_value.values():
        if isinstance(user, dict) and user.get("username") == username:
            user["password"] = _hash_password(password)
            user["permissions"] = ADMIN_PERMISSIONS
            users_entry["updated_at"] = int(time.time())
            return str(user.get("id"))

    user_id = str(uuid.uuid4())
    users_value[user_id] = {
        "id": user_id,
        "username": username,
        "password": _hash_password(password),
        "permissions": ADMIN_PERMISSIONS,
    }
    users_entry["updated_at"] = int(time.time())
    return user_id


def _available_models(base_url: str) -> list[str]:
    response = requests.get(f"{base_url.rstrip('/')}/api/tags", timeout=10)
    response.raise_for_status()
    payload = response.json()
    models = payload.get("models", [])
    return [model.get("name", "") for model in models if isinstance(model, dict)]


def _pick_model(base_url: str, configured: str) -> str:
    configured = configured.strip()
    if not configured:
        return configured

    try:
        available = _available_models(base_url)
    except Exception as exc:  # noqa: BLE001
        print(f"[cat-bootstrap] unable to query {base_url}: {exc}", file=sys.stderr)
        return configured

    if configured in available:
        return configured

    latest_name = f"{configured}:latest"
    if latest_name in available:
        return latest_name

    bare_name = configured.split(":", 1)[0]
    for candidate in available:
        if candidate == bare_name or candidate.startswith(f"{bare_name}:"):
            return candidate

    return configured


def main() -> int:
    metadata_path = Path(_env("CAT_METADATA_PATH", "/cat-data/metadata.json"))
    llm_base = _env("OLLAMA_BASE_URL", "http://host.docker.internal:8844")
    embed_base = _env("OLLAMA_EMBED_BASE_URL", "http://host.docker.internal:8844")
    apply_embedder = _env_flag("OLLAMA_APPLY_EMBEDDER", True)
    llm_model = _pick_model(llm_base, _env("OLLAMA_LLM_MODEL", "rassy-smart"))
    embed_model = (
        _pick_model(embed_base, _env("OLLAMA_EMBED_MODEL", "rassy-embed"))
        if apply_embedder
        else _env("OLLAMA_EMBED_MODEL", "rassy-embed")
    )
    admin_username = _env("CAT_ADMIN_USERNAME", "admin")
    admin_password = _env("CAT_ADMIN_PASSWORD", "admin")
    _patch_cat_embedder_auth(os.getenv("CAT_OLLAMA_API_KEY", ""))

    if not metadata_path.exists():
        print(f"[cat-bootstrap] metadata not found at {metadata_path}, skipping", file=sys.stderr)
        return 0

    payload = json.loads(metadata_path.read_text())
    items = payload.setdefault("_default", {})

    llm_entry = _ensure_entry(items, "LLMOllamaConfig", "llm_factory", {})
    llm_value = llm_entry.setdefault("value", {})
    llm_value["base_url"] = llm_base
    llm_value["model"] = llm_model
    llm_value.setdefault("num_ctx", 4096)
    llm_value.setdefault("repeat_last_n", 64)
    llm_value.setdefault("repeat_penalty", 1.1)
    llm_value.setdefault("temperature", 0.8)

    _ensure_entry(items, "llm_selected", "llm", {"name": "LLMOllamaConfig"})["value"] = {
        "name": "LLMOllamaConfig"
    }

    if apply_embedder:
        embed_entry = _ensure_entry(items, "EmbedderOllamaConfig", "embedder_factory", {})
        embed_value = embed_entry.setdefault("value", {})
        embed_value["base_url"] = embed_base
        embed_value["model"] = embed_model

        _ensure_entry(
            items,
            "embedder_selected",
            "embedder",
            {"name": "EmbedderOllamaConfig"},
        )["value"] = {"name": "EmbedderOllamaConfig"}

    user_id = _ensure_core_user(items, admin_username, admin_password)

    metadata_path.write_text(json.dumps(payload))
    embed_label = f"{embed_model}@{embed_base}" if apply_embedder else "unchanged"
    print(
        f"[cat-bootstrap] configured llm={llm_model}@{llm_base} "
        f"embed={embed_label} embed_auto={apply_embedder} "
        f"auth_user={admin_username} user_id={user_id}",
        file=sys.stderr,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
