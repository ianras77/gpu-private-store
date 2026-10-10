# Web app repository migration

**Scope:** decouple the eleven `web-*` Runtipi packages in `gpu-private-store` from their vendored application source. Each product has one canonical GitHub repository under `/data/apps/2-Migrated`; each Runtipi package keeps its existing app ID and points its build and source mounts at that canonical checkout. The package `source` field links to that app's GitHub repository.

**Directory ownership:** the canonical path in the table is one folder per app and is that app's Git root. Component paths in the next column are nested within the same repository folder, not separate repositories. After publication, each app-store package retains only its Runtipi config, Compose file, and store metadata/assets.

## App-by-app map

| Runtipi package and ID | Canonical repository | Source layout used by the package | Migration acceptance |
| --- | --- | --- | --- |
| `web-astro` | [`web-astrology`](https://github.com/ianras77/web-astrology) | `/data/apps/2-Migrated/web-astrology` | Six image builds resolve there; esoterica remains mounted from shared media. |
| `web-bat` | [`web-bat`](https://github.com/ianras77/web-bat) | `/data/apps/2-Migrated/web-bat/blondesagainsttrump` | API, Mastra, publisher and web builds plus SQL init files resolve there. |
| `web-crackstack` | [`web-crack`](https://github.com/ianras77/web-crack) | `/data/apps/2-Migrated/web-crack/{backend,web}` | Backend and both web builds resolve there. |
| `web-jogmania` | [`web-jogmania`](https://github.com/ianras77/web-jogmania) | `/data/apps/2-Migrated/web-jogmania/repo` | API and shared source bind mounts resolve there; MinIO and database data remain in app-data. |
| `web-lickingvape` | [`web-lickingvape`](https://github.com/ianras77/web-lickingvape) | `/data/apps/2-Migrated/web-lickingvape` | API, web, worker builds and Cheshire Cat bootstrap mount resolve there. |
| `web-rasies` | [`web-rasies`](https://github.com/ianras77/web-rasies) | `/data/apps/2-Migrated/web-rasies` | Portal build resolves there; its existing shared media mounts remain unchanged. |
| `web-rassyapp` | [`web-rassy.app`](https://github.com/ianras77/web-rassy.app) | `/data/apps/2-Migrated/web-rassy.app` | App and Cat builds resolve there. |
| `web-rassyonline` | [`web-rassyonline`](https://github.com/ianras77/web-rassyonline) | `/data/apps/2-Migrated/web-rassyonline/apps/web` | New private repository contains the full source; web and worker builds resolve there. |
| `web-rassys` | [`web-rassy`](https://github.com/ianras77/web-rassy) | `/data/apps/2-Migrated/web-rassy` | All application and Icecast builds plus Liquidsoap config resolve there; music, photos, podcasts and reports remain mounted from their existing data locations. |
| `web-totallyrighteoustales` | [`web-totallyrighteoustales`](https://github.com/ianras77/web-totallyrighteoustales) | `/data/apps/2-Migrated/web-totallyrighteoustales` | API, web, worker builds and Cat bootstrap mount resolve there. |
| `web-usmender` | [`web-usmender`](https://github.com/ianras77/web-usmender) | `/data/apps/2-Migrated/web-usmender` | API, web, worker, Matrix appservice and Cat/Synapse source mounts resolve there. |

## Execution sequence

1. **Establish source of truth.** Compare each app-store source tree with its existing Git checkout, copy missing/current application files into the standalone checkout without deleting repository-only files, exclude generated output and live `.env` files, and create the missing Rassy Online checkout/repository. Confirm diffs are clean of whitespace errors and secrets before committing.
2. **Publish application repositories.** Validate the relevant package and service checks, commit the reconciled source on a migration branch, publish it to GitHub, and make the default branch include the published source. Do not force-push or replace unrelated history.
3. **Decouple packages.** Point every `config.json.source` at its dedicated GitHub repository. Set Compose build contexts and source-code bind mounts to the canonical `/data/apps/2-Migrated/...` paths. Remove vendored application source from the app-store package after the standalone repo is safely published. Keep package metadata, `config.json`, `docker-compose.yml`, and required package assets.
4. **Validate the store.** Check JSON and store metadata, render each Compose file with the installed app's protected environment, verify every build and source bind path exists, verify app IDs are unchanged, and confirm all persistent app-data/shared-media mounts still point to their original locations. Run the store validator after individual checks.
5. **Roll out one app at a time.** Record current Compose project and health state, update only that app in place, and verify its containers, health checks, and public endpoint. Keep databases, uploads, reports, and media untouched. If a rollout fails, restore that app's previous package Compose and image revision, then confirm the original project is healthy before proceeding.
6. **Close the migration.** Commit and publish the app-store package changes, synchronize the managed Runtipi store copy, and record the repo commit, package version, runtime health, and endpoint result for every app.

## Preservation and release gates

- Existing Runtipi IDs remain unchanged; no uninstall/reinstall or Compose project rename is part of this migration.
- Live environment files, credentials, user uploads, databases, reports, and shared media are excluded from source sync and Git staging.
- Package version and `tipi_version` increase whenever its build/source wiring changes.
- A GitHub `source` link alone is not proof of a migrated build. Acceptance requires the rendered Compose context to resolve to the canonical checkout and the running package to pass its health/endpoint checks.
- A healthy container is reported separately from a successful public page/API request.

## Progress record

- Inventory: eleven package/repository mappings identified; ten existing repositories found; Rassy Online was missing.
- Source reconciliation and GitHub publication: complete for all eleven. The ten existing private repositories have their source updates merged into their default branches (`web-lickingvape` uses `publish`); the new private `web-rassyonline` repository has its full initial source commit on `main`.
- Package cutover: all eleven source links and Compose build/source paths point at the canonical folders. Vendored source has been removed from the app-store package working tree while retaining package configuration, Compose definitions, metadata, and the BAT app-data directory.
- Remaining: commit/push the app-store changes, synchronize the managed Runtipi package copies without changing app IDs or persistent data, then rebuild and verify each Compose project one at a time. Record container health and real endpoint responses for each app.
