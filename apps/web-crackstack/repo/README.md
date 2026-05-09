# Crackstack (XLCRACK + TAPECRACK)

Unified agentic data platform powering two branded clients.

## Quickstart

One-command full stack with Docker Compose (infra + backend + XLCRACK + TAPECRACK):

```bash
docker compose up -d --build
```

Default host ports:
- `3800` backend API
- `3300` XLCRACK
- `3301` TAPECRACK
- `3206` Postgres
- `3207` Redis
- `3208` MinIO API
- `3209` MinIO console
- `3210` Temporal
- `3211` Temporal UI

Optional port/env overrides:
- `CRACKSTACK_API_PORT`, `CRACKSTACK_XL_PORT`, `CRACKSTACK_TAPE_PORT`
- `CRACKSTACK_POSTGRES_PORT`, `CRACKSTACK_REDIS_PORT`
- `CRACKSTACK_MINIO_PORT`, `CRACKSTACK_MINIO_CONSOLE_PORT`
- `CRACKSTACK_TEMPORAL_PORT`, `CRACKSTACK_TEMPORAL_UI_PORT`
- `CRACKSTACK_API_KEYS`, `LOCALAI_BASE_URL`, `LOCALAI_MODEL`

Alternative local launcher (dev servers with auto-selected ports):

```bash
./ops/dev-up.sh
```

Optional env overrides:
- `SKIP_INFRA=1` (reuse existing infra)
- `API_PORT`, `XL_PORT`, `TAPE_PORT`
- `DATABASE_URL`, `CRACKSTACK_API_KEYS`

Makefile wrapper for the same full stack:

```bash
make up
```

Backend tests/lint:

```bash
make test
make lint
```

Backend tests that hit Postgres/RLS explicitly:

```bash
cd backend
CRACKSTACK_RUN_DB_TESTS=1 python3 -m pytest -q -r s
```

LLM backend (LocalAI):

```bash
# Defaults to http://127.0.0.1:8112 and model qwen3-1.7b
export LOCALAI_BASE_URL=http://127.0.0.1:8112
export LOCALAI_MODEL=qwen3-1.7b
export CRACKSTACK_API_KEYS=local-dev-key:tenant_demo
uvicorn app.main:app --reload --port 8000

# create thread
curl -sS -X POST http://127.0.0.1:8000/agent/threads \\
  -H 'Content-Type: application/json' \\
  -H 'X-API-Key: local-dev-key' \\
  -d '{"brand":"xlcrack"}'

# chat with the LLM agent
curl -sS -X POST http://127.0.0.1:8000/agent/threads/<THREAD_ID>/chat \\
  -H 'Content-Type: application/json' \\
  -H 'X-API-Key: local-dev-key' \\
  -d '{"message":"Clean dates, map regions, remove null revenue rows."}'

# save a user-scoped workstream
curl -sS -X POST http://127.0.0.1:8000/workstreams \\
  -H 'Content-Type: application/json' \\
  -H 'X-API-Key: local-dev-key' \\
  -H 'X-User-Id: user_alice' \\
  -d '{"dataset_id":"demo_sales","name":"Revenue Crack","steps":[{"type":"normalize_dates","column":"invoice_date"}]}'

# recognize known workstreams for an incoming dataset
curl -sS -X POST http://127.0.0.1:8000/workstreams/recognize \\
  -H 'Content-Type: application/json' \\
  -H 'X-API-Key: local-dev-key' \\
  -H 'X-User-Id: user_alice' \\
  -d '{"dataset_id":"demo_sales"}'

# signup/save user identity once
curl -sS -X POST http://127.0.0.1:8000/users/signup \\
  -H 'Content-Type: application/json' \\
  -H 'X-API-Key: local-dev-key' \\
  -H 'X-User-Id: user_alice' \\
  -d '{"display_name":"Alice Analyst"}'

# download latest transformed dataset version as CSV
curl -sS -L http://127.0.0.1:8000/datasets/demo_sales/download \\
  -H 'X-API-Key: local-dev-key' \\
  -o demo_sales_latest.csv
```

Notes:
- If `LOCALAI_BASE_URL` is unavailable, agent chat automatically falls back to a deterministic tool-orchestrated planner.
- Default backend `DATABASE_URL` is `postgresql://crackstack:crackstack@127.0.0.1:3206/crackstack` (matches the root `docker-compose.yml` Postgres mapping).
- User-scoped workstreams are keyed by `X-User-Id` (falls back to `user_demo` when header is omitted).
- User signup/profile routes (`/users/signup`, `/users/me`) bootstrap cleanly on a fresh DB and allow save-once user identity per tenant.
- Template uploads are persisted in backend storage and can be listed/fetched via `/templates` and `/templates/{template_id}`.
- Shared XLCRACK/TAPECRACK workbench now includes save/recognize/run controls for user workstreams.
- Shared XLCRACK/TAPECRACK workbench also supports direct latest-version CSV download after AI-assisted transforms.

## Working User Process

1. Set user id once in toolbar and click `Sign up once` (saved locally, recognized server-side).
2. Upload CSV/TXT/XLSX.
3. Click `Analyze dataset` (schema, sample rows, and profiles populate).
4. Run preview prompt to generate recipe steps.
5. Request approval and run recipe (creates new dataset version).
6. Optional: save stream, recognize on new files, and rerun saved stream.
7. Download latest CSV directly or export to SQL Server.

Web (placeholder shells):

```bash
cd web
npm install
export CRACKSTACK_API_BASE_URL=http://127.0.0.1:8000
export CRACKSTACK_API_KEY=local-dev-key
npm run dev:xlcrack
# or
npm run dev:tapecrack
```

## Notes
- Dev secrets live in `infra/dev-secrets/` and are ignored by git.
- Planning specs live in `AGENTS.md`, `/.agent/PLANS.md`, and `/.agent/execplans/crackstack_v1.md`.

## Layout

```
/infra
  docker-compose.yml
/backend
  app/ (FastAPI)
  tests/
/web
  apps/xlcrack
  apps/tapecrack
  packages/ui
  packages/api-client
/ios
  XLCRACK/
  TAPECRACK/
  Shared/
```
