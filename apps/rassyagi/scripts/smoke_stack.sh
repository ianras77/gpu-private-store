#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

load_env_file() {
  local env_file="$1"
  [[ -f "$env_file" ]] || return 0
  while IFS= read -r line; do
    [[ "$line" =~ ^[A-Za-z_][A-Za-z0-9_]*= ]] || continue
    export "$line"
  done < "$env_file"
}

load_env_file ./.env
load_env_file "${RASSYAGI_APP_ENV:-/data/runtipi/app-data/gpu-private-store/rassyagi/app.env}"

export GATEWAY_API_KEY="${GATEWAY_API_KEY:-${RASSYAGI_GATEWAY_API_KEY:-}}"
export LOCALAI_API_KEY="${LOCALAI_API_KEY:-${RASSYAGI_RASSYGPT_API_KEY:-}}"
export GATEWAY_PORT="${GATEWAY_PORT:-${APP_PORT:-9115}}"
export LOCALAGI_PORT="${LOCALAGI_PORT:-${RASSYAGI_LOCALAGI_PORT:-9114}}"
export LOCALAI_PORT="${LOCALAI_PORT:-8844}"
export MODEL_NAME="${MODEL_NAME:-${RASSYAGI_MODEL:-rassy-fast}}"
export MULTIMODAL_MODEL="${MULTIMODAL_MODEL:-${RASSYAGI_MULTIMODAL_MODEL:-rassy-smart}}"
export IMAGE_MODEL="${IMAGE_MODEL:-${RASSYAGI_IMAGE_MODEL:-rassy-image}}"
export EMBEDDING_MODEL="${EMBEDDING_MODEL:-${RASSYAGI_EMBEDDING_MODEL:-rassy-embed}}"
export RERANK_MODEL="${RERANK_MODEL:-${RASSYAGI_RERANK_MODEL:-rassy-rerank}}"
export LOCALAI_REQUIRE_EMBEDDINGS="${LOCALAI_REQUIRE_EMBEDDINGS:-true}"
export LOCALAI_REQUIRE_RERANK="${LOCALAI_REQUIRE_RERANK:-true}"
export LOCALAGI_REQUIRE_CALL_AGENTS="${LOCALAGI_REQUIRE_CALL_AGENTS:-true}"

auth_header="Authorization: Bearer ${GATEWAY_API_KEY}"
upstream_auth_header="Authorization: Bearer ${LOCALAI_API_KEY}"
gateway_base_url="http://127.0.0.1:${GATEWAY_PORT:-9115}"
upstream_base_url="${UPSTREAM_BASE_URL:-http://127.0.0.1:${LOCALAI_PORT:-8844}}"
localagi_smoke_base_url="${LOCALAGI_SMOKE_BASE_URL:-http://127.0.0.1:${LOCALAGI_PORT:-9114}}"
curl_connect_timeout="${CURL_CONNECT_TIMEOUT:-5}"
curl_max_time="${CURL_MAX_TIME:-45}"
music_enabled="${MUSIC_ENABLED:-false}"
model_name="${MODEL_NAME:-rassy-fast}"
embedding_model="${EMBEDDING_MODEL:-$model_name}"
rerank_model="${RERANK_MODEL:-$model_name}"
require_rag="${LOCALAI_REQUIRE_RAG:-false}"
require_audio="${LOCALAI_REQUIRE_AUDIO:-false}"
require_responses="${LOCALAI_REQUIRE_RESPONSES:-false}"
require_embeddings="${LOCALAI_REQUIRE_EMBEDDINGS:-false}"
require_rerank="${LOCALAI_REQUIRE_RERANK:-false}"
require_call_agents="${LOCALAGI_REQUIRE_CALL_AGENTS:-false}"

curl_json() {
  curl --connect-timeout "${curl_connect_timeout}" --max-time "${curl_max_time}" -fsS "$@"
}

check_json_contains() {
  local name="$1"
  local url="$2"
  local header="$3"
  local needle="$4"
  local body

  body="$(curl_json -H "$header" "$url")"
  if [[ "$body" != *"$needle"* ]]; then
    echo "FAIL: ${name} did not contain expected token: ${needle}" >&2
    echo "$body" >&2
    exit 1
  fi
  echo "PASS: ${name}"
}

check_post_contains() {
  local name="$1"
  local url="$2"
  local header="$3"
  local data="$4"
  local needle="$5"
  local body

  body="$(curl_json -H "$header" -H 'Content-Type: application/json' -d "$data" "$url")"
  if [[ "$body" != *"$needle"* ]]; then
    echo "FAIL: ${name} did not contain expected token: ${needle}" >&2
    echo "$body" >&2
    exit 1
  fi
  echo "PASS: ${name}"
}

extract_chat_text() {
  python3 -c 'import json, sys; payload = json.load(sys.stdin); print((((payload.get("choices") or [{}])[0].get("message") or {}).get("content") or "").strip())'
}

extract_response_text() {
  python3 -c '
import json, sys
payload = json.load(sys.stdin)
top_level = payload.get("output_text")
if isinstance(top_level, str) and top_level.strip():
    print(top_level.strip())
    raise SystemExit(0)
parts = []
for item in payload.get("output", []):
    if not isinstance(item, dict):
        continue
    for content in item.get("content", []) or []:
        if not isinstance(content, dict):
            continue
        text = content.get("text")
        if isinstance(text, str):
            parts.append(text)
print(" ".join(part.strip() for part in parts if part).strip())
'
}

