#!/bin/sh
set -e

cd /app/services/radio-controller
 /app/services/radio-controller/node_modules/.bin/prisma migrate deploy
exec /app/services/radio-controller/node_modules/.bin/tsx /app/services/radio-controller/dist/index.js
