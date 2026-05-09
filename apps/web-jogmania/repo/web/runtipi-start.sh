#!/bin/sh
set -e

if [ -f /repo/package.json ]; then
  cd /repo
elif [ -f /repo/web/package.json ]; then
  cd /repo/web
else
  echo "Could not find web package.json under /repo." >&2
  exit 1
fi

export PORT="${PORT:-3000}"

if [ -f package-lock.json ] || grep -q '"packageManager": "npm@' package.json 2>/dev/null; then
  npm install
  exec npm run dev -- --hostname 0.0.0.0
fi

corepack enable
pnpm install
exec pnpm dev --hostname 0.0.0.0
