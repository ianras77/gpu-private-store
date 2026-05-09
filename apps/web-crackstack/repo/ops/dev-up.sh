#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

require_cmd() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Missing required command: $cmd" >&2
    exit 1
  fi
}

require_cmd python3
require_cmd npm
require_cmd npx
require_cmd curl

if [[ "${SKIP_INFRA:-0}" != "1" ]]; then
  require_cmd docker
fi

pick_port() {
  local start="$1"
  local end="$2"
  python3 - "$start" "$end" <<'PY'
import socket
import sys

start = int(sys.argv[1])
end = int(sys.argv[2])

for port in range(start, end + 1):
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        sock.bind(("127.0.0.1", port))
    except OSError:
        continue
    else:
        print(port)
        sys.exit(0)
    finally:
        sock.close()

sys.exit(1)
PY
}

wait_for_http() {
  local name="$1"
  local url="$2"
  local attempts="${3:-120}"
  local sleep_s="${4:-1}"
  local code

  for _ in $(seq 1 "$attempts"); do
    code="$(curl -sS -o /dev/null -w "%{http_code}" "$url" || true)"
    if [[ "$code" == "200" || "$code" == "201" || "$code" == "204" ]]; then
      return 0
    fi
    sleep "$sleep_s"
  done

  echo "Timed out waiting for $name at $url" >&2
  return 1
}

ensure_infra() {
  local compose_file="infra/docker-compose.yml"
  local output_file
  output_file="$(mktemp /tmp/crackstack-infra-up-XXXX.log)"

  if docker compose -f "$compose_file" up -d >"$output_file" 2>&1; then
    rm -f "$output_file"
    return 0
  fi

  if grep -q "already in use" "$output_file"; then
    echo "Detected existing crackstack containers; attempting to start/reuse them..."
    local containers=(
      crackstack-postgres
      crackstack-redis
      crackstack-minio
      crackstack-temporal
      crackstack-temporal-ui
    )
    local name
    for name in "${containers[@]}"; do
      if docker ps --format '{{.Names}}' | grep -qx "$name"; then
        continue
      fi
      if docker ps -a --format '{{.Names}}' | grep -qx "$name"; then
        docker start "$name" >/dev/null 2>&1 || true
      fi
    done
    rm -f "$output_file"
    return 0
  fi

  cat "$output_file" >&2
  rm -f "$output_file"
  return 1
}

BACKEND_PID=""
XL_PID=""
TAPE_PID=""
CLEANED_UP="0"

cleanup() {
  if [[ "$CLEANED_UP" == "1" ]]; then
    return
  fi
  CLEANED_UP="1"

  local pids=()
  [[ -n "$BACKEND_PID" ]] && pids+=("$BACKEND_PID")
  [[ -n "$XL_PID" ]] && pids+=("$XL_PID")
  [[ -n "$TAPE_PID" ]] && pids+=("$TAPE_PID")

  if [[ "${#pids[@]}" -gt 0 ]]; then
    echo ""
    echo "Stopping app processes..."
    kill "${pids[@]}" >/dev/null 2>&1 || true
    wait "${pids[@]}" >/dev/null 2>&1 || true
  fi
}

trap cleanup INT TERM EXIT

if [[ "${SKIP_INFRA:-0}" != "1" ]]; then
  echo "Starting/reusing infra services..."
  ensure_infra
fi

DATABASE_URL="${DATABASE_URL:-postgresql://crackstack:crackstack@127.0.0.1:3206/crackstack}"
CRACKSTACK_API_KEYS="${CRACKSTACK_API_KEYS:-local-dev-key:tenant_demo}"
BIND_HOST="${BIND_HOST:-127.0.0.1}"
API_PUBLIC_HOST="${API_PUBLIC_HOST:-127.0.0.1}"

API_PORT="${API_PORT:-$(pick_port 8000 8999)}"
XL_PORT="${XL_PORT:-$(pick_port 3000 3499)}"
TAPE_PORT="${TAPE_PORT:-$(pick_port 3500 3999)}"

API_BASE_URL="http://${API_PUBLIC_HOST}:${API_PORT}"

echo "Applying DB migrations..."
(
  cd backend
  DATABASE_URL="$DATABASE_URL" python3 -c "from app.db.migrate import run_migrations; run_migrations()"
)

LOG_DIR="${LOG_DIR:-$ROOT_DIR/.agent/runtime-logs}"
mkdir -p "$LOG_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKEND_LOG="$LOG_DIR/backend-$STAMP.log"
XL_LOG="$LOG_DIR/xlcrack-$STAMP.log"
TAPE_LOG="$LOG_DIR/tapecrack-$STAMP.log"

echo "Starting backend on ${API_BASE_URL}..."
(
  cd backend
  DATABASE_URL="$DATABASE_URL" \
  CRACKSTACK_API_KEYS="$CRACKSTACK_API_KEYS" \
  python3 -m uvicorn app.main:app --host "$BIND_HOST" --port "$API_PORT"
) >"$BACKEND_LOG" 2>&1 &
BACKEND_PID="$!"

wait_for_http "backend health" "${API_BASE_URL}/health"

echo "Starting XLCRACK on http://127.0.0.1:${XL_PORT}..."
(
  cd web/apps/xlcrack
  CRACKSTACK_API_BASE_URL="$API_BASE_URL" \
  CRACKSTACK_API_KEY="local-dev-key" \
  npx next dev -H "$BIND_HOST" -p "$XL_PORT"
) >"$XL_LOG" 2>&1 &
XL_PID="$!"

echo "Starting TAPECRACK on http://127.0.0.1:${TAPE_PORT}..."
(
  cd web/apps/tapecrack
  CRACKSTACK_API_BASE_URL="$API_BASE_URL" \
  CRACKSTACK_API_KEY="local-dev-key" \
  npx next dev -H "$BIND_HOST" -p "$TAPE_PORT"
) >"$TAPE_LOG" 2>&1 &
TAPE_PID="$!"

wait_for_http "xlcrack" "http://127.0.0.1:${XL_PORT}"
wait_for_http "tapecrack" "http://127.0.0.1:${TAPE_PORT}"
wait_for_http "xlcrack users proxy" "http://127.0.0.1:${XL_PORT}/api/users/me"
wait_for_http "tapecrack users proxy" "http://127.0.0.1:${TAPE_PORT}/api/users/me"

echo ""
echo "Full stack is running:"
echo "  Backend  : ${API_BASE_URL}"
echo "  XLCRACK  : http://127.0.0.1:${XL_PORT}"
echo "  TAPECRACK: http://127.0.0.1:${TAPE_PORT}"
echo ""
echo "Logs:"
echo "  $BACKEND_LOG"
echo "  $XL_LOG"
echo "  $TAPE_LOG"
echo ""
echo "Press Ctrl+C to stop."

wait -n "$BACKEND_PID" "$XL_PID" "$TAPE_PID"
echo "One service exited; shutting down the rest." >&2
exit 1
