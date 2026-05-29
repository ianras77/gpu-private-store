#!/bin/sh
set -eu

: "${MLFLOW_AUTH_DATABASE_URI:?MLFLOW_AUTH_DATABASE_URI is required}"
: "${MLFLOW_ADMIN_USERNAME:?MLFLOW_ADMIN_USERNAME is required}"
: "${MLFLOW_ADMIN_PASSWORD:?MLFLOW_ADMIN_PASSWORD is required}"

MLFLOW_AUTH_CONFIG_PATH="${MLFLOW_AUTH_CONFIG_PATH:-/tmp/basic_auth.ini}"

umask 077
mkdir -p "$(dirname "$MLFLOW_AUTH_CONFIG_PATH")"

cat >"$MLFLOW_AUTH_CONFIG_PATH" <<EOF
[mlflow]
default_permission = ${MLFLOW_DEFAULT_PERMISSION:-READ}
database_uri = ${MLFLOW_AUTH_DATABASE_URI}
admin_username = ${MLFLOW_ADMIN_USERNAME}
admin_password = ${MLFLOW_ADMIN_PASSWORD}
authorization_function = mlflow.server.auth:authenticate_request_basic_auth
EOF

exec mlflow "$@"
