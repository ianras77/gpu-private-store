#!/bin/sh

set -eu

RUNTIME_CONFIG_DIR="${DEER_FLOW_RUNTIME_CONFIG_DIR:-/app/runtime-config}"
DEER_FLOW_HOME="${DEER_FLOW_HOME:-/app/backend/.deer-flow}"
DEER_FLOW_CONFIG_PATH="${DEER_FLOW_CONFIG_PATH:-$RUNTIME_CONFIG_DIR/config.yaml}"
DEER_FLOW_EXTENSIONS_CONFIG_PATH="${DEER_FLOW_EXTENSIONS_CONFIG_PATH:-$RUNTIME_CONFIG_DIR/extensions_config.json}"
DEER_FLOW_CONFIG_TEMPLATE_PATH="${DEER_FLOW_CONFIG_TEMPLATE_PATH:-/app/runtipi/config.template.yaml}"
DEER_FLOW_EXTENSIONS_TEMPLATE_PATH="${DEER_FLOW_EXTENSIONS_TEMPLATE_PATH:-/app/runtipi/extensions.template.json}"
DEER_FLOW_AUTH_SECRET_FILE="${DEER_FLOW_AUTH_SECRET_FILE:-$RUNTIME_CONFIG_DIR/.better-auth-secret}"

generate_secret() {
  if command -v python >/dev/null 2>&1; then
    python -c "import secrets; print(secrets.token_hex(32))"
    return
  fi

  if command -v node >/dev/null 2>&1; then
    node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
    return
  fi

  echo "No supported runtime found to generate BETTER_AUTH_SECRET" >&2
  return 1
}

ensure_runtime_files() {
  mkdir -p "$RUNTIME_CONFIG_DIR" "$DEER_FLOW_HOME"

  if [ -n "${HOME:-}" ]; then
    mkdir -p "$HOME"
  fi

  if [ -n "${XDG_CACHE_HOME:-}" ]; then
    mkdir -p "$XDG_CACHE_HOME"
  fi

  if [ ! -f "$DEER_FLOW_CONFIG_PATH" ]; then
    cp "$DEER_FLOW_CONFIG_TEMPLATE_PATH" "$DEER_FLOW_CONFIG_PATH"
  fi

  if [ ! -f "$DEER_FLOW_EXTENSIONS_CONFIG_PATH" ]; then
    cp "$DEER_FLOW_EXTENSIONS_TEMPLATE_PATH" "$DEER_FLOW_EXTENSIONS_CONFIG_PATH"
  fi

  if [ ! -f "$DEER_FLOW_AUTH_SECRET_FILE" ]; then
    generate_secret > "$DEER_FLOW_AUTH_SECRET_FILE"
    chmod 600 "$DEER_FLOW_AUTH_SECRET_FILE" || true
  fi
}

load_better_auth_secret() {
  ensure_runtime_files
  BETTER_AUTH_SECRET="$(tr -d '\r\n' < "$DEER_FLOW_AUTH_SECRET_FILE")"
  export BETTER_AUTH_SECRET
}
