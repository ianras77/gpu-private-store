#!/usr/bin/env sh

set -eu

host="${REWORKD_PLATFORM_DB_HOST:-mysql}"
port="${REWORKD_PLATFORM_DB_PORT:-3306}"

if [ -n "${PLATFORM_SECRET_SEED:-}" ] && [ -z "${REWORKD_PLATFORM_SECRET_SIGNING_KEY:-}" ]; then
  export REWORKD_PLATFORM_SECRET_SIGNING_KEY="$(
    printf '%s' "$PLATFORM_SECRET_SEED" \
      | openssl dgst -sha256 -binary \
      | openssl base64 -A \
      | tr '+/' '-_'
  )"
fi

until nc -z "$host" "$port" > /dev/null 2>&1; do
  >&2 echo "Database is unavailable - sleeping..."
  sleep 2
done

>&2 echo "Database is available - continuing..."

exec "$@"
