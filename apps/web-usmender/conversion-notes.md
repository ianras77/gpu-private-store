# Web Usmender conversion notes

- Strategy: `self-contained packaging`
- Complexity: `medium`

## Applied

- Vendored the application source under `repo/`
- Replaced legacy external build contexts with `${ROOT_FOLDER_HOST}/apps/${APP_STORE_ID}/web-usmender/repo`
- Normalized the web client API default to the published Runtipi API port
- Kept Postgres internal while the main site remains the only host-facing service

## Follow-up

- Add deeper product-specific smoke coverage when the app behavior stabilizes beyond the current packaging baseline
