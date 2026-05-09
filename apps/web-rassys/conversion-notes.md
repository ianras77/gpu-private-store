# Web Rassys conversion notes

- Strategy: `packaged source with standard media mounts`
- Complexity: `high`

## Applied

- Renamed the app from `web-rassy` to `web-rassys`
- Pointed all build contexts and helper file mounts at packaged source in this app folder
- Moved persistent state to `${APP_DATA_DIR}/app-data/web-rassys/...`
- Replaced node-specific media defaults with `${ROOT_FOLDER_HOST}/media`

## Follow-up

- Overlay compose files outside this package are not part of the supported Runtipi runtime
