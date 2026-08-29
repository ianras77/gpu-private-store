# Rassys 2.0 repository map

- `apps/web`: Next.js public shell, application routes, API compatibility layer.
- `services/radio-controller`: catalog, station state, DJ and playout control.
- `services/minecraft-bridge`: optional Minecraft status integration.
- `infra/liquidsoap` and `infra/icecast`: audio playout and stream delivery.
- `docker-compose.yml`: canonical Runtipi app Compose entrypoint.
- `ops/rassys2`: release checks and operator automation.

The repository is a nested appstore checkout. Runtipi builds it from the managed app
mirror using `RUNTIPI_APP_BUILD_ROOT`, `APP_STORE_ID`, and `ROOT_FOLDER_HOST`.
