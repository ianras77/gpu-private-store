# Rassy Launchpad

Rassy Launchpad is a kid-first AI game studio built on Next.js and Prisma. It wraps Cheshire Cat with guided coaching, starter templates, world recipes, inspiration shelves, build kits, and supervised next steps for Roblox-flavored projects. The WebSocket chat adapter uses the official `ccat-api` client.

## Integrated Stack (App + Cheshire Cat + Qdrant + RassyMind)

This repository now includes a dedicated Cheshire Cat stack for this app:

- `app` (Next.js frontend/backend wrapper)
- `cheshire-cat-core` (AI orchestration)
- `cheshire-cat-vector-memory` (Qdrant)
- package-owned `cheshire-cat-core` bootstrap (RassyMind model wiring + Cat auth provisioning)

Prerequisites:

1. Local RassyMind gateway is running on `http://host.docker.internal:8844`
2. Required RassyMind aliases are available (example):

```bash
curl http://127.0.0.1:8844/api/tags
```

Start the full stack:

```bash
cp .env.example .env
docker compose up -d --build
```

Endpoints:

- App: `http://localhost:${HOST_PORT:-3189}`
- Cheshire Cat API: `http://localhost:${CAT_HOST_PORT:-3185}`
- Qdrant API: `http://localhost:${QDRANT_HOST_PORT:-6333}`

Useful checks:

```bash
docker compose logs --tail=200 cheshire-cat-core
docker compose ps
```

## Local Run

1. Install dependencies:

```bash
npm install
```

2. Configure environment variables:

```bash
cp .env.example .env
```

Update the values in `.env`.

3. Prepare the database:

```bash
npm run prisma:generate
npm run prisma:migrate
```

4. Start the dev server:

```bash
npm run dev
```

App runs on `http://localhost:3000`.

## Environment Variables

- `CAT_HTTP_BASE` — Cheshire Cat HTTP base URL (example: `http://localhost:3185`).
- `CAT_WS_BASE` — Cheshire Cat WebSocket base URL (example: `ws://localhost:3185`).
- `CAT_HTTP_API_KEY` — Optional server-to-server API key (HTTP).
- `CAT_WS_API_KEY` — Optional server-to-server API key (WebSocket).
- `APP_SESSION_SECRET` — Secret for signing session cookies.
- `DATABASE_URL` — Prisma database URL. Default uses SQLite.
- `CAT_HOST_PORT` — Host port mapped to Cheshire Cat container (`3185` default).
- `QDRANT_HOST_PORT` — Host port mapped to Qdrant (`6333` default).
- `CCAT_QDRANT_API_KEY` — Optional Qdrant API key for Cheshire Cat.
- `CAT_ADMIN_USERNAME` / `CAT_ADMIN_PASSWORD` — Credentials provisioned into this package's Cheshire Cat metadata on startup.
- `OLLAMA_BASE_URL` — Chat/general RassyMind compatibility URL from containers (`http://host.docker.internal:8844`).
- `OLLAMA_EMBED_BASE_URL` — RassyMind compatibility URL for embeddings (`http://host.docker.internal:8844`).
- `OLLAMA_LLM_MODEL` — model alias to set for Cheshire Cat LLM (default `rassy-fast`; use an explicit larger alias for deep coding/reasoning).
- `OLLAMA_EMBED_MODEL` — embedding model alias for Cheshire Cat (default `rassy-embed`).
- `OLLAMA_APPLY_EMBEDDER` — `1`/`0` toggle for embedder auto-configuration (default `1`).
- `BOOTSTRAP_TIMEOUT_SECONDS` — Timeout while waiting for Cheshire Cat startup.

If you split model gateways later, set `OLLAMA_BASE_URL` for chat generation and `OLLAMA_EMBED_BASE_URL` for embeddings.

## Security Notes

- API keys stay on the server only.
- Browser requests always hit Launchpad route handlers, never the Cat instance directly.
- Session cookies are HTTP-only and signed.

## Cheshire Cat Integration Notes

- Auth is obtained via `POST /auth/token` and stored server-side in session records.
- This repo now bootstraps the package-owned Cheshire Cat container on startup so RassyMind model selection and Cat credentials come from this repo's `.env`.
- Cat identity is bound from `GET /users/me` with JWT (`sub`) fallback to guarantee stable `user_id` mapping.
- WebSocket streaming uses `/ws` with `?token=` and an optional `user_id` header for user-specific context.
- Every authenticated request now forwards a deterministic `user_id`: `engineUserId` when available, otherwise `console-<appUserId>`, so multi-user memory/model state remains isolated even when Cat user lookup is limited.
- Cat HTTP requests also include workspace-scoped headers (`x-console-workspace-id`, `x-console-workspace-role`) resolved from the signed-in user, and chat stream metadata includes `console_context` with workspace id/slug/role.
- The app exposes both targeted Cat routes and a generic authenticated passthrough at `GET/POST/PUT/PATCH/DELETE /api/cat/proxy/[...path]` for features not yet given dedicated UI.
- Plugin builder drafts are stored per app user under `.cat-plugin-builder/<user-id>/...` and can be generated via Cat LLM, checked, and deployed directly to Cheshire Cat as plugin zip uploads.

## Project Structure

- `app/` — Next.js App Router pages and API routes.
- `components/` — UI, chat, and studio components.
- `lib/cat/` — Server-only adapter layer for Cat integration.
- `prisma/` — Database schema and migrations.
- `tests/` — Basic route tests.
