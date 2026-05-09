# Web Crackstack conversion notes

- Strategy: `self-contained packaging`
- Complexity: `high`

## Applied

- Renamed the app from `crackstack` to `web-crackstack`
- Vendored the source tree under `repo/` and pointed build contexts there
- Moved persistent state to `${APP_DATA_DIR}/app-data/web-crackstack/...`
- Kept XLCRACK as the main entry point and TAPECRACK on the adjacent port

## Follow-up

- Copy any legacy Postgres, MinIO, or backend data into `app-data` before first production boot
