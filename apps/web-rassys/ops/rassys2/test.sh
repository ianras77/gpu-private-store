#!/usr/bin/env sh
set -Eeuo pipefail
root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
cd "$root/apps/web"
npm ci
npm run format
npm run lint
npm test
npm run build
