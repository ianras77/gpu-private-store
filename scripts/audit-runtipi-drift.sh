#!/usr/bin/env bash
set -euo pipefail

STORE_DIR="${1:-$(pwd)}"
INSTALLED_DIR="${2:-/data/runtipi/apps/gpu-private-store}"
APPS_DIR="${STORE_DIR}/apps"

if [[ ! -d "${APPS_DIR}" ]]; then
  echo "missing source apps directory: ${APPS_DIR}" >&2
  exit 1
fi

if [[ ! -d "${INSTALLED_DIR}" ]]; then
  echo "missing installed apps directory: ${INSTALLED_DIR}" >&2
  exit 1
fi

status=0

echo "source-only apps"
while IFS= read -r app_dir; do
  app="$(basename "${app_dir}")"
  if [[ ! -d "${INSTALLED_DIR}/${app}" ]]; then
    available="$(jq -r '.available // false' "${app_dir}/config.json" 2>/dev/null || echo unknown)"
    version="$(jq -r '.version // "unknown"' "${app_dir}/config.json" 2>/dev/null || echo unknown)"
    echo "  ${app} available=${available} version=${version}"
  fi
done < <(find "${APPS_DIR}" -mindepth 1 -maxdepth 1 -type d | sort)

echo "installed-only apps"
while IFS= read -r app_dir; do
  app="$(basename "${app_dir}")"
  if [[ ! -d "${APPS_DIR}/${app}" ]]; then
    version="$(jq -r '.version // "unknown"' "${app_dir}/config.json" 2>/dev/null || echo unknown)"
    echo "  ${app} version=${version}"
    status=1
  fi
done < <(find "${INSTALLED_DIR}" -mindepth 1 -maxdepth 1 -type d | sort)

echo "package file drift"
while IFS= read -r app_dir; do
  app="$(basename "${app_dir}")"
  installed_app="${INSTALLED_DIR}/${app}"
  [[ -d "${installed_app}" ]] || continue
  for rel in config.json docker-compose.yml metadata/description.md metadata/logo.svg metadata/logo.jpg; do
    src_file="${app_dir}/${rel}"
    installed_file="${installed_app}/${rel}"
    if [[ -f "${src_file}" && -f "${installed_file}" ]]; then
      if ! cmp -s "${src_file}" "${installed_file}"; then
        echo "  ${app}: ${rel}"
        status=1
      fi
    elif [[ -f "${src_file}" || -f "${installed_file}" ]]; then
      echo "  ${app}: ${rel} missing in one copy"
      status=1
    fi
  done
done < <(find "${APPS_DIR}" -mindepth 1 -maxdepth 1 -type d | sort)

exit "${status}"
