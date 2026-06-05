#!/usr/bin/env bash
set -euo pipefail
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
python3 - <<PY
import json, pathlib, re, yaml
app = pathlib.Path("$APP_DIR")
config = json.loads((app / "config.json").read_text())
compose = yaml.safe_load((app / "docker-compose.yml").read_text()) or {}
routes = yaml.safe_load((app / "gateway" / "routes.default.yaml").read_text()) or {}
backends = routes.get("backends") or {}
models = routes.get("models") or {}
aliases = routes.get("aliases") or {}
defaults = routes.get("defaults") or {}
server = routes.get("server") or {}
errors = []
x_runtipi = compose.get("x-runtipi") or {}
if x_runtipi.get("schema_version") != 2:
    errors.append("docker-compose.yml must declare x-runtipi.schema_version: 2")
gateway = compose.get("services", {}).get("rassygpt-gateway", {})
if gateway.get("pull_policy") != "build":
    errors.append("rassygpt-gateway must use pull_policy: build so Runtipi does not pull the local image")
version = str(config.get("version", "")).strip()
if gateway.get("image") != f"runtipi-local-rassygpt-gateway:{version}":
    errors.append("rassygpt-gateway image tag must match config.json version")
app_py = (app / "gateway" / "app.py").read_text()
match = re.search(r'^APP_VERSION\s*=\s*([\'"])([^\'"]+)\1', app_py, re.M)
if not match or match.group(2) != version:
    errors.append("gateway/app.py APP_VERSION must match config.json version")
if str(server.get("version")) != version:
    errors.append("gateway/routes.default.yaml server.version must match config.json version")
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
required_backends = server.get("required_backends") or []
if not isinstance(required_backends, list) or not required_backends:
    errors.append("server.required_backends must be a non-empty list")
for backend in required_backends:
    if backend not in backends:
        errors.append(f"server.required_backends references missing backend {backend!r}")
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
