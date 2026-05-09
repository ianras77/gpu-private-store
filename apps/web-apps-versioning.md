# Web App Release Process

This store now treats the web app set as first-class Runtipi apps.

## Target apps

- `web-astro`
- `web-bat`
- `web-crackstack`
- `web-lickingvape`
- `web-jogmania`
- `web-rasies`
- `web-rassyapp`
- `web-rassys`
- `web-totallyrighteoustales`
- `web-usmender`

## Versioning rule

- `version` is the product version shown in Runtipi. Keep it semantic and bump it when the underlying app changes.
- `tipi_version` is the package-definition version. Bump it when `config.json`, `docker-compose.yml`, metadata, paths, ports, or install behavior change for the same app `id`.
- If an app `id` changes, Runtipi treats it as a new app. Start that new `id` at `tipi_version: 1`.

## Packaging rule

- Keep `config.json.id` equal to the folder name.
- Keep builds self-contained inside the app folder, usually under `repo/`, `apps/`, `services/`, or `infra/`.
- Do not point compose files at legacy external source roots.
- Prefer `${ROOT_FOLDER_HOST}/apps/${APP_STORE_ID}/<app>` for app-local assets and `${ROOT_FOLDER_HOST}/media/...` for shared media.
- Keep user-facing metadata concise and product-focused. Migration history belongs in maintainer notes, not the store card.

## Release checklist

1. Update vendored source under the target app folder.
2. Bump `version` in that app's `config.json`.
3. Bump `tipi_version` if the Runtipi package definition changed.
4. Refresh `updated_at`.
5. Verify `docker-compose.yml` still uses `x-runtipi` and no machine-specific paths or IPs.
6. Confirm the folder still includes `config.json`, `docker-compose.yml`, `metadata/description.md`, and `metadata/logo.jpg`.

## Quick checks

- Run a ripgrep sanity check for legacy external source paths and hardcoded LAN IPs across the current web app folders before release.
