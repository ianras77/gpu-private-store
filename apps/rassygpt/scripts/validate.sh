#!/usr/bin/env bash
set -euo pipefail
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
python3 - <<PY
import json, pathlib, yaml
app = pathlib.Path("$APP_DIR")
json.loads((app / "config.json").read_text())
compose = yaml.safe_load((app / "docker-compose.yml").read_text()) or {}
routes = yaml.safe_load((app / "gateway" / "routes.default.yaml").read_text()) or {}
backends = routes.get("backends") or {}
models = routes.get("models") or {}
aliases = routes.get("aliases") or {}
defaults = routes.get("defaults") or {}
errors = []
for name, model in models.items():
    backend = model.get("backend")
    if backend not in backends:
        errors.append(f"model {name!r} references missing backend {backend!r}")
for alias, target in aliases.items():
    if target not in models:
        errors.append(f"alias {alias!r} references missing model {target!r}")
for kind, model_name in defaults.items():
    if model_name not in models:
        errors.append(f"default {kind!r} references missing model {model_name!r}")
rerank_command = compose.get("services", {}).get("rassygpt-rerank", {}).get("command") or []
if "--rerank" not in rerank_command and "--reranking" not in rerank_command:
    errors.append("rassygpt-rerank must enable the llama.cpp reranking endpoint")
if "--pooling" not in rerank_command or "rank" not in rerank_command:
    errors.append("rassygpt-rerank must use rank pooling")
if errors:
    raise SystemExit("Invalid routes.default.yaml:\n- " + "\n- ".join(errors))
required = ["config.json", "docker-compose.yml", "metadata/description.md", "metadata/logo.jpg"]
missing = [p for p in required if not (app / p).exists()]
if missing:
    raise SystemExit("Missing: " + ", ".join(missing))
print("RassyGPT app structure validates.")
PY
