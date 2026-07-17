#!/usr/bin/env python3
"""Ensure Cheshire Cat selects the shared Ollama chat and embed endpoints."""

from __future__ import annotations

import json
import os
import sys
import time
import uuid
from pathlib import Path


def _patch_cat_embedder_auth(api_key: str) -> bool:
    source_path = Path("/app/cat/factory/custom_embedder.py")
    if not api_key.strip() or not source_path.exists():
        return False
    source = source_path.read_text()
    if "_trt_gateway_headers" in source or "import httpx\n" not in source:
        return False
    helper = '''

def _trt_gateway_headers():
    api_key = (os.getenv("CAT_OLLAMA_API_KEY") or os.getenv("OLLAMA_API_KEY") or "").strip()
    return {"Authorization": f"Bearer {api_key}"} if api_key else {}
'''
    source = source.replace("import httpx\n", f"import httpx\n{helper}", 1)
    source = source.replace("httpx.post(self.url, data=payload, timeout=None)", "httpx.post(self.url, data=payload, headers=_trt_gateway_headers(), timeout=None)")
    source_path.write_text(source)
    return True


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


def main() -> int:
    metadata_path = Path(_env("CAT_METADATA_PATH", "/data/metadata.json"))
    llm_base = _env("OLLAMA_GENERAL_BASE_URL", "http://host.docker.internal:8844")
    embed_base = _env("OLLAMA_EMBED_BASE_URL", "http://host.docker.internal:8844")
    llm_model = _env("OLLAMA_GENERAL_MODEL", "rassy-smart")
    embed_model = _env("OLLAMA_EMBED_MODEL", "rassy-embed")
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
    llm_value.setdefault("temperature", 0.2)

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
    print(
        f"[cat-bootstrap] configured llm={llm_model}@{llm_base} embed={embed_model}@{embed_base}",
        file=sys.stderr,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
