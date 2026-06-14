# BASELINE (2026-02-27)

Purpose: capture the current Crackstack behavior before Stage 1 changes.

## Backend
- FastAPI app at `app/main.py` with `/health`, `/agent`, `/datasets` routers.
- Auth: simple API key header `X-API-Key` mapped via `CRACKSTACK_API_KEYS` env (default `local-dev-key:tenant_demo`). No JWT yet.
- Data store: DuckDB + Parquet files under `backend/data/tenants/<tenant>/datasets`. `ensure_demo_dataset` seeds a demo CSV into Parquet on first access. Postgres with RLS is configured via `app/db` but most handlers run against DuckDB outputs.
- Dataset endpoints (`app/routes/datasets.py`):
  - `GET /datasets` returns tenant-scoped list (ensures demo dataset).
  - `GET /datasets/{id}/schema` and `/sample` read Parquet via DuckDB.
  - `POST /datasets/upload` ingests CSV/TXT/TSV/XLS/XLSX to Parquet; writes catalog entries.
  - `POST /datasets/{id}/export/sqlserver` optional SQL Server export (gated by `CRACKSTACK_SQLSERVER_ENABLED`).
- Agent endpoints (`app/routes/agent.py`):
  - `POST /agent/threads` creates in-memory thread (global `THREADS` dict), optionally binds dataset (defaults to demo via `ensure_demo_dataset`).
  - `POST /agent/threads/{id}/chat` calls `run_agent`, which loops tool-calling LLM responses and stores history per thread.
- Agent runtime (`app/llm/*`):
  - LocalAI-compatible client hitting `LOCALAI_BASE_URL` (default `http://host.docker.internal:8844`) with model `rassy-smart`.
  - Tool catalog includes `list_datasets`, `get_schema`, `sample_rows`, `profile_columns`, `propose_recipe`, `preview_recipe`, `validate_recipe`, `request_approval`, `run_recipe` (validation + DuckDB-backed transforms).
  - Recipes execute deterministically via DuckDB (`store.run_recipe`) with risk flags for filters/drops/date casts.
- Tests present: health, dataset list, uploads, RLS isolation, SQL Server export. Tests that require Postgres are skipped if `DATABASE_URL` unreachable.

## Web
- Two Next.js apps: `web/apps/xlcrack` (messy spreadsheet rescue) and `web/apps/tapecrack` (pipeline automation). Shared tokens/styles via `globals.css` per app.
- Routing (xlcrack): landing `/`, onboarding `/onboarding`, playground `/playground`, plus API routes under `/api/datasets/*` proxying to backend. Branding assets in `/public/brand`.
- Routing (tapecrack): landing `/`, onboarding `/onboarding`, studio `/studio`, API proxy routes mirroring xlcrack.
- API proxies (`app/api/datasets/.../route.ts`) forward to `CRACKSTACK_API_BASE_URL` (default `http://127.0.0.1:8000`) with `X-API-Key` (default `local-dev-key`) for list/upload/schema/sample/export.
- UI is static/demo-only today; no authenticated sessions. Upload/mapping/export flows depend on backend endpoints but lack persisted user state.

## Infra
- `infra/docker-compose.yml` brings up Postgres (5434), Redis (6384), MinIO (9000/9001), Temporal (7233) and Temporal UI (8233).
- Root Makefile: `make up`, `make down`, `make test` (backend pytest), `make lint` (backend ruff).

## Known Gaps
- Agent relies on a running LocalAI endpoint; no mocks or fallbacks in production code.
- Thread state is in-memory; not persisted per tenant/user.
- No canonical schema contract or profiling API yet; uploads ingest directly to Parquet with minimal metadata.
- Web flows are not authenticated and do not enforce tenant context beyond the shared API key.
