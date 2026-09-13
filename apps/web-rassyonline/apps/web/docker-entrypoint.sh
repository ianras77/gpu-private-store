#!/bin/sh
set -eu

upload_root="${RASSY_ONLINE_UPLOAD_ROOT:-/app-data/uploads}"
mkdir -p "$upload_root"
chown -R nextjs:nodejs "$upload_root" 2>/dev/null || true

if [ "${1:-}" = "node" ] && [ "${2:-}" = "worker.mjs" ] && [ "$(id -u)" = "0" ]; then
  exec su nextjs -s /bin/sh -c "node worker.mjs"
fi

if [ "${1:-}" = "node" ] && [ "${2:-}" = "worker.mjs" ]; then
  exec node worker.mjs
fi

if [ "$(id -u)" != "0" ]; then
  exec node server.js
fi

exec su nextjs -s /bin/sh -c "node server.js"
