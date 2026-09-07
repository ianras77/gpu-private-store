# BAT 2.0 migration baseline

Date: 2026-09-02

The Runtipi app currently contains Next.js web, FastAPI API/worker, Postgres,
Redis, Qdrant, Cheshire Cat, and the social publisher. Existing editorial
orchestration remains in `apps/api/src/services/editorial_service.py` and
`apps/api/src/workers/jobs.py`; this migration adds Mastra as a staged control
plane while keeping the deterministic Python data plane and existing routes.

## Evidence

- Python tests: 192 passed.
- Web UI tests: passed.
- Compose validation: passed.
- Next production build: rerun with `npm run build` in `apps/web`.
- Existing persisted Postgres/Qdrant data and Runtipi volume paths are retained.

## Runtipi contract

The new service uses the existing `${RUNTIPI_APP_BUILD_ROOT}`, `${APP_DATA_DIR}`,
`tipi_main`, `extra_hosts`, healthcheck, and restart conventions. It has no
published host port and receives credentials only through server-side
environment variables.

## Migration boundary

`bat-mastra` is the canonical home for editorial agents and workflows. It now
exposes authenticated capability discovery, a bounded research workflow, and a
source-visible report-artifact workflow. Report generation is intentionally
review-gated: the current adapter creates a typed artifact from BAT-approved
sources, while prose generation remains behind the existing editorial parity
boundary until the RassyMind provider contract is qualified in this app.
The existing API remains the compatibility facade until each workflow has a
tested adapter and parity evidence. Cheshire Cat and local model containers are
not removed in this foundation phase because doing so before parity would risk
existing editorial functionality and persisted state.
