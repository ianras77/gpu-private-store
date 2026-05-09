# ExecPlan: crackstack_production

## Goal
Ship the production-grade Crackstack schema-transform platform described in `NEXT_crackstack_production_codex_program.md`, delivering multi-tenant uploads → schema understanding → mapping → preview → export, with XLCRACK and TAPECRACK sharing one backend.

## Architecture Constraints
- Keep the existing FastAPI backend + Pydantic models.
- Postgres with RLS for multi-tenant isolation; DuckDB/Parquet for dataset storage and transforms; MinIO/S3 for object storage.
- LocalAI (or drop-in OpenAI-compatible) for LLM suggestions; LLM never executes transforms.
- Frontend: Next.js apps (`web/apps/xlcrack`, `web/apps/tapecrack`) sharing `web/packages/ui` and `web/packages/api-client` for logic.
- iOS: SwiftUI targets sharing a networking layer.
- No duplicated logic between brands; theming + copy only.

## Milestones

### Stage 0: Recon + Freeze Current Behavior
- **Commands:** `make up` (infra), `make -C backend test`, `make -C backend lint` (optional but preferred).
- **Acceptance:** infra starts; `/health` ok; `/agent/threads` + `/chat` basic flow works; smoke tests added.
- **Tests to add:** `backend/tests/test_smoke.py` covering health + agent flow; baseline docs `docs/BASELINE.md` captured.

### Stage 1: Data Ingestion + Canonical Dataset Model
- **Commands:** `make -C backend test`; targeted ingest tests.
- **Acceptance:** upload Excel/CSV works; dataset + profile stored in DB; profile endpoint returns canonical schema JSON.
- **Tests:** upload/profile round trip; storage key recorded; schema contract snapshot.

### Stage 2: Schema Inference + Template Extraction
- **Commands:** `make -C backend test` with schema/template fixtures.
- **Acceptance:** dataset and template extractions share one schema contract; mixed types flagged; template upload returns schema quickly.
- **Tests:** template extraction fixture; schema normalization/unit tests.

### Stage 3: Mapping Engine + LLM Suggestion
- **Commands:** `make -C backend test`; optional LocalAI mock tests.
- **Acceptance:** deterministic mapping heuristics work without LLM; LLM suggestions validated; mapping JSON contract enforced.
- **Tests:** mapping heuristics unit tests; LLM output validator; risk flag handling.

### Stage 4: Whizz-bag Web UI
- **Commands:** `npm -C web/apps/xlcrack test` (or lint/typecheck), `npm -C web/apps/tapecrack test`, `make -C backend test` for E2E API mocks.
- **Acceptance:** upload → profile → mapping → preview → export works in UI for both brands; confidence/warnings visible.
- **Tests:** Playwright or React Testing Library smoke flows; shared UI component tests.

### Stage 5: Accounts + Workflow Persistence
- **Commands:** backend + web test suites.
- **Acceptance:** JWT auth + refresh; workflows saved and rerun; tenant/user scoping enforced.
- **Tests:** auth integration; workflow reuse with mismatched datasets.

### Stage 6: Production Hardening
- **Commands:** `make -C backend test lint`; load/limit checks.
- **Acceptance:** background jobs for heavy work; limits enforced; structured logs/metrics; RLS verified.
- **Tests:** limit enforcement; tenant leakage checks; background job enqueue tests.

### Stage 7: iOS Readiness
- **Commands:** Xcode build; backend schema tests; `make -C backend test`.
- **Acceptance:** iOS client can upload/profile/plan/preview/export via API; CORS/OpenAPI accurate.
- **Tests:** API client contract tests; minimal iOS networking unit tests.

### Stage 8: Docker Rebuild + Final Gate
- **Commands:** `docker compose build --no-cache`, `docker compose up -d`, `make test`, `make lint`.
- **Acceptance:** fresh clone + build works; services start clean; tests/lint green.
- **Tests:** full suite.

## Risks & Mitigations
- LocalAI availability: provide mocks/fallback; keep agent tests isolated from live LLM.
- Large Excel memory pressure: chunked read/streaming; enforce upload size limits.
- Tenant isolation drift: maintain RLS policies + regression tests.
- Diverging contracts between backend/web/iOS: centralize in `docs/CONTRACTS.md` and versioned schema JSON.
- Object storage/S3 differences: use abstraction with local filesystem fallback.

## Rollback Strategy
- Keep migrations reversible; dataset versions are immutable Parquet artifacts.
- Feature flags for new endpoints; disable by config without code removal.
- For web/iOS, ship behind brand toggles and revert to previous build if needed.

## Progress Log
- [x] Stage 0 (2026-02-27): Added smoke test `backend/tests/test_smoke.py`, captured current behavior in `docs/BASELINE.md`, ensured FastAPI middleware stack works with TestClient, and ran backend pytest (7 passed, 1 skipped for missing DATABASE_URL). Warning: datetime.utcnow deprecation noted in agent thread response timestamp.
- [x] Stage 1 (2026-02-27): Implemented canonical dataset profiling with cached profiles (`dataset_profiles` table + RLS), profile endpoints (POST/GET `/datasets/{id}/profile`), auto-profile on upload, storage keys recorded for dataset versions, and schema contract doc in `docs/CONTRACTS.md`. Tests: `PYTHONPATH=backend DATABASE_URL=postgresql://crackstack:crackstack@127.0.0.1:5434/crackstack python3 -m pytest backend/tests -q -r s` → 9 passed, 1 skipped (SQL Server integration not configured); lint clean via `python3 -m ruff check .`.
- [x] Stage 2 (2026-02-27): Added template schema extraction endpoint (`POST /templates/upload`) with RLS-backed `templates` table, canonical schema contract reuse, and storage keys on dataset/template versions. Hardened schema responses to include contract fields. Tests: `PYTHONPATH=backend DATABASE_URL=postgresql://crackstack:crackstack@127.0.0.1:5434/crackstack python3 -m pytest backend/tests -q -r s` → 11 passed, 1 skipped (SQL Server integration not configured). Lint clean.
