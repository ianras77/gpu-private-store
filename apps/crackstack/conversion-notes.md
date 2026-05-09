# Crackstack conversion notes

- Strategy: `standardized product package`
- Complexity: `high`

## Standardization applied

- Kept the shared backend, Postgres, Redis, MinIO, and Temporal services together in one product package.
- Promoted `xlcrack` as the main Runtipi web entry and kept `tapecrack` on the next adjacent host port.
- Switched to app-scoped service names to avoid shared-network collisions.
- Replaced the old LocalAI-style dependency with the in-house Ollama general service:
  - `LOCALAI_BASE_URL=http://ollama-general:11434`
- Reserved a stable adjacent host-port block:
  - `3212` XLCRACK
  - `3213` TAPECRACK
  - `3214` API
- Kept Temporal UI and MinIO internal-only for now to avoid unnecessary helper-port sprawl.

## Notes

- Legacy Postgres, MinIO, and backend data volumes should be copied into `app-data` before first Runtipi boot.
- The web apps continue to talk to the backend over the internal package network rather than through host ports.
