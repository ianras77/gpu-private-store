# Blondes Against Trump

Blondes Against Trump is an internal-first editorial platform with a Next.js public and admin surface, a FastAPI orchestration API, a background worker, Qdrant retrieval, a small social publisher service, and a Cheshire Cat sidecar.

## Deployment stance

- Secondary-node role: this app is packaged for the private Runtipi node on `192.168.1.162`.
- Primary edge remains `192.168.1.57` (`runtipi.rasies.com`).
- Recommended exposure: keep LAN-first during migration and proxy selected routes from the primary edge later if needed.

## Migration notes

- Source tree today: `/data/repos/apps/blondesagainsttrump`
- Recommended source repo target: `/data/repos/apps/blondesagainsttrump`
- Conversion strategy: `validated-with-data-copy`
- Migration complexity: `medium`
- The package preserves the real repo structure and static SQL/bootstrap assets in source control instead of copying them into runtime storage.
- API, worker, and Cheshire Cat use shared in-house Ollama endpoints on this node:
  - `ollama-general:11434`
  - `ollama-embed:11434`
- The web image is built through the packaging-layer `Dockerfile.web` so the correct `NEXT_PUBLIC_API_BASE_URL` is baked at install time.

## Data notes

- Runtipi app-data convention: migrate app-owned state into `${APP_DATA_DIR}/app-data/blondesagainsttrump/...`.
- Preserve the legacy BAT data volumes by copying them into:
  - `${APP_DATA_DIR}/app-data/blondesagainsttrump/named/bat-postgres-data`
  - `${APP_DATA_DIR}/app-data/blondesagainsttrump/named/bat-qdrant-data`
  - `${APP_DATA_DIR}/app-data/blondesagainsttrump/named/bat-cat-data`
- The old per-app Ollama volumes are intentionally left out of the migration because this node now uses the shared Ollama stack.

## Port notes

- Reserve `80` and `443` on this node for Runtipi itself.
- Keep the direct migration block aligned to:
  - web UI on `3197`
  - API on `3198`
- Social publisher, Postgres, Redis, Qdrant, and Cheshire Cat are intentionally internal-only by default.

## Edge-routing notes

- Do not let this node become the public edge by accident.
- If this app should be reachable externally later, proxy it from the primary node rather than moving edge duties here.

## Manual follow-up

- BAT includes README-only Cat plugin directories in the repo today. Treat any richer custom Cat plugin behavior as follow-up work until plugin code is tracked there.
- Keep `ENABLE_MANUAL_REVIEW=true` and `X_DRY_RUN=true` unless you intentionally want live publishing behavior.
