#!/bin/sh
set -e

if [ -f /app/requirements.txt ]; then
  cd /app
elif [ -f /app/api/requirements.txt ]; then
  cd /app/api
else
  echo "Could not find api requirements.txt under /app." >&2
  exit 1
fi

pip install -r requirements.txt
alembic upgrade head
python -m app.seed
uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}" --reload
