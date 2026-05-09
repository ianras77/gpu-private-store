#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 2 ]]; then
  echo "usage: $0 <app-id> <version>" >&2
  exit 1
fi

APP_ID="$1"
NEW_VERSION="$2"
SEMVER='^[0-9]+\.[0-9]+\.[0-9]+([+-][0-9A-Za-z.-]+)?$'

if [[ ! "${NEW_VERSION}" =~ ${SEMVER} ]]; then
  echo "version must be semver, got: ${NEW_VERSION}" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
CONFIG_PATH="${ROOT_DIR}/apps/${APP_ID}/config.json"

if [[ ! -f "${CONFIG_PATH}" ]]; then
  echo "missing config: ${CONFIG_PATH}" >&2
  exit 1
fi

python3 - <<'PY' "${CONFIG_PATH}" "${NEW_VERSION}"
import json
import sys
import time
from pathlib import Path

config_path = Path(sys.argv[1])
new_version = sys.argv[2]
config = json.loads(config_path.read_text())
config["version"] = new_version
config["tipi_version"] = int(config.get("tipi_version", 0)) + 1
config["updated_at"] = int(time.time() * 1000)
config_path.write_text(json.dumps(config, indent=2) + "\n")
print(f"updated {config['id']} to version {config['version']} (tipi_version {config['tipi_version']})")
PY
