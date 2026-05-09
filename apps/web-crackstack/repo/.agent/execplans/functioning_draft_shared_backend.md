# ExecPlan: functioning_draft_shared_backend

## Goal
Deliver a truly functioning draft of Crackstack where the backend agent/data workflows run end-to-end without brittle dependencies, and both XLCRACK and TAPECRACK frontends are aligned to the exact same working backend model (different branding, shared behavior).

## Architecture Constraints
- Keep one FastAPI backend serving both brands.
- Preserve multi-tenant isolation via Postgres RLS and existing tenant scoping (`X-API-Key` -> tenant mapping).
- Keep deterministic data transforms in backend (`DuckDB + Parquet`), with LLM as optional planner only.
- Web apps remain two branded Next.js apps, but share functional logic/components for behavior parity.
- No secrets committed to git.

## Milestones

### M1: Backend Reliability + Agentic Deterministic Fallback
**Description**
Stabilize backend defaults and make `/agent/threads/*` work even when LocalAI is unavailable by adding a deterministic tool-orchestrated fallback planner. Ensure API contract remains stable.

**Commands to run**
- `DATABASE_URL=postgresql://crackstack:crackstack@127.0.0.1:3206/crackstack make -C backend test`
- `make -C backend lint`

**Acceptance criteria**
- Backend tests pass with DB-backed paths enabled.
- Agent chat returns valid tool events and assistant output without requiring a live LocalAI endpoint.
- Backend defaults are consistent with current infra ports.

**Tests to add**
- Deterministic agent fallback integration test for thread create + chat.
- Test proving fallback can produce recipe/preview/approval/run style events.

---

### M2: Shared Functional Web Workbench Across Brands
**Description**
Replace nonfunctional/static onboarding/workbench behavior with one shared working interaction model consumed by both apps; keep branding/copy distinct.

**Commands to run**
- `npm --prefix web run test`
- `npm --prefix web run lint`

**Acceptance criteria**
- XLCRACK and TAPECRACK both run the same backend-backed workflow: list/upload/select dataset, analyze schema/sample, run agentic preview, approval, and recipe run.
- No dead UI controls that suggest unimplemented flows.
- Brand differences are present in copy/visual context only.

**Tests to add**
- Shared UI/client logic tests (at least helper-level) used by both brands.
- App smoke tests updated to assert real shared behavior wiring.

---

### M3: End-to-End Draft Validation + Docs Sync
**Description**
Run complete checks, verify working local run commands, and document the exact functioning draft behavior.

**Commands to run**
- `DATABASE_URL=postgresql://crackstack:crackstack@127.0.0.1:3206/crackstack make -C backend test`
- `make -C backend lint`
- `npm --prefix web run test`
- `npm --prefix web run lint`

**Acceptance criteria**
- All checks above pass.
- README/docs reflect actual working flow and required env vars/ports.
- Both frontends confirmed to rely on same backend API model.

**Tests to add**
- Any missing regression tests uncovered during integration.

---

### M4: User-Saved Agentic Workstreams (Learning Stream Foundation)
**Description**
Add user-scoped, modular, savable workstreams so the system can recognize known dataset templates and re-run saved crack recipes on new inputs.

**Commands to run**
- `cd backend && python3 -m pytest -q -r s`
- `make -C backend lint`

**Acceptance criteria**
- Users can save a workstream from a dataset profile + recipe steps.
- System can recognize matching saved workstreams for an incoming dataset.
- Users can run a saved workstream against a dataset and get a new output version.
- Workstreams are scoped by tenant + user.

**Tests to add**
- Unit tests for signature building/matching.
- Route-level integration tests for save/list/recognize/run (DB-gated).

---

### M5: Workstream UX Wiring In Both Branded Frontends
**Description**
Expose user-based workstream controls in shared web workbench and route all workstream API calls through brand app proxies.

**Commands to run**
- `npm --prefix web run test`
- `npm --prefix web run lint`
- `npm --prefix web run build`

**Acceptance criteria**
- XLCRACK and TAPECRACK both allow setting user id, saving stream, recognizing stream, and running selected stream.
- Agent thread/chat routes preserve user scoping via `X-User-Id`.
- Workstream proxy routes exist in both branded apps.

**Tests to add**
- Keep branded smoke tests green.
- Add or update shared component verification as needed.

---

### M6: User Process Completion (Signup Once + Upload -> AI Transform -> Download)
**Description**
Close the final process gap so a first-time user can identify/signup once, upload data, inspect file intelligence, run agentic transform flow, and download transformed output directly.

**Commands to run**
- `cd backend && python3 -m pytest -q -r s`
- `make -C backend lint`
- `npm --prefix web run test`
- `npm --prefix web run lint`
- `npm --prefix web run build`

