#!/usr/bin/env bash
        set -euo pipefail

        ROOT="${1:-$(pwd)}"
        find "${ROOT}/apps" -mindepth 1 -maxdepth 1 -type d -printf '%f
' | sort