extract_result_text() {
  python3 -c 'import json, sys; payload = json.load(sys.stdin); print(str(payload.get("Result") or "").strip())'
}

check_gateway_health_ok() {
  local body
  local status
  body="$(curl --connect-timeout "${curl_connect_timeout}" --max-time "${curl_max_time}" -sS "${gateway_base_url}/healthz")"
  status="$(printf '%s' "$body" | python3 -c 'import json, sys; print(json.load(sys.stdin).get("status") or "")')"
  if [[ "$status" != "ok" ]]; then
    echo "FAIL: gateway health is not ok" >&2
    echo "$body" >&2
    exit 1
  fi
  echo "PASS: local gateway health"
}

check_chat_exact() {
  local body
  local text
  body="$(curl_json -H "$auth_header" -H 'Content-Type: application/json' -d "{\"model\":\"${model_name}\",\"messages\":[{\"role\":\"system\",\"content\":\"Answer with the requested marker only. Do not include reasoning.\"},{\"role\":\"user\",\"content\":\"Marker: smoke-ok\"}],\"temperature\":0,\"max_tokens\":64,\"chat_template_kwargs\":{\"enable_thinking\":false}}" "${gateway_base_url}/v1/chat/completions")"
  text="$(printf '%s' "$body" | extract_chat_text)"
  if [[ "$text" != *"smoke-ok"* ]]; then
    echo "FAIL: gateway chat returned unexpected text" >&2
    echo "$body" >&2
    exit 1
  fi
  echo "PASS: gateway chat"
}

check_responses_exact() {
  local body
  local text
  body="$(curl_json -H "$auth_header" -H 'Content-Type: application/json' -d "{\"model\":\"${model_name}\",\"input\":\"Answer with the requested marker only. Do not include reasoning. Marker: response-ok\",\"temperature\":0,\"max_output_tokens\":64,\"chat_template_kwargs\":{\"enable_thinking\":false}}" "${gateway_base_url}/v1/responses")"
  text="$(printf '%s' "$body" | extract_response_text)"
  if [[ "$text" != *"response-ok"* ]]; then
    echo "FAIL: gateway responses returned unexpected text" >&2
    echo "$body" >&2
    exit 1
  fi
  echo "PASS: gateway responses"
}

check_localagi_agents() {
  local body
  local text
  body="$(curl_json -H 'Content-Type: application/json' -d '{"action":"call_agents","config":{},"params":{"agent_name":"orchestrator","message":"Reply with exactly: localagi-ok"}}' "${localagi_smoke_base_url}/api/action/call_agents/run")"
  text="$(printf '%s' "$body" | extract_result_text)"
  if [[ "$text" != *"localagi-ok"* ]]; then
    echo "FAIL: localagi call_agents returned unexpected text" >&2
    echo "$body" >&2
    exit 1
  fi
  echo "PASS: localagi call_agents"
}

check_gateway_health_ok
check_json_contains "upstream models" "${upstream_base_url}/v1/models" "$upstream_auth_header" "\"${model_name}\""
check_json_contains "gateway models" "${gateway_base_url}/v1/models" "$auth_header" "\"${model_name}\""
if [[ "${require_rag,,}" == "true" || "${require_rag}" == "1" ]]; then
  check_json_contains "gateway rag models" "${gateway_base_url}/v1/rag/models" "$auth_header" "\"${rerank_model}\""
fi
if [[ "${require_audio,,}" == "true" || "${require_audio}" == "1" ]]; then
  check_json_contains "gateway audio models" "${gateway_base_url}/v1/audio/models" "$auth_header" "\"${WHISPER_MODEL:-$model_name}\""
fi
if [[ "${music_enabled,,}" == "true" || "${music_enabled}" == "1" ]]; then
  check_json_contains "gateway music models" "${gateway_base_url}/v1/audio/music/models" "$auth_header" "\"musicgen-small\""
else
  check_json_contains "gateway music models disabled" "${gateway_base_url}/v1/audio/music/models" "$auth_header" '"data":[]'
fi
check_chat_exact
if [[ "${require_responses,,}" == "true" || "${require_responses}" == "1" ]]; then
  check_responses_exact
fi
if [[ "${require_embeddings,,}" == "true" || "${require_embeddings}" == "1" ]]; then
  check_post_contains \
    "gateway embeddings" \
    "${gateway_base_url}/v1/embeddings" \
    "$auth_header" \
    "{\"model\":\"${embedding_model}\",\"input\":\"smoke embedding\"}" \
    "\"embedding\""
fi
if [[ "${require_rag,,}" == "true" || "${require_rag}" == "1" || "${require_rerank,,}" == "true" || "${require_rerank}" == "1" ]]; then
  check_post_contains \
    "gateway rerank" \
    "${gateway_base_url}/v1/rerank" \
    "$auth_header" \
    "{\"model\":\"${rerank_model}\",\"query\":\"smoke\",\"documents\":[\"smoke test\",\"cold start\"],\"top_n\":1}" \
    "\"results\""
fi
if [[ "${require_call_agents,,}" == "true" || "${require_call_agents}" == "1" ]]; then
  check_localagi_agents
fi

echo "All smoke checks passed."
