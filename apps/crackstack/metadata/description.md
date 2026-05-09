# Crackstack

Shared data workbench product package with:

- `3212` XLCRACK
- `3213` TAPECRACK
- `3214` backend API

The package keeps Postgres, Redis, MinIO, and Temporal internal to the stack.

## Migration Notes

- Source repo: `/data/repos/apps/crackstack`
- App-owned state moves into `${APP_DATA_DIR}/app-data/crackstack/...`
- The backend now uses the in-house Ollama general service instead of an older LocalAI-style side dependency
- Helper surfaces such as Temporal UI and MinIO console stay unpublished by default to keep the node tidy

## Routing Notes

- Keep this node LAN-first during migration.
- If XLCRACK or TAPECRACK should later be exposed publicly, route them through the primary edge node rather than turning this host into an edge ingress.
