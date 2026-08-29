# Crackstack Current-State Audit

Date: 2026-08-23
Checkout: `86d8bd0c79a06054f2b7f28a6a20d2e040bcd4fb`
Rollback checkpoint: the commit above. The surrounding Git worktree contains unrelated changes in sibling apps; those are intentionally preserved.

## Scope and repository shape

The canonical source is the nested `repo/` tree in the Runtipi app checkout. It contains one FastAPI backend, one shared web workspace, and XLCRACK/TAPECRACK Next.js clients. iOS directories exist but are currently documentation/shared-shell level rather than part of the runnable baseline.

## Baseline evidence

| Area | Current reality | Evidence |
|---|---|---|
| Backend | FastAPI routes for datasets, transforms, agent threads, users, templates, and legacy workstreams | `backend/app/main.py`, `backend/app/routes/` |
| Persistence | PostgreSQL migration runner with seven SQL migrations; RLS policies exist for core datasets and workstreams | `backend/app/db/migrations/` |
| Data engine | DuckDB reads/writes Parquet; Polars is used for Excel conversion; local filesystem storage is the effective artifact store | `backend/app/data/store.py`, `backend/pyproject.toml` |
| AI | Provider-neutral OpenAI-compatible boundary is now present with explicit capabilities, role mapping, and OpenAI variant; `LocalAIClient` remains a compatibility adapter while the agent migration continues | `backend/app/llm/provider.py`, `backend/app/llm/client.py` |
| Agent | Bounded tool loop plus deterministic keyword planner; tool names include schema/profile/recipe/approval/workstream operations | `backend/app/llm/agent.py`, `backend/app/llm/tools.py` |
| Workflows | No Temporal worker, workflow, activity, signal, or query implementation found; UI copy says runs execute in Temporal but backend run paths are application-level | `backend/app/`, `web/apps/tapecrack/app/studio/page.tsx` |
| Approvals | Approval token is carried through agent history/process state, not a durable approval table/signal | `backend/app/llm/agent.py`, `web/packages/ui/src/agent-workbench.tsx` |
| Versioning | Dataset versions and Parquet paths are persisted; transforms create derived versions | `backend/app/db/migrations/001_init.sql`, `backend/app/data/store.py` |
| Export | CSV download and SQL Server export paths exist; MinIO is declared but no active object-storage adapter was found in the inspected backend path | `backend/app/routes/datasets.py`, `backend/app/data/sqlserver.py` |
| Redis | Declared in both Compose configurations; no backend Redis import/use was found in the inspected source | `infra/docker-compose.yml`, `backend/` search |
| Web | Two thin Next.js apps share the large `web/packages/ui/src/agent-workbench.tsx` component and API client; behavior is shared, branding is app-level | `web/apps/*`, `web/packages/ui/` |
| UI | Existing workbench is functional but monolithic and centered on chat/tool events, legacy workstreams, and approval token controls; no executable graph canvas | `web/packages/ui/src/agent-workbench.tsx` |
| Compose | Root Compose declares Postgres, Redis, MinIO, Temporal, Temporal UI, backend, and both clients; several images use mutable tags and required Runtipi variables are absent in this local invocation | `docker-compose.yml` |
| Runtime | `docker compose ps --all` showed no running containers in this checkout; Compose warned that `ROOT_FOLDER_HOST`, `APP_STORE_ID`, and `APP_DATA_DIR` were unset | command run 2026-08-23 |
| Web verification | `npm run build` was attempted and both apps failed with `next: not found`; dependencies are not installed in the workspace | command run 2026-08-23 |
| Backend verification | Full suite after provider changes: 14 passed, 15 skipped; Ruff clean | commands run 2026-08-23 |

## Current deployment copy

The inspected checkout is itself the Runtipi app source/build copy at `/data/runtipi/runtipi-appstore/gpu-private-store/apps/web-crackstack`. No separate installed service-owned Crackstack mirror was discovered within the permitted inspection scope. The root Compose build context points at the Runtipi app-store layout and cannot be meaningfully brought up here without its deployment variables and data directory.

## Gap assessment against Crackstack Next

The highest-value first implementation slice is provider abstraction plus typed provider capability/config contracts. It is isolated from data execution and preserves the existing agent fallback. The next bounded slices should introduce canonical domain models and a real Temporal worker, then replace process-memory approvals and expose product-level events. The current source is not yet qualified for the requested durable vertical slice.

## Safety constraints for modernization

- Preserve the single backend and shared data engine.
- Preserve immutable dataset versions and existing RLS policies.
- Keep LocalAI compatibility as a migration adapter, but remove it as the architectural boundary.
- Do not claim Temporal execution until a worker and a real workflow run are observed.
- Do not remove Redis/MinIO solely from declaration; first verify actual runtime usage and migration impact.
- Do not overwrite unrelated sibling-app changes in the surrounding worktree.
