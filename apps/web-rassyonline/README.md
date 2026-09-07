# Rassy Online

Current package release: `0.1.8`. The admin console now surfaces live RassyMind
catalog health, lane capabilities, safe observability posture, retrieval quality
instrumentation, and the human-controlled canary/promotion state.

Rassy Online is the Runtipi app for `rassy.online`, designed as the public web workbench for RassyMind.

Rassy Online does not expose image generation; its RassyMind experience is focused on chat, documents, retrieval, and web context.

The app includes:

- Runtipi metadata and dynamic compose.
- A Next.js web shell.
- Private Postgres and Qdrant services.
- App-data mounts for persistent uploads, database state, and vector state.
- RassyMind container routing through `host.docker.internal:8844`.
- Canonical model aliases: `rassy-mind`, `rassy-code`, `rassy-fast`, `rassy-utility`, `rassy-embed`, and optional `rassy-rerank` for grounded answers.
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
- `RASSYMIND_BASE_URL`
- `RASSYMIND_API_KEY`
- `RASSY_ONLINE_SEARCH_URL`

The web search lane is controlled by the chat UI and defaults to `auto`, so normal local chats stay internet-blind unless the prompt asks for fresh resources or search is forced on.

The workbench exposes the complete text-lane selection, temperature and response-budget dials, multi-file text/source/config uploads, user-scoped `rassy-embed` vectors, optional `rassy-rerank`, and copyable Markdown/code output. Binary PDF/DOCX parsing is intentionally not advertised because the RassyMind embedding contract accepts text input here.
# Rassy Online

Runtipi-native RassyMind workbench. The server includes a Mastra application layer for
semantic agents, safe tools, workflow contracts, skills, and opt-in MCP extensions. See
`docs/MASTRA-PLATFORM-QUALIFICATION.md` for the current migration boundary and validation.
