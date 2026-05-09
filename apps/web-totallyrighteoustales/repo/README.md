# Totally Righteous Tales

A whimsical long-form storytelling commons with moderation, voting, and a leaderboard.

## Stack

- Web: Next.js App Router + Tailwind CSS
- API: Fastify + Prisma + Postgres + Redis/BullMQ
- iOS: Expo (React Native)
- Auth: Supabase magic links (JWT verified by API)
- Storage: S3-compatible (presigned upload)

## Quick Start

### Production (Single Command, Persistent)

```bash
make up
```

Canonical startup now lives in `scripts/stack.sh`, and both `make up` and `pnpm stack:up` call it.
The script will create the shared `ollama_llm-net` Docker network if it is missing, then run `docker compose up -d --build`.
All services use `restart: unless-stopped`, so they come back after reboot/session restart.

Equivalent commands:

```bash
pnpm stack:up
./scripts/stack.sh up
```

Useful commands:

```bash
make ps
make logs
make down
make restart
```

URLs:

- Web: `http://localhost:3190`
- API: `http://localhost:3191`
- Postgres: `localhost:3192`
- Redis: `localhost:3193`
- Cheshire Cat (this stack): `http://localhost:1868`

### Local Manual

1. Install dependencies:

```bash
pnpm install
```

2. Start Postgres + Redis:

```bash
docker compose up -d
```

3. Configure env:

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

For iOS, export:

```bash
export EXPO_PUBLIC_API_URL=http://localhost:3191
export EXPO_PUBLIC_SUPABASE_URL=...
export EXPO_PUBLIC_SUPABASE_ANON_KEY=...
```

4. Set up database:

```bash
pnpm -C apps/api db:migrate
pnpm -C apps/api db:seed
```

5. Run the API + worker + web:

```bash
pnpm -C apps/web build
pnpm start:api
pnpm start:worker
pnpm start:web
```

6. Run iOS:

```bash
pnpm -C apps/ios start
```

## Auth Notes (Supabase)

- Create a Supabase project.
- In `apps/api/.env`, set `SUPABASE_JWT_SECRET` (from Supabase JWT settings).
- In `apps/web/.env`, set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- For Expo, set `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` in your terminal when running.

### Dev Auth Bypass

If you want to test without Supabase, set in `apps/api/.env`:

```
DEV_AUTH_BYPASS=true
```

Then send `x-dev-user: you@example.com` as a header to authenticate.

## LocalAI (On-Box)

The API can use the LocalAI cluster on this server. Set in `apps/api/.env`:

```
OPENAI_ENABLED=true
LOCALAI_BASE_URL=http://localhost:8111/v1
LOCALAI_CHAT_MODEL=qwen3-1.7b
LOCALAI_MODERATION_MODEL=ibm-granite.granite-4.0-1b
LOCALAI_EMBED_MODEL=granite-embedding-125m-english
LOCALAI_TRANSCRIBE_MODEL=whisper-1
```

Models were chosen from `/models` on `localai-0` and match the installed YAML names.

## Cheshire Cat (BAT Instance)

If you want to mirror the working BAT Cheshire Cat settings in this app, set:

```
CHESHIRE_CAT_URL=http://localhost:1868
CHESHIRE_CAT_API_KEY=change_me
```

For Docker Compose production in this repo, Cheshire Cat runs in-stack and API uses:

```
CHESHIRE_CAT_URL=http://cheshire-cat:80
```

The in-stack Cheshire Cat now bootstraps itself to the shared local Ollama services:

- chat/general: `ollama-general:11434`
- embeddings: `ollama-embed:11434`

## iOS Audio Transcription

- The Compose screen can record audio and sends it to `/transcribe`.
- Ensure `OPENAI_ENABLED=true` and LocalAI whisper model is available.

## Semantic Search (API)

`GET /tales/search?query=your+text`

- Uses LocalAI embeddings and cosine similarity over the latest `SEARCH_POOL_SIZE` embeddings.
- Tuned by `SEARCH_MIN_SIM` (default `0.78`).

## Featured + Profile

- `GET /tales/featured` returns the top hot tales from the last 7 days.
- `GET /tales/mine` returns the signed-in user's tales.

## Edit / Needs-Edits Flow

- Moderators can mark tales as `NEEDS_EDITS` with a reason.
- Authors can edit and resubmit via `PATCH /tales/:id` (only when status is `NEEDS_EDITS`).
- iOS edit screen supports replacing images (uses S3 presigned upload + moderation queue).

## Storage

Set S3 env vars in `apps/api/.env`:

```
S3_ENDPOINT=
S3_BUCKET=
S3_ACCESS_KEY=
S3_SECRET_KEY=
S3_PUBLIC_URL=
```

## Tests

- API:

```bash
pnpm -C apps/api test
```

- Web:

```bash
pnpm -C apps/web test
```

## Seed / Admin

- Default admin email: `admin@totallyrighteoustales.local`
- Set `ADMIN_EMAIL` in `apps/api/.env` before running `db:seed` to choose a different admin.

## Deployment Notes

- Web: deploy on Vercel
- API + Worker: deploy on Render/Fly/railway with separate process for `dev:worker`
- Redis/Postgres: managed services or Docker on the host
- Set env vars (Supabase + S3 + Redis + Postgres) in your deployment platform

## Troubleshooting

- If API returns 401 and you aren’t using Supabase, ensure `DEV_AUTH_BYPASS=true` and send `x-dev-user` header.
- If uploads fail, confirm S3 bucket and public URL.
