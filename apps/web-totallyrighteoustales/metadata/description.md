# Web Totallyrighteoustales

A whimsical long-form storytelling commons with moderation, voting, and a leaderboard. - Web: Next.js App Router + Tailwind CSS - API: Fastify + Prisma + Postgres + Redis/BullMQ - iOS: Expo (React Native) - Auth: Supabase magic links (JWT verified by API) - Storage: S3-compatible (presigned upload) make up Canonical st.

## Deployment stance

- Secondary-node role: this app is packaged for the private Runtipi node on `192.168.1.162`.
- Primary edge remains `192.168.1.57` (`runtipi.rasies.com`).
- Recommended exposure: eligible for selective edge proxying later.

## Migration notes

- Source tree today: `/data/repos/apps/web-totallyrighteoustales`
- Recommended source repo target: `/data/repos/apps/web-totallyrighteoustales`
- Conversion strategy: `validated-with-data-copy`
- Migration complexity: `medium`
- Keep the monorepo shape intact: `apps/web`, `apps/api`, and `apps/ios` stay together in the source repo, while only the Linux-hosted services are packaged into Runtipi.

## Data notes

- Runtipi app-data convention: migrate app-owned state into `${APP_DATA_DIR}/app-data/web-totallyrighteoustales/...`.
- Keep source code in the app repo and keep external shared media/model libraries on explicit host paths when needed.
- Migrate the preserved legacy Docker volumes into:
  - `${APP_DATA_DIR}/app-data/web-totallyrighteoustales/named/trt-postgres`
  - `${APP_DATA_DIR}/app-data/web-totallyrighteoustales/named/trt-cat-data`
- The Cheshire bootstrap helper is read directly from `/data/repos/apps/web-totallyrighteoustales/ops/bootstrap_cat_ollama.py`.

## Port notes

- Reserve `80` and `443` on this node for Runtipi itself.
- Keep the direct migration block aligned to:
  - web UI on `3190`
  - API on `3191`
- Database, cache, and vector-store helper services are intentionally de-published by default in generated packages to reduce collisions.

## Edge-routing notes

- Do not let this node become the public edge by accident.
- If this app should be reachable externally later, proxy it from the primary node rather than moving edge duties here.

## Manual follow-up blockers

- Supabase-backed auth still needs real node-local `TRT_SUPABASE_*` values if you want the auth flows beyond `DEV_AUTH_BYPASS`.
- S3-backed uploads still need real `TRT_S3_*` values if you want object storage instead of local/no-op testing.
