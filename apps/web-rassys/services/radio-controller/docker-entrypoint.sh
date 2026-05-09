#!/bin/sh
set -e

cd /app/services/radio-controller
node /app/services/radio-controller/node_modules/.bin/prisma migrate deploy
exec node --experimental-specifier-resolution=node /app/services/radio-controller/dist/index.js
