# Blondes Against Trump conversion notes

- Strategy: `validated-with-data-copy`
- Complexity: `medium`

## Current migration stance

- The package keeps the app's real source layout under `/data/repos/apps/blondesagainsttrump`:
  - `apps/web`
  - `apps/api`
  - `apps/social-publisher`
  - `infra/sql`
- Local per-app Ollama containers were removed on this node. BAT now uses the shared in-house Ollama services:
  - `ollama-general:11434`
  - `ollama-embed:11434`
- API, worker, and Cheshire Cat join `tipi_main_network` so they can reach the shared Ollama services while still using app-scoped internal dependency names.
- The Next.js web image now builds through a package-level `Dockerfile.web` so `NEXT_PUBLIC_API_BASE_URL` is baked correctly for this node without editing the source repo.
- Direct migration ports are aligned as:
  - web UI on `3197`
  - API on `3198`
- Social publisher, Postgres, Redis, Qdrant, and Cheshire Cat remain internal-only by default.

## Data handling

- Preserve the legacy BAT data volumes by copying them into:
  - `${APP_DATA_DIR}/app-data/blondesagainsttrump/named/bat-postgres-data`
  - `${APP_DATA_DIR}/app-data/blondesagainsttrump/named/bat-qdrant-data`
  - `${APP_DATA_DIR}/app-data/blondesagainsttrump/named/bat-cat-data`
- The old per-app Ollama volumes are intentionally not migrated into `app-data` because this node now uses the shared Ollama layer instead.

## Manual follow-up

- BAT ships README-only Cat plugin directories in the source repo today. The core editorial flow and generic Cheshire message path still work, but any richer custom Cat plugin behavior should be treated as follow-up work until real plugin code is tracked there.
- Keep `ENABLE_MANUAL_REVIEW=true` and `X_DRY_RUN=true` unless you intentionally want live publishing behavior.
