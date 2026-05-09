# ExecPlan: run_app_local

## Goal
Get the app running locally (infra + backend + web) with no startup errors.

## Milestones

### M1: Bring up infra + verify services
**Deliverables**
- docker-compose services running (postgres, redis, minio, temporal)

**Commands**
- `make up`
- `docker compose ps`

**Acceptance**
- all infra services are `Up` with no crash loops

**Tests to add**
- None (ops-only)

---

### M2: Backend running cleanly
**Deliverables**
- backend tests + lint pass
- FastAPI dev server starts without errors

**Commands**
- `make -C backend test`
- `make -C backend lint`
- `export LOCALAI_BASE_URL=...` / `export LOCALAI_MODEL=...` / `export CRACKSTACK_API_KEYS=...`
- `uvicorn app.main:app --reload --port 8000`

**Acceptance**
- tests + lint pass
- `uvicorn` starts and responds to `GET /health`

**Tests to add**
- None (ops-only)

---

### M3: Web apps running cleanly
**Deliverables**
- xlcrack and tapecrack dev servers start without errors

**Commands**
- `cd web && npm install`
- `export CRACKSTACK_API_BASE_URL=...`
- `export CRACKSTACK_API_KEY=...`
- `npm run dev:xlcrack`
- `npm run dev:tapecrack`

**Acceptance**
- both dev servers compile and serve without startup errors

**Tests to add**
- None (ops-only)

## Progress Log
- [x] M1 (2026-02-22): `make up` succeeded after switching `temporalio/ui` to `latest` and moving host ports to 5434/6384; `docker compose ps` shows crackstack-postgres/redis/minio/temporal-ui Up.
- [x] M1 (2026-02-28): Fixed Temporal broadcast config (DB-backed) in `infra/docker-compose.yml`; `docker compose -f infra/docker-compose.yml up -d --force-recreate` now brings up postgres/redis/minio/temporal/temporal-ui cleanly.
- [x] M2 (2026-02-28): `make -C backend test` (13 passed, 1 skipped) + `make -C backend lint` clean; `PYTHONPATH=backend python3 -m uvicorn app.main:app --host 127.0.0.1 --port 39555` served `/health` (200).
- [x] M3 (2026-02-28): Cleared root-owned `.next/.vite` artifacts, ran Next builds for xlcrack + tapecrack successfully inside `node:20` docker with host volume. Verified `next dev` boot for each via 12s docker smoke (`xlcrack` on 3300, `tapecrack` on 3301). Sandbox EPERM on host persists, so use the docker commands from this run for local dev.
