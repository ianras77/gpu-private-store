# Lickingvape

Lickingvape is an internal-first editorial community stack with a Next.js web UI, FastAPI backend, Postgres, a background worker, and a Cheshire Cat sidecar.

## Deployment stance

- Secondary-node role: this app is packaged for the private Runtipi node on `192.168.1.162`.
- Primary edge remains `192.168.1.57` (`runtipi.rasies.com`).
- Recommended exposure: keep LAN-first during migration and proxy selected routes from the primary edge later if needed.

## Migration notes

- Source tree today: `/data/repos/apps/lickingvape`
- Recommended source repo target: `/data/repos/apps/lickingvape`
- Conversion strategy: `validated-with-data-copy`
- Migration complexity: `medium`
- The package uses the real subdirectory build contexts from the repo:
  - `/data/repos/apps/lickingvape/apps/web`
  - `/data/repos/apps/lickingvape/apps/api`
  - `/data/repos/apps/lickingvape/apps/worker`
- App-scoped service names avoid collisions when the Cheshire service also joins `tipi_main_network`.
- Cheshire Cat is wired to the in-house Ollama services on this node:
  - `ollama-general:11434`
  - `ollama-embed:11434`

## Data notes

- Runtipi app-data convention: migrate app-owned state into `${APP_DATA_DIR}/app-data/lickingvape/...`.
- Preserve the newer legacy Postgres volume by copying `lickingvape_db_data` into:
  - `${APP_DATA_DIR}/app-data/lickingvape/named/lickingvape-postgres`
- Keep the older `web-lickingvape_db_data` volume archived only unless a deliberate rollback needs it.
- Cheshire state is stored under:
  - `${APP_DATA_DIR}/app-data/lickingvape/named/lickingvape-cat-data`

## Port notes

- Reserve `80` and `443` on this node for Runtipi itself.
- Keep the direct migration block aligned to:
  - web UI on `3195`
  - API on `3196`
- Postgres and Cheshire Cat are intentionally internal-only by default.

## Edge-routing notes

- Do not let this node become the public edge by accident.
- If this app should be reachable externally later, proxy it from the primary node rather than moving edge duties here.

## Manual follow-up

- If Twilio inbound SMS is required, set real `LICKINGVAPE_TWILIO_AUTH_TOKEN`, `LICKINGVAPE_PUBLIC_BASE_URL`, and admin/internal tokens in `user-config/app.env`.
- The worker falls back cleanly when Cat draft/review routes are unavailable, but richer Cat workflows may still need app-specific plugin content or Cat-side configuration not tracked in this repo.
