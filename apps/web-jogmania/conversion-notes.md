# Web Jogmania conversion notes

- Strategy: `auto-with-manual-review`
- Complexity: `high`

## Manual adjustments applied

- Corrected the package to use the newer monorepo layout on this node:
  - `repo/repo/api`
  - `repo/repo/apps/web`
  - `repo/repo/apps/ios`
  - `repo/repo/packages/*`
- Added monorepo-aware `runtipi-start.sh` entrypoints inside the newer source tree so startup follows the product repo instead of the older flat copy.
- Kept the web and API services on language base images plus source mounts because the current repo is more reliable in that mode than via stale custom Docker build paths.
- Used host repo paths for runtime source mounts because Runtipi's compose runtime on this node needs host-visible bind paths even when build contexts come from the app-store container view.
- Normalized environment variables to the keys the current code actually reads:
  - `NEXT_PUBLIC_API_BASE_URL`
  - `MINIO_*`
  - `CORS_ORIGINS`
- Restored the API database URL to the `psycopg2` driver used by the newer monorepo's FastAPI settings and requirements.
- Relaxed the web service dependency gate to `service_started` because the Next.js frontend does not need the API to be fully healthy before it can boot.
- Dropped the stale `localai_default` external network requirement and replaced it with optional host-gateway access for future LLM wiring.
- Kept a published API port for LAN and iOS-device testing, and kept MinIO published because export URLs must be client-reachable.

## 2026-05-24 rich-channel cutover

- Archived the old flat `repo/api`, `repo/web`, and flat assets under `repo/archive/legacy-flat`.
- Runtipi now mounts `repo/repo/api` for the API and `repo/repo` for the web monorepo.
- The API startup script handles the previous flat-channel Alembic revision by stamping the richer monorepo head when the live schema already contains the richer tables.
