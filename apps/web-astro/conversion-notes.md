# Web Astro conversion notes

- Strategy: `self-contained packaging`
- Complexity: `high`

## Applied

- Renamed the app from `astro` to `web-astro`
- Vendored the monorepo under `repo/` and mounted it from the packaged app
- Moved persistent state to `${APP_DATA_DIR}/app-data/web-astro/...`
- Replaced node-specific source and media paths with packaged source plus `${ROOT_FOLDER_HOST}/media`

## Follow-up

- Copy any legacy Postgres, Redis, and Qdrant data into `app-data` before first production boot
- Set `ASTRO_PUBLIC_API_BASE` explicitly if you need a non-default API URL
