#!/bin/sh
set -e

cd /app

pip install -r requirements.txt

if [ "${JOGMANIA_INSTALL_DEV_DEPS:-false}" = "true" ] && [ -f requirements-dev.txt ]; then
  pip install -r requirements-dev.txt
fi

if ! alembic upgrade head > /tmp/jogmania-alembic.log 2>&1; then
  cat /tmp/jogmania-alembic.log >&2
  if grep -q "Can't locate revision" /tmp/jogmania-alembic.log; then
    echo "Legacy flat-channel Alembic revision detected; stamping rich monorepo head." >&2
    alembic stamp --purge 0006_device_last_sync_at
    alembic upgrade head
  else
    exit 1
  fi
fi
python -m app.scripts.seed
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}" --reload
