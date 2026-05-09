#!/usr/bin/env sh

set -eu

cd /next

./wait-for-db.sh "${DATABASE_HOST:-mysql}" "${DATABASE_PORT:-3306}"

npx prisma generate
npx prisma db push --skip-generate

exec "$@"
