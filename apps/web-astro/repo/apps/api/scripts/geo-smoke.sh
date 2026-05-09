#!/usr/bin/env bash
set -euo pipefail

API_BASE="${API_BASE:-http://localhost:4020}"

echo "Checking /health ..."
curl -sf "${API_BASE}/health" | jq .

echo
echo "Checking /health/providers ..."
curl -sf "${API_BASE}/health/providers" | jq .

echo
echo "Resolving New York ..."
NEW_YORK="$(curl -sf -X POST "${API_BASE}/v1/geo/resolve" \
  -H 'Content-Type: application/json' \
  -H 'X-Brand-Id: saturnseer' \
  -d '{"query":"New York","limit":5,"locale":"en"}')"
echo "${NEW_YORK}" | jq .
echo "${NEW_YORK}" | jq -e '.candidates | length > 0' >/dev/null

echo
echo "Resolving London ..."
LONDON="$(curl -sf -X POST "${API_BASE}/v1/geo/resolve" \
  -H 'Content-Type: application/json' \
  -H 'X-Brand-Id: saturnseer' \
  -d '{"query":"London","limit":5,"locale":"en"}')"
echo "${LONDON}" | jq .
echo "${LONDON}" | jq -e '.candidates | length > 0' >/dev/null

echo
echo "Geo smoke checks passed."
