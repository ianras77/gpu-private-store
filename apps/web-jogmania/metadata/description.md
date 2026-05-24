# Web Jogmania

Jogmania turns iPhone and Apple Watch walk/run workouts into replayable adventure courses. HealthKit metrics, GPS shape, climbs, turns, pace changes, and heart-rate pressure become map overlays, hazards, rewards, and world events.

## Deployment stance

- Secondary-node role: this app is packaged for the private Runtipi node on `192.168.1.162`.
- Primary edge remains `192.168.1.57` (`runtipi.rasies.com`).
- Recommended exposure: eligible for selective edge proxying later.

## Migration notes

- Source tree today: `/data/runtipi/runtipi-appstore/gpu-private-store/apps/web-jogmania`
- Installed runtime copy: `/data/runtipi/apps/gpu-private-store/web-jogmania`
- Conversion strategy: `auto-with-manual-review`
- Migration complexity: `high`
- Current source-of-truth layout on this node is the newer `repo/` monorepo:
  - `repo/repo/api`
  - `repo/repo/apps/web`
  - `repo/repo/apps/ios`
  - `repo/repo/packages/*`
- This app now uses the richer monorepo structure for Runtipi runtime and native app development; the older flat runtime is archived under `repo/archive/legacy-flat`.
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
- Bind mount `/data/runtipi/apps/gpu-private-store/web-jogmania/repo/repo/api` -> `/app`
- Bind mount `/data/runtipi/apps/gpu-private-store/web-jogmania/repo/repo` -> `/repo`

## Edge-routing notes

- Do not let this node become the public edge by accident.
- If this app should be reachable externally later, proxy it from the primary node rather than moving edge duties here.
