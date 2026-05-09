#!/bin/sh
set -eu

echo "[api] waiting for database migrations to apply"
until npx prisma migrate deploy --schema apps/api/prisma/schema.prisma; do
  echo "[api] database not ready yet, retrying in 2s"
  sleep 2
done

if [ "${USMENDER_DEMO_SEED:-true}" = "true" ]; then
  echo "[api] seeding demo data"
  npx tsx apps/api/prisma/seed.ts
fi

echo "[api] starting server"
exec node apps/api/dist/index.js
