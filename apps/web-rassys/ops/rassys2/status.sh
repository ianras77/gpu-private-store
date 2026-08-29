#!/usr/bin/env sh
set -Eeuo pipefail
root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd); cd "$root"
docker compose -f docker-compose.yml ps
