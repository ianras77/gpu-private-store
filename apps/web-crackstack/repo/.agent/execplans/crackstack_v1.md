# ExecPlan: crackstack_v1

## Goal
Deliver a v1 of the unified backend plus two branded clients:
- Web: xlcrack + tapecrack
- iOS: XLCRACK + TAPECRACK

## Locked Tech Choices
- Python 3.12 + FastAPI + Pydantic
- SQLAlchemy + Alembic + Postgres + RLS
- Redis
- S3/MinIO for object storage
- Parquet canonical storage
- DuckDB for query/transform
- Polars for ingestion
- Temporal for durable workflows
- OpenAI Agents SDK + Responses integration behind /agent endpoints
- Web: Next.js + TypeScript
- iOS: SwiftUI

## Milestones

### M0: Bootstrapping & local dev infra
**Deliverables**
- monorepo structure created
- docker-compose: postgres, redis, minio, temporal dev server
- Makefile/tasks: `make up`, `make test`, `make lint`

**Commands**
- `docker-compose up`
- `make -C backend test`
- `make -C backend lint`

**Acceptance**
- all services start
- backend test suite executes (even minimal placeholder)

---

### M1a: On-Prem Dataset Catalog + RLS Foundation
**Deliverables**
- Postgres schema for tenants/datasets/dataset_versions with RLS + FORCE RLS
- DB migration runner
- Tenant-scoped catalog helpers
- Dataset list endpoint backed by the catalog
- Integration test proving tenant isolation at the DB layer

**Commands**
- `make -C backend test`
- `make -C backend lint`

**Acceptance**
- With `DATABASE_URL` set to local Postgres, tenant A cannot read or update tenant B datasets
- `GET /datasets` returns tenant-scoped datasets

**Tests**
- `backend/tests/test_rls.py` (RLS isolation)
- `backend/tests/test_datasets.py` (dataset list endpoint)

---

### M1: Auth + tenants + RLS + core models
**Deliverables**
- auth endpoints (register/login)
- tenants/users/memberships tables
- RLS policies for tenant isolation
- integration test proving isolation

**Acceptance**
- tenant A cannot read/write tenant B data

---

### M2: Uploads + ingest to Parquet + dataset catalog
**Deliverables**
- direct upload endpoint for web app (CSV/TXT/XLSX)
- ingestion path creates dataset + dataset_versions entries
- schema + sample endpoints backed by tenant catalog

**Acceptance**
- upload CSV/TXT/XLSX → Parquet created → schema/sample works in tenant scope

**Tests**
- `backend/tests/test_uploads.py` (upload + schema/sample)

---

### M2b: SQL Server export (first DB target)
**Deliverables**
- export endpoint to push latest dataset version to SQL Server
- connector gating via env flag + clear errors

**Acceptance**
- when enabled + valid SQL Server credentials, export writes rows to target table
- when disabled, endpoint returns 503 with guidance

**Tests**
- `backend/tests/test_export_sqlserver.py` (disabled path)

### M3: Query + recipes + versioning
**Deliverables**
- query endpoint using DuckDB against Parquet
- recipe DSL + SQL transform
- new dataset version per run

**Acceptance**
- transformation creates new immutable dataset version

---

### M4: Temporal workflows for ingest/run/export
**Deliverables**
- Temporal worker and workflows
- job/run tracking and resumability

**Acceptance**
- restart worker mid-run; run completes

---

### M5: Agent service + tool catalog + approvals + tracing
**Deliverables**
- /agent threads + chat endpoints
- strict tools only
- proposal → approve → run
- trace timeline persisted

**Acceptance**
- dataset → ask for transform → proposal → approve → new version

---

### M6: Web apps (two brands)
**Deliverables**
- Next.js app(s) with brand switching
- dataset browsing + agent panel + approvals
- run history

**Acceptance**
- end-to-end in browser

---

### M6a: Web Upload → Transform → Export Flow
**Deliverables**
- dataset upload form wired to backend ingest (CSV/TXT/XLSX)
- dataset selector + analyze action to load schema/sample
- SQL Server export form wired to backend export endpoint
- API proxy routes for datasets/upload/export in both brands

**Commands**
- `npm -C web/apps/xlcrack run dev:xlcrack`
- `npm -C web/apps/tapecrack run dev:tapecrack`

**Acceptance**
- upload creates new dataset and populates schema/sample
- agent preview/approve/run works on uploaded dataset
- export request hits SQL Server endpoint (disabled path shows clear error)

### M7: iOS apps (two targets)
**Deliverables**
- SwiftUI app for each brand
- shared API client module
- dataset browse + agent approve

**Acceptance**
- builds in Xcode and connects to backend

---

## Risks & Mitigations
- Huge Excel files: require streaming ingest, memory limits, row chunking.
- Agent hallucination: strict tool-use, validation, approvals.
- Query abuse: read-only default, timeouts, row limits, per-tenant quotas.

## Rollback Strategy
- Immutable dataset versions; revert by pointing to prior version.
- Recipes are versioned; keep history.

## Progress Log
- [x] M0 (2026-02-22): scaffolded repo, infra compose, backend skeleton, web placeholders. Tests/lint not run: python missing in environment.
- [x] M1a (2026-02-27): added Postgres RLS schema + migration runner, tenant-scoped catalog, dataset list/schema/sample endpoints, and RLS/datasets tests. Checks run: `python3 -m pytest -q` (5 passed, 1 skipped) and `make -C backend lint` (ruff check passed).
- [x] M2/M2b (2026-02-27): added upload ingest (CSV/TXT/XLSX) → Parquet, dataset upload endpoint, SQL Server export endpoint + disabled-path test, and new upload/export tests. Added optional SQL Server integration test gated by env vars. Checks run: `python3 -m pytest -q` (5 passed, 1 skipped) and `make -C backend lint` (ruff check passed).
- [ ] M1
- [ ] M2
- [ ] M3
- [ ] M4
- [ ] M5
- [ ] M6 (2026-02-22): expanded XLCRACK/TAPECRACK demo landing + onboarding/studio/playground pages, brand assets, and production typography (no backend wiring yet).
- [x] M6a (2026-02-27): wired web upload→transform→export flow in XLCRACK/TAPECRACK, added dataset API proxy routes and SQL Server export form. Updated brand marks to `next/image` for lint compliance. Checks run: `NEXT_TELEMETRY_DISABLED=1 npm run lint` in `web/apps/xlcrack` and `web/apps/tapecrack` (no warnings).
- [ ] M7
