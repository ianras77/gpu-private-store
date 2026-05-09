#!/usr/bin/env bash
        set -euo pipefail

        SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
        STORE_DIR="${1:-$(cd "${SCRIPT_DIR}/.." && pwd)}"
        APPS_DIR="${STORE_DIR}/apps"

        if [[ ! -d "${APPS_DIR}" ]]; then
          echo "missing apps directory: ${APPS_DIR}" >&2
          exit 1
        fi

        status=0
        while IFS= read -r -d '' app_dir; do
          for required in config.json docker-compose.yml metadata/description.md; do
            if [[ ! -f "${app_dir}/${required}" ]]; then
              echo "missing ${required} in ${app_dir}" >&2
              status=1
            fi
          done
          if [[ ! -f "${app_dir}/metadata/logo.svg" && ! -f "${app_dir}/metadata/logo.jpg" ]]; then
            echo "missing metadata/logo.svg or metadata/logo.jpg in ${app_dir}" >&2
            status=1
          fi
          python3 - <<'PY' "${app_dir}/config.json" "${app_dir}/docker-compose.yml" || status=1
import json
import sys
from pathlib import Path
import yaml

config_path = Path(sys.argv[1])
compose_path = Path(sys.argv[2])
config = json.loads(config_path.read_text())
compose = yaml.safe_load(compose_path.read_text())
assert config["id"] == config_path.parent.name, "config id must match folder name"
assert compose["x-runtipi"]["schema_version"] == 2, "schema version must be 2"
assert "services" in compose and compose["services"], "services map missing"
PY
        done < <(find "${APPS_DIR}" -mindepth 1 -maxdepth 1 -type d -print0)

        exit "${status}"
