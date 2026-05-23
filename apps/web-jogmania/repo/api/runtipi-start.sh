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
if ! alembic upgrade head 2>&1 | tee /tmp/jogmania-alembic.log; then
  if grep -q "Can't locate revision" /tmp/jogmania-alembic.log; then
    echo "Legacy Alembic revision not present in this package; bridging from packaged base." >&2
    alembic stamp 20260226_000002
    alembic upgrade head
  else
    exit 1
  fi
fi
python -m app.seed
uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}" --reload
