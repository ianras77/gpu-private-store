#!/usr/bin/env sh
set -Eeuo pipefail
root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
cd "$root"
printf 'repository=%s\nsha=%s\nbranch=%s\n' "$root" "$(git rev-parse HEAD)" "$(git branch --show-current)"
docker compose -f docker-compose.yml config --quiet
printf '%s\n' 'compose=configured'
