# ExecPlan: live_functioning_sweep_20260322

## Goal
Make Crackstack function like a real multi-user backend-backed product for both XLCRACK and TAPECRACK: smooth user registration, reliable tenant/user isolation, upload and storage of user data/files, persistence of user templates/workstreams, and a single Docker Compose command that brings the live stack up cleanly.

## Architecture Constraints
- Keep the existing FastAPI backend and shared backend model for both brands.
- Preserve Postgres row-level security for tenant isolation and add regression coverage instead of weakening isolation.
- Keep DuckDB + Parquet as the canonical data-transform path unless a bug forces a narrow storage abstraction change.
- Keep the two web brands behaviorally aligned by reusing shared packages/components instead of forking logic.
- No secrets in git; local/dev secrets stay externalized.
- Compose bring-up must be one command and must include everything required for a functioning local/live-like run.

## Milestones

### M1: Baseline Sweep + Bring-Up Reality Check
- Description
  Audit the current backend/web/runtime flow against the requested product behavior, validate what already works, and identify the concrete failures blocking a trustworthy single-command stack.
- Commands to run
  - `git status --short`
  - `make up`
  - `cd backend && python3 -m pytest -q -r s`
  - `make -C backend lint`
  - `npm --prefix web run test`
  - `npm --prefix web run lint`
  - `docker compose -f infra/docker-compose.yml ps`
- Acceptance criteria
  - Current stack status is documented with evidence.
  - Highest-priority functional gaps are identified with file ownership and fix order.
  - ExecPlan is updated with observed failures/pass state and the chosen next implementation slice.
- Tests required
  - No new tests required for the audit itself; existing suites must be exercised and results logged.

### M2: Backend Multi-User Flow Hardening
- Description
  Fix the backend issues that break real multi-user usage: user registration/profile smoothness, tenant/user-safe persistence of uploads/templates/workstreams, and any storage/auth bugs discovered during M1.
- Commands to run
  - `cd backend && python3 -m pytest -q -r s`
  - `cd backend && CRACKSTACK_RUN_DB_TESTS=1 python3 -m pytest -q -r s`
  - `make -C backend lint`
- Acceptance criteria
  - User signup/profile flow works consistently for first-time and returning users.
  - Uploads and templates persist correctly per tenant and remain accessible through the API.
  - Workstreams/templates/user profiles remain isolated by tenant and user as designed.
  - New/updated backend tests cover the fixed regression paths.
- Tests required
  - Add/update route tests for signup/profile edge cases.
  - Add/update DB-backed tests for uploads/templates/workstreams if M1 exposes gaps.
  - Add/update RLS regression coverage if any tenant leakage risk is touched.

### M3: One-Command Live Stack Compose
- Description
  Replace the split local launcher/runtime story with a true single `docker compose up -d --build` path that starts infra, backend, and both branded web apps with correct wiring and health checks.
- Commands to run
  - `docker compose up -d --build`
  - `docker compose ps`
  - `curl -fsS http://127.0.0.1:8000/health`
  - `curl -fsS http://127.0.0.1:3000/api/users/me`
  - `curl -fsS http://127.0.0.1:3001/api/users/me`
- Acceptance criteria
  - A single compose command builds and runs backend + XLCRACK + TAPECRACK + required infra.
  - Migrations are applied automatically on startup.
  - Backend and both apps are healthy without manual shell steps.
  - Runtime docs reflect the actual command and ports.
- Tests required
  - Add/update ops smoke verification if practical.
  - No fake documentation-only completion; acceptance must be observed from real running services.

### M4: Final Production Readiness Sweep
- Description
  Run final verification, clean up config/docs, and ensure the repo is in a push-ready state with a clear live deployment path.
- Commands to run
  - `git status --short`
  - `cd backend && python3 -m pytest -q -r s`
  - `make -C backend lint`
  - `npm --prefix web run test`
  - `npm --prefix web run lint`
  - `npm --prefix web run build`
  - `docker compose ps`
- Acceptance criteria
  - Tests/lint/builds pass for touched areas.
  - Docs explain the intended bring-up path and user flow without drift.
  - Remaining risks, if any, are explicit and small enough for a push.
- Tests required
  - Regression tests added in prior milestones remain green.

## Risks & Mitigations
- Current auth is header-based tenant/user identification rather than full account auth.
  Mitigation: harden the present flow first, then decide whether to introduce real credentials/JWT in a dedicated follow-on milestone.
- Compose may not yet define backend/web services at all.
  Mitigation: verify current runtime story in M1 before changing orchestration, then build a single supported path in M3.
- DB-backed tests may be skipped if Postgres is absent.
  Mitigation: bring infra up first, then rerun with DB-backed mode and log evidence.
- Web smoothness issues may stem from proxy/runtime assumptions rather than backend APIs.
  Mitigation: validate both API and web proxy routes separately.

## Rollback Strategy
- Keep changes incremental by milestone.
- Avoid destructive data/schema changes without compatibility guards.
- If compose changes destabilize local runs, preserve the previous launcher until the new path is proven.

## Progress Log
- [ ] M1 not started yet.
- [ ] M2 pending.
- [ ] M3 pending.
- [ ] M4 pending.