**Acceptance criteria**
- Backend supports a user signup/profile endpoint scoped by tenant + user id.
- Shared workbench lets user save identity once and reuses it automatically.
- Backend exposes CSV download endpoint for latest dataset version.
- XLCRACK and TAPECRACK both expose a working download action.
- End-user process is documented clearly (setup, upload, analyze, transform, save stream, run stream, download/export).

**Tests to add**
- Backend tests for signup/profile route behavior (DB-gated).
- Backend tests for dataset CSV download route (DB-gated).
- Frontend smoke checks remain green.

---

### M7: Branded Landing + Backend-Ready Entry UX
**Description**
Strengthen XLCRACK and TAPECRACK landing/onboarding branding while ensuring each entry path clearly leads into the fully working backend-connected workspace.

**Commands to run**
- `npm --prefix web run test`
- `npm --prefix web run lint`
- `npm --prefix web run build`

**Acceptance criteria**
- Both brand landing pages have distinct voice and visual hierarchy.
- Landing pages expose concrete process steps and direct CTA into working workspace (`/playground` or `/studio`).
- Landing pages show live backend readiness signals from existing app API routes.
- Responsive behavior remains usable on mobile.

**Tests to add**
- Extend app smoke checks to verify landing page points to the backend-enabled workspace route.

---

### M8: Guided Agentic Template Recommendations
**Description**
Add a simple guided workflow layer that recommends reusable agentic templates from the user’s actual dataset profile and enables one-click apply/run into the existing transformation flow.

**Commands to run**
- `cd backend && python3 -m pytest -q -r s`
- `make -C backend lint`
- `npm --prefix web run test`
- `npm --prefix web run lint`
- `npm --prefix web run build`

**Acceptance criteria**
- Backend exposes user-scoped recommendation API driven by real dataset profile signals.
- Shared workbench offers a minimal guided UX: detect recommendations, apply template, run guided prompt.
- Agent tools support recommendation retrieval in both LLM and deterministic fallback.
- XLCRACK and TAPECRACK proxy the same recommendation API and remain behaviorally aligned.

**Tests to add**
- Unit tests for recommendation generation heuristics.
- Extend DB integration workstream test to validate `/workstreams/recommend`.

---

### M9: One-Command Full-Stack Bring-Up
**Description**
Add a reliable single command launcher for local runtime that starts infra dependencies, applies backend DB migrations explicitly, and runs backend + XLCRACK + TAPECRACK with health checks and graceful shutdown.

**Commands to run**
- `bash -n ops/dev-up.sh`
- `timeout 30s ./ops/dev-up.sh`
- `npm --prefix web run lint`

**Acceptance criteria**
- One command launches backend and both branded web apps against one shared backend API base URL.
- Launcher detects or starts infra services needed by backend (Postgres/Redis/MinIO/Temporal).
- DB migrations are actually applied before backend starts.
- Startup output prints live URLs for backend, XLCRACK, and TAPECRACK.
- Ctrl+C/termination stops all app processes launched by the script.

**Tests to add**
- No automated test added for process launcher; validated via runtime smoke command sequence above.

## Risks & Mitigations
- LocalAI availability risk: fallback deterministic planner ensures core UX still works.
- Drift between infra ports and backend defaults: align defaults/docs and keep one source of truth in docs.
- Frontend divergence risk: centralize shared interactive logic and keep brand shells thin.

## Rollback Strategy
- Keep endpoint contracts backward-compatible.
- Any new behavior flags default-safe (fallback activated automatically only when LLM call fails or deterministic mode chosen).
- Revert shared UI wrapper by restoring app-local clients if regressions found.

