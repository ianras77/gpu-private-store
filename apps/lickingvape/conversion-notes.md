# Lickingvape conversion notes

- Strategy: `validated-with-data-copy`
- Complexity: `medium`

## Current migration stance

- The package now follows the real monorepo-style source layout on this node:
  - `/data/repos/apps/lickingvape/apps/web`
  - `/data/repos/apps/lickingvape/apps/api`
  - `/data/repos/apps/lickingvape/apps/worker`
- Service names are app-scoped so the stack can safely mix internal networking with `tipi_main_network` access.
- The Cheshire Cat sidecar no longer depends on the old external `ollama_llm-net`; it reaches the in-house `ollama-general` and `ollama-embed` services through `tipi_main_network`.
- The Cheshire bootstrap now mounts the repo's tracked helper script directly and points it at `/data/metadata.json`, so Ollama auto-configuration is deterministic under Runtipi.
- Direct migration ports are aligned as:
  - web UI on `3195`
  - API on `3196`
- Postgres and Cheshire Cat remain internal-only apart from the web UI and optional API debugging port.

## Data handling

- Preserve the newer legacy Postgres volume by copying `lickingvape_db_data` into:
  - `${APP_DATA_DIR}/app-data/lickingvape/named/lickingvape-postgres`
- Keep the older `web-lickingvape_db_data` volume archived only unless a deliberate rollback needs it.

## Manual follow-up

- The worker gracefully falls back when Cheshire draft/review endpoints are unavailable, but a richer Cat-specific workflow may still need app-specific plugin content or Cat-side configuration that is not tracked in this repo.
- If Twilio inbound SMS is required, set real `LICKINGVAPE_TWILIO_AUTH_TOKEN`, `LICKINGVAPE_PUBLIC_BASE_URL`, and any admin/internal tokens in `user-config/app.env`.
