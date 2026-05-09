#!/bin/sh
set -e

cd /repo

export PORT="${PORT:-3000}"

corepack enable
pnpm install
exec pnpm --filter @jogmania/web exec next dev -p "${PORT}" --hostname 0.0.0.0
