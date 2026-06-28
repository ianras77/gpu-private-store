#!/bin/sh
set -eu

upload_root="${RASSY_ONLINE_UPLOAD_ROOT:-/app-data/uploads}"
mkdir -p "$upload_root"
chown -R nextjs:nodejs "$upload_root" 2>/dev/null || true

exec su nextjs -s /bin/sh -c "node server.js"
