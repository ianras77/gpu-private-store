# Langflow

Langflow exposes a primary web interface. with persistent supporting data services.

## Deployment stance

- Secondary-node role: this app is packaged for the private Runtipi node on `192.168.1.162`.
- Primary edge remains `192.168.1.57` (`runtipi.rasies.com`).
- Recommended exposure: internal-only by default.

## Migration notes

- Source tree today: `/data/apps/langflow`
- Recommended source repo target: `/data/repos/apps/langflow`
- Conversion strategy: `auto`
- Migration complexity: `low`

## Data notes

- Runtipi app-data convention: migrate app-owned state into `${APP_DATA_DIR}/app-data/langflow/...`.
- Keep source code in the app repo and keep external shared media/model libraries on explicit host paths when needed.

## Port notes

- Reserve `80` and `443` on this node for Runtipi itself.
- Main web UIs should be reached through the Runtipi local domain rather than a copied legacy host port.
- Database, cache, and vector-store helper services are intentionally de-published by default in generated packages to reduce collisions.

- Bind mount `/data/apps/langflow/langflow_data` -> `/config`
- Bind mount `/data/apps/langflow/custom_components` -> `/app/custom_components`
- Bind mount `/data/apps/langflow/pg_data` -> `/var/lib/postgresql/data`
- Bind mount `/data/apps/langflow/redis_data` -> `/data`

## Edge-routing notes

- Do not let this node become the public edge by accident.
- If this app should be reachable externally later, proxy it from the primary node rather than moving edge duties here.

## RassyCodex notes

- Langflow defaults to the standalone RassyCodex OpenAI-compatible gateway at `http://host.docker.internal:8844/v1`.
- Use the `RassyCodex API key` field or `LANGFLOW_RASSYCODEX_API_KEY` in `app.env` when gateway auth is enabled.
- Canonical model aliases are `rassy-codex` for chat/coding and `rassy-embed` for embeddings.
