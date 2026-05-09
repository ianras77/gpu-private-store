#!/bin/sh

set -eu

. /app/runtipi/bootstrap-common.sh

load_better_auth_secret

cd /app/frontend
exec pnpm start
