#!/usr/bin/env sh

set -eu

host="${1:-mysql}"
port="${2:-3306}"

until nc -z "$host" "$port" > /dev/null 2>&1; do
  >&2 echo "Database is unavailable - sleeping..."
  sleep 2
done

>&2 echo "Database is available - continuing..."
