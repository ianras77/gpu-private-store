#!/usr/bin/env python3
"""Ensure Cheshire Cat selects the shared Ollama chat and embed endpoints."""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
import sys
import time
import uuid
from pathlib import Path


def _env(name: str, default: str) -> str:
    value = os.getenv(name, default).strip()
    return value or default


def _ensure_entry(items: dict, name: str, category: str, default_value: dict) -> dict:
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


def _normalize_model_name(model: str) -> str:
    return str(model or "").strip().lower().removesuffix(":latest")


def _load_metadata(path: Path) -> dict:
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        return {"_default": {}}

    raw = path.read_text().strip()
    if not raw:
        return {"_default": {}}

    try:
        payload = json.loads(raw)
    except json.JSONDecodeError:
        return {"_default": {}}

    if isinstance(payload, dict):
        return payload
    return {"_default": {}}


def _tags_url(base_url: str) -> str:
    normalized = base_url.rstrip("/")
    for suffix in ("/api/chat", "/v1/chat/completions", "/api/embeddings", "/api/embed"):
        if normalized.endswith(suffix):
            normalized = normalized.removesuffix(suffix)
            break
    return f"{normalized}/api/tags"


def _patch_cat_embedder_auth(api_key: str, *, source_path: Path = Path("/app/cat/factory/custom_embedder.py")) -> bool:
    if not api_key.strip() or not source_path.exists():
        return False

    source = source_path.read_text()
    if "_bat_gateway_headers" in source:
        return False

    helper = '''

def _bat_gateway_headers():
    api_key = (
        os.getenv("CAT_OLLAMA_API_KEY")
        or os.getenv("OLLAMA_API_KEY")
        or os.getenv("LLM_API_KEY")
        or ""
    ).strip()
    if not api_key:
        return {}
    return {"Authorization": f"Bearer {api_key}"}
'''
    if "import httpx\n" not in source:
        return False
    source = source.replace("import httpx\n", f"import httpx\n{helper}", 1)
    source = source.replace(
        "httpx.post(self.url, data=payload, timeout=None)",
        "httpx.post(self.url, data=payload, headers=_bat_gateway_headers(), timeout=None)",
    )
    source_path.write_text(source)
    return True


def main() -> int:
    metadata_path = Path(_env("CAT_METADATA_PATH", "/data/metadata.json"))
    llm_base = _env("CAT_OLLAMA_GENERAL_BASE_URL", _env("OLLAMA_GENERAL_BASE_URL", "http://host.docker.internal:8844"))
    embed_base = _env("CAT_OLLAMA_EMBED_BASE_URL", _env("OLLAMA_EMBED_BASE_URL", "http://host.docker.internal:8844"))
    llm_model = _env("CAT_OLLAMA_GENERAL_MODEL", _env("OLLAMA_GENERAL_MODEL", "rassy-smart"))
    embed_model = _env("CAT_OLLAMA_EMBED_MODEL", _env("OLLAMA_EMBED_MODEL", "rassy-embed"))
    ollama_api_key = (
        os.getenv("CAT_OLLAMA_API_KEY")
        or os.getenv("OLLAMA_API_KEY")
        or os.getenv("LLM_API_KEY")
        or ""
    ).strip()
    ollama_num_ctx = max(2048, int(_env("CAT_OLLAMA_NUM_CTX", _env("OLLAMA_NUM_CTX", "8192"))))
    ollama_repeat_last_n = max(0, int(_env("CAT_OLLAMA_REPEAT_LAST_N", _env("OLLAMA_REPEAT_LAST_N", "96"))))
    ollama_repeat_penalty = max(
        1.0,
        float(_env("CAT_OLLAMA_REPEAT_PENALTY", _env("OLLAMA_REPEAT_PENALTY", "1.12"))),
    )
    ollama_temperature = max(
        0.0,
        min(float(_env("CAT_OLLAMA_TEMPERATURE", _env("OLLAMA_TEMPERATURE", "0.2"))), 1.2),
    )
    bootstrap_wait_seconds = max(0, int(_env("CAT_BOOTSTRAP_WAIT_SECONDS", "45")))
    if _patch_cat_embedder_auth(ollama_api_key):
        print("[cat-bootstrap] patched CustomOllamaEmbeddings with gateway auth headers", file=sys.stderr)
    payload = _load_metadata(metadata_path)

    items = payload.setdefault("_default", {})

    llm_entry = _ensure_entry(items, "LLMOllamaConfig", "llm_factory", {})
    llm_value = llm_entry.setdefault("value", {})
    llm_value["base_url"] = llm_base
    llm_value["model"] = llm_model
    llm_value["num_ctx"] = ollama_num_ctx
    llm_value["repeat_last_n"] = ollama_repeat_last_n
    llm_value["repeat_penalty"] = ollama_repeat_penalty
    llm_value["temperature"] = ollama_temperature

    embed_entry = _ensure_entry(items, "EmbedderOllamaConfig", "embedder_factory", {})
    embed_value = embed_entry.setdefault("value", {})
    embed_value["base_url"] = embed_base
    embed_value["model"] = embed_model

    _ensure_entry(items, "llm_selected", "llm", {"name": "LLMOllamaConfig"})["value"] = {
        "name": "LLMOllamaConfig"
    }
    _ensure_entry(
        items,
        "embedder_selected",
        "embedder",
        {"name": "EmbedderOllamaConfig"},
    )["value"] = {"name": "EmbedderOllamaConfig"}

    metadata_path.write_text(json.dumps(payload))

    for base_url, model_name, label in (
        (llm_base, llm_model, "llm"),
        (embed_base, embed_model, "embed"),
    ):
        tags_url = _tags_url(base_url)
        deadline = time.time() + bootstrap_wait_seconds
        last_error = ""
        while True:
            try:
                with urllib.request.urlopen(tags_url, timeout=5) as response:
                    payload = json.loads(response.read().decode("utf-8"))
                models = [
                    str(item.get("name") or item.get("model") or "").strip()
                    for item in payload.get("models", [])
                    if isinstance(item, dict)
                ]
                if any(_normalize_model_name(name) == _normalize_model_name(model_name) for name in models):
                    break
                last_error = f"model '{model_name}' not found in tags"
            except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
                last_error = str(exc)
            if time.time() >= deadline:
                print(
                    f"[cat-bootstrap] warning: {label} model check did not confirm {model_name} at {tags_url}: {last_error}",
                    file=sys.stderr,
                )
                break
            time.sleep(1)

    print(
        f"[cat-bootstrap] configured llm={llm_model}@{llm_base} embed={embed_model}@{embed_base}",
        file=sys.stderr,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
