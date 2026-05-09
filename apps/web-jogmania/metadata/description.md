# Web Jogmania

Jogmania is an exercise platform powered by iOS + Apple Watch capture and a FastAPI gamification engine. The web app is a user portal for runs, routes, and adventure replays.

## Deployment stance

- Secondary-node role: this app is packaged for the private Runtipi node on `192.168.1.162`.
- Primary edge remains `192.168.1.57` (`runtipi.rasies.com`).
- Recommended exposure: eligible for selective edge proxying later.

## Migration notes

- Source tree today: `/data/apps/web-jogmania`
- Recommended source repo target: `/data/repos/apps/web-jogmania`
- Conversion strategy: `auto-with-manual-review`
- Migration complexity: `high`
- Current source-of-truth layout on this node is the newer `repo/` monorepo:
  - `repo/api`
  - `repo/apps/web`
  - `repo/apps/ios`
  - `repo/packages/*`
- This app now intentionally prefers the monorepo structure over the older flat runtime because the preserved legacy data was only disposable seed data.
- Keep the product repo whole for iOS and shared-package development, but package only the Linux-hosted web, API, Postgres, Redis, and MinIO services into Runtipi.
- Treat the iOS client as product-adjacent source that can live in the same repo when present, but package only the Linux-hosted services into Runtipi.

## Data notes

- Runtipi app-data convention: migrate app-owned state into `${APP_DATA_DIR}/app-data/web-jogmania/...`.
- Keep source code in the app repo and keep external shared media/model libraries on explicit host paths when needed.
- No legacy Docker volumes were found on this node during this migration pass, so this package currently behaves like a clean install unless older state is introduced later.

## Port notes

- Reserve `80` and `443` on this node for Runtipi itself.
- Main web UIs should be reached through the Runtipi local domain rather than a copied legacy host port.
- Keep the main web UI on `3177` and the companion API on `3178` for predictable LAN and iOS-device testing.
- MinIO object storage is exposed on `3181` because the export flow returns presigned URLs that must remain reachable from clients.
- Postgres and Redis stay internal-only.

- Named volume `jogmania_pg` mounted to `/var/lib/postgresql/data`
- Named volume `jogmania_minio` mounted to `/data`
- Bind mount `/data/repos/apps/web-jogmania/repo/api` -> `/app`
- Bind mount `/data/repos/apps/web-jogmania/repo` -> `/repo`

## Edge-routing notes

- Do not let this node become the public edge by accident.
- If this app should be reachable externally later, proxy it from the primary node rather than moving edge duties here.
