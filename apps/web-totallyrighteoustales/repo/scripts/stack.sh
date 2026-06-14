#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

COMMAND="${1:-up}"
shift || true

case "$COMMAND" in
  up)
    docker compose up -d --build "$@"
    docker compose ps
    ;;
  down)
    docker compose down "$@"
    ;;
  restart)
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
