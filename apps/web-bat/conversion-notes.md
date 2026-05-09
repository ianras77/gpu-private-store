# Web BAT conversion notes

- Strategy: `self-contained packaging`
- Complexity: `medium`

## Applied

- Renamed the app from `blondesagainsttrump` to `web-bat`
- Pointed builds, SQL seeds, and bootstrap helpers at files packaged inside this app folder
- Moved persistent state to `${APP_DATA_DIR}/app-data/web-bat/...`
- Kept shared Ollama access on `tipi_main_network`

## Follow-up

- Keep `ENABLE_MANUAL_REVIEW=true` and `X_DRY_RUN=true` unless you intentionally want live publishing
- README-only Cat plugin directories are still follow-up work if richer custom behavior is required
