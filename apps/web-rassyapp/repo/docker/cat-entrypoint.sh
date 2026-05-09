#!/bin/sh
set -eu

METADATA_PATH="${CAT_METADATA_PATH:-/app/cat/data/metadata.json}"
BOOTSTRAP_TIMEOUT_SECONDS="${BOOTSTRAP_TIMEOUT_SECONDS:-180}"
BOOTSTRAP_WAIT_SECONDS="${BOOTSTRAP_WAIT_SECONDS:-2}"

run_cat() {
  /bin/sh -c "python3 -m cat.main"
}

run_bootstrap() {
  python3 /bootstrap/bootstrap-cat.py
}

if [ ! -s "$METADATA_PATH" ]; then
  echo "[cat-entrypoint] metadata missing, starting provisional Cheshire Cat to initialize data"
  run_cat &
  CAT_PID=$!

  elapsed=0
  while [ ! -s "$METADATA_PATH" ] && [ "$elapsed" -lt "$BOOTSTRAP_TIMEOUT_SECONDS" ]; do
    sleep "$BOOTSTRAP_WAIT_SECONDS"
    elapsed=$((elapsed + BOOTSTRAP_WAIT_SECONDS))
  done

  if [ -s "$METADATA_PATH" ]; then
    echo "[cat-entrypoint] metadata initialized after ${elapsed}s"
    sleep 2
  else
    echo "[cat-entrypoint] metadata still missing after ${BOOTSTRAP_TIMEOUT_SECONDS}s, continuing anyway"
  fi

  kill "$CAT_PID" >/dev/null 2>&1 || true
  wait "$CAT_PID" >/dev/null 2>&1 || true
fi

run_bootstrap

echo "[cat-entrypoint] starting Cheshire Cat with package-owned configuration"
exec /bin/sh -c "python3 -m cat.main"
