#!/bin/sh
set -e

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is not set" >&2
  exit 1
fi

# Force Next.js to bind on all interfaces when the container joins multiple networks.
export HOSTNAME="${HOSTNAME:-0.0.0.0}"

echo "Running Prisma db push..."
npx prisma db push

if [ -f ".next/standalone/server.js" ]; then
  # Standalone output expects .next/static next to server.js; symlink static assets there.
  if [ ! -e ".next/standalone/.next/static" ]; then
    mkdir -p .next/standalone/.next
    ln -s /app/.next/static .next/standalone/.next/static
  fi
  exec node .next/standalone/server.js
fi

exec npm run start
