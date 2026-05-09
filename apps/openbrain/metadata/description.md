# Open Brain

Open Brain is packaged here as a self-hosted RunTipi starter: local PostgreSQL + pgvector for thought storage, an MCP HTTP endpoint, and a small status page so the app opens cleanly from the dashboard.

## Included in this package

- Local `openbrain` PostgreSQL database with pgvector enabled
- OB1-style MCP server for capture, search, recent-thought listing, and stats
- Shared read-only mounts for `${ROOT_FOLDER_HOST}/media/data` and `${ROOT_FOLDER_HOST}/media/data/obsidian`
- A bundled Obsidian importer helper container with persistent sync/report state under `${APP_DATA_DIR}/app-data/openbrain/named/import-state`
- One-click `Dry Run` and `Live Import` controls from the main app status page

## Default mounted paths inside the containers

- `/media/data` -> shared RunTipi media/data tree (read-only)
- `/vault/obsidian` -> default Obsidian vault path (read-only)
- `/state` -> importer sync log + report output

## Notes

- The main app URL shows the service status, configured MCP endpoint path, and the default importer command.
- If your vault lives somewhere else, override `OBSIDIAN_VAULT_HOST_PATH` in the app environment.
- The importer helper is intentionally idle by default; run imports manually when you're ready so you can dry-run first.
