#!/usr/bin/env bash
set -euo pipefail
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
python3 - <<PY
import json, pathlib, yaml
app = pathlib.Path("$APP_DIR")
json.loads((app / "config.json").read_text())
yaml.safe_load((app / "docker-compose.yml").read_text())
yaml.safe_load((app / "gateway" / "routes.default.yaml").read_text())
required = ["config.json", "docker-compose.yml", "metadata/description.md", "metadata/logo.jpg"]
missing = [p for p in required if not (app / p).exists()]
if missing:
    raise SystemExit("Missing: " + ", ".join(missing))
print("RassyGPT app structure validates.")
PY
