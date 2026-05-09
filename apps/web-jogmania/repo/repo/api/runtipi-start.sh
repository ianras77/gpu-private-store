#!/bin/sh
set -e

cd /app

pip install -r requirements.txt

if [ -f requirements-dev.txt ]; then
  pip install -r requirements-dev.txt
fi

alembic upgrade head
python -m app.scripts.seed
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}" --reload
