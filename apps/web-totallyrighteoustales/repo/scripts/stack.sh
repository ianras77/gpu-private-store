#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

STACK_NETWORK="ollama_llm-net"
COMMAND="${1:-up}"
shift || true

ensure_llm_network() {
  if docker network inspect "$STACK_NETWORK" >/dev/null 2>&1; then
    return
  fi

  printf '[stack] creating missing docker network %s\n' "$STACK_NETWORK"
  docker network create "$STACK_NETWORK" >/dev/null
}

case "$COMMAND" in
  up)
    ensure_llm_network
    docker compose up -d --build "$@"
    docker compose ps
    ;;
  down)
    docker compose down "$@"
    ;;
  restart)
    ensure_llm_network
    docker compose down
    docker compose up -d --build "$@"
    docker compose ps
    ;;
  logs)
    docker compose logs -f --tail="${TAIL_LINES:-200}" "$@"
    ;;
  ps|status)
    docker compose ps "$@"
    ;;
  *)
    printf 'Usage: %s {up|down|restart|logs|ps|status}\n' "${0##*/}" >&2
    exit 1
    ;;
esac
