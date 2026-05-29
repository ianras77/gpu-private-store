#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${JUPYTERHUB_USERS:-}" ]]; then
  echo "JUPYTERHUB_USERS is required. Format: one 'username:password' per line." >&2
  exit 1
fi

mkdir -p /workspace/users /data/jupyterhub
chmod 700 /data/jupyterhub
if [[ -f /data/jupyterhub/jupyterhub_cookie_secret ]]; then
  chmod 600 /data/jupyterhub/jupyterhub_cookie_secret
fi
if [[ -f /data/jupyterhub/jupyterhub.sqlite ]]; then
  chmod 600 /data/jupyterhub/jupyterhub.sqlite
fi
umask 077

ALLOWED_USERS=()

while IFS= read -r line; do
  line="${line%%$'\r'}"
  line="${line#"${line%%[![:space:]]*}"}"
  line="${line%"${line##*[![:space:]]}"}"

  [[ -z "$line" ]] && continue
  [[ "${line:0:1}" == "#" ]] && continue

  user="${line%%:*}"
  pass="${line#*:}"

  if [[ -z "$user" || -z "$pass" || "$user" == "$line" ]]; then
    echo "Invalid JUPYTERHUB_USERS entry: '$line'" >&2
    exit 1
  fi

  if ! id -u "$user" >/dev/null 2>&1; then
    useradd -m -d "/workspace/users/$user" -s /bin/bash "$user"
  fi

  echo "$user:$pass" | chpasswd
  ALLOWED_USERS+=("$user")
done <<< "$JUPYTERHUB_USERS"

export JUPYTERHUB_ALLOWED_USERS="$(IFS=,; echo "${ALLOWED_USERS[*]}")"

exec jupyterhub -f /etc/jupyterhub/jupyterhub_config.py
