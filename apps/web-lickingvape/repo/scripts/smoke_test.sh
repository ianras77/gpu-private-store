#!/usr/bin/env bash
set -euo pipefail

COMPOSE_FILE="infra/docker-compose.yml"

docker compose -f "$COMPOSE_FILE" up -d --build

echo "Waiting for API..."
until curl -fsS http://localhost:8000/health >/dev/null 2>&1; do
  sleep 2
  echo "Still waiting..."
done

echo "Submitting a test entry..."
curl -fsS http://localhost:8000/submit \
  -H "Content-Type: application/json" \
  -d '{"body":"Smoke test: hello","display_name":"Smoke"}' >/dev/null

echo "Running worker once..."
docker compose -f "$COMPOSE_FILE" run --rm worker python worker.py --once

echo "Checking published posts..."
python - <<'PY'
import requests
posts = requests.get('http://localhost:8000/posts').json().get('posts', [])
if not posts:
    raise SystemExit("No published posts found")
print("Smoke test OK. Published posts:", len(posts))
PY
