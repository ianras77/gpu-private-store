# Jogmania — Retro Fitness Adventure Platform

Jogmania is an exercise platform powered by iOS + Apple Watch capture and a FastAPI gamification engine. The web app is a user portal for runs, routes, and adventure replays (not a game).

## Repo Layout
- `repo/apps/web` — Next.js + Tailwind web portal
- `repo/apps/ios` — Expo React Native iOS app
- `repo/api` — FastAPI backend + Alembic
- `repo/packages/api-client` — shared TypeScript API client
- `repo/packages/shared` — shared types + Zod

## One‑Command Dev (Docker)
```bash
docker compose -f docker-compose.dev.yml up --build
```

Services
- Web: http://localhost:3000
- API: http://localhost:8000
- API Docs: http://localhost:8000/docs
- MinIO Console: http://localhost:9001

## Local Dev (Non‑Docker)
```bash
# Terminal 1 (API)
cd repo/api
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
pip install -r requirements-dev.txt
alembic upgrade head
python -m app.scripts.seed
uvicorn app.main:app --reload

# Terminal 2 (Monorepo)
cd repo
corepack enable
pnpm install
pnpm dev
```

## Generate TS API Client
```bash
cd repo
pnpm gen:client
```

## Demo User
- Email: demo@jogmania.com
- Password: demo1234

## What Works Now
- Auth (register/login) with httpOnly cookie sessions
- `/me` session endpoint
- Runs: list + detail + map
- iOS run capture: live GPS via Expo Location (or mock mode)
- Watch pipeline: iOS Watch Sync tab can upload a simulated watch run (source=watch)
- Levels (routes): list + detail + instances + stats
- Adventure replays (deterministic summaries)
- Exports to MinIO with graceful fallback
- Dashboard + marketing site polish

## How to Test Quickly
1. `docker compose -f docker-compose.dev.yml up --build`
2. Open http://localhost:3000
3. Sign in with demo user or create a new account
4. Visit `/overview` to see runs + levels
5. Open a run detail page to see the map + replay
6. Open a level to see route stats + instances
7. Export a run in `/settings` (requires MinIO)

## Environment Variables
Copy `.env.example` to `.env` and adjust:
- Required: `DATABASE_URL`, `JWT_SECRET`, `REDIS_URL`
- Recommended: `CORS_ORIGINS`, `AUTH_COOKIE_*`
- Optional exports: `MINIO_*`, `MINIO_ENABLED`
- Optional email verification: `AUTH_REQUIRE_EMAIL_VERIFICATION`, `SMTP_*`
- iOS capture: `EXPO_PUBLIC_CAPTURE_MODE` (`gps` or `mock`)

## Testing & Linting
```bash
cd repo
pnpm lint
pnpm test
```

## Runtipi (Dynamic Compose v2)
Mount host paths and run from the monorepo.

- Web container: mount host `APP_DATA_DIR` to `/repo` and run from `/repo/repo/apps/web`
- API container: mount host `APP_DATA_DIR/repo` to `/app` and run from `/app/api/app`

### Copy Into APP_DATA_DIR
```text
APP_DATA_DIR/
  repo/
    apps/
    api/
    packages/
    pnpm-workspace.yaml
    package.json
    tsconfig.base.json
```

### Runtipi Start Commands
- Web: `cd /repo/repo && corepack enable && pnpm install && pnpm --filter @jogmania/web dev -p 3000`
- API: `cd /app/api && pip install -r requirements.txt && pip install -r requirements-dev.txt && alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000`

## Troubleshooting
- Auth succeeds but UI is logged out: verify cookies are enabled and API base URL matches web origin.
- 503 on exports: MinIO not configured or not running; set `MINIO_*` or disable exports.
- 429 login/register: Redis unavailable; check `REDIS_URL` or restart Redis.
- iOS device cannot reach API: set `EXPO_PUBLIC_API_BASE_URL` to your machine IP (not `localhost`).

## Notes
- No secrets are hardcoded. Copy `.env.example` to `.env` to customize.
- CORS defaults to `http://localhost:3000` and `http://localhost:19006`.
- Redis rate limits login/register.
- Email verification only activates when `AUTH_REQUIRE_EMAIL_VERIFICATION=true` and SMTP is configured.
- See `docs/REPORT.md` for the implementation report.
