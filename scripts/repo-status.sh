#!/usr/bin/env bash
set -euo pipefail

ROOT="${1:-$(pwd)}"
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || {
  echo "not a git repository: ${ROOT}" >&2
  exit 1
}
git status --short
