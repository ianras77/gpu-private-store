#!/usr/bin/env bash
set -euo pipefail

ROOT="${1:-$(pwd)}"
find "${ROOT}/apps" -mindepth 1 -maxdepth 1 -type d | while read -r app_dir; do
  echo "checking ${app_dir}"
  [[ -f "${app_dir}/config.json" ]]
  [[ -f "${app_dir}/docker-compose.yml" ]]
  [[ -f "${app_dir}/metadata/description.md" ]]
  [[ -f "${app_dir}/metadata/logo.svg" ]]
done
