# Rassy Online

Rassy Online is the Runtipi app for `rassy.online`, designed as the public web workbench for RassyCodex.

The app includes:

- Runtipi metadata and dynamic compose.
- A Next.js web shell.
- Private Postgres and Qdrant services.
- App-data mounts for persistent uploads, database state, and vector state.
- RassyCodex container routing through `host.docker.internal:8844`.
- Optional on-demand web context through `search.rasies.com`.
- `/api/health` for Runtipi and Docker health checks.

## Verification

From `apps/web-rassyonline/apps/web`:

```bash
npm run test
npm run lint
npm run build
```

From `apps/web-rassyonline`:

```bash
docker compose config --quiet
```

From the appstore root:

```bash
./scripts/validate-store.sh /data/runtipi/runtipi-appstore/gpu-private-store
```

## Runtime Notes

The public web service is `rassy-online-web` and listens internally on port `3000`. Runtipi publishes it through the configured app port.

The web container expects:

- `RASSY_ONLINE_PUBLIC_BASE_URL`
- `RASSY_ONLINE_AUTH_SECRET`
- `RASSY_ONLINE_POSTGRES_PASSWORD`
- `RASSY_ONLINE_QDRANT_API_KEY`
- `RASSYCODEX_BASE_URL`
- `RASSY_ONLINE_SEARCH_URL`

The web search lane is controlled by the chat UI and defaults to `auto`, so normal local chats stay internet-blind unless the prompt asks for fresh resources or search is forced on.