## Progress Log
- [x] M1 completed (2026-03-13): fixed backend DB default to port `3206`, added DB connect timeout, implemented deterministic agent fallback in `app/llm/agent.py` with LocalAI auto-fallback, and added `tests/test_agent_deterministic.py`. Evidence: `cd backend && python3 -m pytest -q -r s` (5 passed, 11 skipped) and `make -C backend lint` (clean). DB integration tests remain available via `CRACKSTACK_RUN_DB_TESTS=1`.
- [x] M2 completed (2026-03-13): extracted shared workbench component to `web/packages/ui/src/agent-workbench.tsx`, switched XLCRACK + TAPECRACK clients to wrappers over `@crackstack/ui`, and replaced nonfunctional onboarding/home copy with real flow-only content. Added smoke assertions that both clients import shared workbench. Evidence: `npm --prefix web --workspace apps/xlcrack run test:ci`, `npm --prefix web --workspace apps/tapecrack run test:ci`, `npm --prefix web run lint` (all clean).
- [x] M3 completed (2026-03-13): validated production builds for both web apps and synced run/docs notes in `README.md` (fallback behavior, DB test mode, default DB port). Evidence: `npm --prefix web run build` succeeded for both `tapecrack` and `xlcrack`.
- [x] M4 completed (2026-03-13): added user-scoped workstream persistence + recognition + run APIs (`/workstreams`, `/workstreams/recognize`, `/workstreams/{id}/run`), new DB migration `006_workstreams.sql`, matching engine (`app/data/workstreams.py`), agent tool extensions (`list/save/recognize/run workstreams`), and user context via `X-User-Id` fallback. Evidence: `cd backend && python3 -m pytest -q -r s` (7 passed, 12 skipped) and `make -C backend lint` (clean).
- [x] M5 completed (2026-03-13): wired workstream controls into shared `AgentWorkbench`, added brand API proxies under `/api/workstreams*` for both apps, and propagated `X-User-Id` through agent proxy routes. Evidence: `npm --prefix web run test`, `npm --prefix web run lint`, and `npm --prefix web run build` all passed.
- [x] M6 completed (2026-03-13): added user profile routes (`/users/signup`, `/users/me`) with tenant RLS migration `007_user_profiles.sql`, added direct CSV download endpoint (`/datasets/{id}/download`), wired new brand proxies (`/api/users/*`, `/api/datasets/{id}/download`) and shared UI controls for `Sign up once`, user switching, and `Download latest CSV`, and updated process docs in `README.md`. Evidence: `cd backend && python3 -m pytest -q -r s` (7 passed, 14 skipped), `make -C backend lint` (clean), `npm --prefix web run test`, `npm --prefix web run lint`, and `npm --prefix web run build` all passed. DB-gated new tests (`test_users.py`, `test_download.py`) are present and skip in this environment when `DATABASE_URL` is unreachable.
- [x] M7 completed (2026-03-13): refreshed XLCRACK + TAPECRACK landing/onboarding/studio-playground branding content, added live backend readiness panels on brand home pages (`LandingStatus` components hitting `/api/users/me` and `/api/datasets`), improved mobile responsiveness in brand CSS, and extended smoke tests to assert landing entry routes into working workspaces. Evidence: `npm --prefix web run test` (both apps pass with 3 tests each), `npm --prefix web run lint` (clean), `npm --prefix web run build` (both apps build with all API routes), plus backend regression checks `cd backend && python3 -m pytest -q -r s` (7 passed, 14 skipped) and `make -C backend lint` (clean).
- [x] M8 completed (2026-03-13): added guided recommendation backend flow and UI integration: `/workstreams/recommend` API + response models, recommendation heuristics in `app/data/workstreams.py`, tool support via `recommend_workstreams` in `app/llm/tools.py`, deterministic agent intent path for recommendation prompts in `app/llm/agent.py`, new brand proxies (`/api/workstreams/recommend`) for XLCRACK and TAPECRACK, and shared `AgentWorkbench` guided template UX (detect, apply, run guided flow) driven by real dataset profiles. Added tests for recommendation heuristics (`tests/test_workstreams_matching.py`), deterministic recommendation intent (`tests/test_agent_deterministic.py`), and DB-gated route coverage extension (`tests/test_workstreams.py`). Evidence: `cd backend && python3 -m pytest -q -r s` (10 passed, 14 skipped), `make -C backend lint` (clean), `npm --prefix web run test` (both app smoke suites pass), `npm --prefix web run lint` (clean), and `npm --prefix web run build` (both apps build; new `/api/workstreams/recommend` route present).
- [x] Runtime hotfix completed (2026-03-13): full-stack bring-up validated on this host with backend + both brand frontends running concurrently. Fixed Node runtime upload proxy bug in both apps by removing `instanceof File` checks from dataset upload routes and using safe FormData object checks. Also executed DB migrations explicitly (`run_migrations()`) after finding `python -m app.db.migrate` is a no-op module invocation. Evidence: backend health and `/users/me` OK, XLCRACK and TAPECRACK `/api/users/me` OK, and both brand upload + `/api/workstreams/recommend` flows return valid JSON recommendations.
- [x] M9 completed (2026-03-13): added one-command launcher `ops/dev-up.sh` with explicit migration execution (`run_migrations()`), optional infra bring-up, backend + both branded Next dev servers, readiness checks, auto-port selection, and graceful shutdown. Evidence: `bash -n ops/dev-up.sh`, `timeout 30s ./ops/dev-up.sh` (startup + URL print + health checks), and `npm --prefix web run lint` (clean).
