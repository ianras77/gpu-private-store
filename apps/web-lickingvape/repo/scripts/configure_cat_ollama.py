#!/usr/bin/env python3
"""Configure Cheshire Cat metadata to use local Ollama LLM + embedder."""

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
    if "_lickingvape_gateway_headers" in source or "import httpx\n" not in source:
        return False
    helper = '''

def _lickingvape_gateway_headers():
    api_key = (os.getenv("CAT_OLLAMA_API_KEY") or os.getenv("OLLAMA_API_KEY") or "").strip()
    return {"Authorization": f"Bearer {api_key}"} if api_key else {}
'''
    source = source.replace("import httpx\n", f"import httpx\n{helper}", 1)
    source = source.replace("httpx.post(self.url, data=payload, timeout=None)", "httpx.post(self.url, data=payload, headers=_lickingvape_gateway_headers(), timeout=None)")
    source_path.write_text(source)
    return True


def main() -> int:
    metadata_path = Path(
        os.getenv("CAT_METADATA_PATH", "/data/metadata.json")
    )
    llm_base = os.getenv("OLLAMA_GENERAL_BASE_URL", "http://host.docker.internal:8844")
    embed_base = os.getenv("OLLAMA_EMBED_BASE_URL", "http://host.docker.internal:8844")
    llm_model = os.getenv("OLLAMA_GENERAL_MODEL", "rassy-smart")
    embed_model = os.getenv("OLLAMA_EMBED_MODEL", "rassy-embed")
    _patch_cat_embedder_auth(os.getenv("CAT_OLLAMA_API_KEY", ""))

    if not metadata_path.exists():
        print(f"metadata file not found: {metadata_path}", file=sys.stderr)
        return 1

    payload = json.loads(metadata_path.read_text())
    items = payload.setdefault("_default", {})

    def ensure_entry(name: str, category: str, default_value: dict) -> dict:
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

    llm_entry = ensure_entry("LLMOllamaConfig", "llm_factory", {})
    llm_value = llm_entry.setdefault("value", {})
    llm_value["base_url"] = llm_base
    llm_value["model"] = llm_model
    llm_value.setdefault("num_ctx", 4096)
    llm_value.setdefault("repeat_last_n", 64)
    llm_value.setdefault("repeat_penalty", 1.1)
    llm_value.setdefault("temperature", 0.8)

    embed_entry = ensure_entry("EmbedderOllamaConfig", "embedder_factory", {})
    embed_value = embed_entry.setdefault("value", {})
    embed_value["base_url"] = embed_base
    embed_value["model"] = embed_model

    ensure_entry("llm_selected", "llm", {"name": "LLMOllamaConfig"})["value"] = {
        "name": "LLMOllamaConfig"
    }
    ensure_entry("embedder_selected", "embedder", {"name": "EmbedderOllamaConfig"})["value"] = {
        "name": "EmbedderOllamaConfig"
    }

    metadata_path.write_text(json.dumps(payload))
    print(
        "configured cheshire metadata:",
        f"llm={llm_model}@{llm_base}",
        f"embed={embed_model}@{embed_base}",
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
