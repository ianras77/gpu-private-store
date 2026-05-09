#!/bin/sh

set -eu

. /app/runtipi/bootstrap-common.sh

ensure_runtime_files

cd /app/backend
exec env PYTHONPATH=. uv run --no-sync uvicorn app.gateway.app:app --host 0.0.0.0 --port 8001 --workers "${GATEWAY_WORKERS:-1}"
