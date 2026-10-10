# Web app repositories and Runtipi reinstallation plan

Updated: 2026-10-10 UTC

## Goal and deployment model

Each of the eleven custom web-* applications has one full source repository under /data/apps and one dedicated GitHub repository. The Runtipi app-store entry keeps the app ID, Compose project, persistent data mounts, user configuration, and shared media wiring. The app-store entry contains only Runtipi configuration, Compose, and store metadata/assets; application source lives in the separate repository.

The configured Runtipi store currently checks out gpu-private-store on branch codex/rassys-openfang-20260926. Publish the package migration to that active branch so this Runtipi instance reads the same definitions. The package config.json source field is a repository link displayed as metadata. Runtipi pulls the app definition from the configured app-store repository; it does not clone the standalone source repository from that link. Compose builds and source binds therefore use the local GitHub checkout under /data/apps.

For a source-code release, push the app repository change to GitHub, fast-forward its matching checkout under /data/apps, then run the Runtipi app update for that installed app. For a package change, update the app-store entry, increase both version and tipi_version, run Runtipi's app-store update, then update or reinstall the app through Runtipi. This makes the division between source publication and managed deployment explicit.

## Web app map

| Runtipi app ID | GitHub repository | Canonical source folder | Existing Compose project | Source wiring to preserve |
| --- | --- | --- | --- | --- |
| web-astro:gpu-private-store | [web-astrology](https://github.com/ianras77/web-astrology) | /data/apps/web-astrology | web-astro_gpu-private-store | Six app/API builds; Astro Postgres, Redis, Qdrant, index data, and shared esoterica mounts |
| web-bat:gpu-private-store | [web-bat](https://github.com/ianras77/web-bat) | /data/apps/web-bat/blondesagainsttrump | web-bat | API, Mastra, social publisher, and web builds; preserve Postgres/Qdrant data and SQL initialization mounts |
| web-crackstack:gpu-private-store | [web-crack](https://github.com/ianras77/web-crack) | /data/apps/web-crack | web-crackstack_gpu-private-store | Backend, TAPECRACK, and XLCRACK builds; preserve Postgres, Redis, MinIO, and Temporal state |
| web-jogmania:gpu-private-store | [web-jogmania](https://github.com/ianras77/web-jogmania) | /data/apps/web-jogmania/repo | web-jogmania_gpu-private-store | API and web source bind mounts; preserve Postgres and MinIO data |
| web-lickingvape:gpu-private-store | [web-lickingvape](https://github.com/ianras77/web-lickingvape) | /data/apps/web-lickingvape | web-lickingvape_gpu-private-store | API, web, and worker builds; preserve Postgres and Cheshire Cat data |
| web-rasies:gpu-private-store | [web-rasies](https://github.com/ianras77/web-rasies) | /data/apps/web-rasies | web-rasies_gpu-private-store | Portal build; preserve Mastra state and podcast, thoughts, DJ, and music mounts |
| web-rassyapp:gpu-private-store | [web-rassy.app](https://github.com/ianras77/web-rassy.app) | /data/apps/web-rassy.app | web-rassyapp_gpu-private-store | Main app and Cheshire Cat builds; preserve Postgres, Qdrant, plugin, and cat data |
| web-rassyonline:gpu-private-store | [web-rassyonline](https://github.com/ianras77/web-rassyonline) | /data/apps/web-rassyonline | web-rassyonline_gpu-private-store | Web and worker builds; preserve accounts, uploads, artifacts, fixture/workspace data, Postgres, and Qdrant |
| web-rassys:gpu-private-store | [web-rassy](https://github.com/ianras77/web-rassy) | /data/apps/web-rassy | web-rassys_gpu-private-store | Five builds including web, intelligence, radio, Minecraft, and Icecast; preserve Postgres, Redis, reports, shared media, and Liquidsoap config |
| web-totallyrighteoustales:gpu-private-store | [web-totallyrighteoustales](https://github.com/ianras77/web-totallyrighteoustales) | /data/apps/web-totallyrighteoustales | web-totallyrighteoustales_gpu-private-store | API, web, and worker builds; preserve Postgres and Cheshire Cat data |
| web-usmender:gpu-private-store | [web-usmender](https://github.com/ianras77/web-usmender) | /data/apps/web-usmender | web-usmender_gpu-private-store | API, web, worker, and Matrix appservice builds; preserve Postgres, Matrix, appservice, and both cat data stores |

Every app keeps the existing Runtipi ID, Compose project, host port, app-data target, and shared media target. The package version and tipi_version must both advance when the new source wiring is published.

## Current app-store package versions

| App | Package version | tipi_version |
| --- | ---: | ---: |
| web-astro | 1.1.2 | 7 |
| web-bat | 2.0.2 | 31 |
| web-crackstack | 1.0.8 | 9 |
| web-jogmania | 1.1.5 | 16 |
| web-lickingvape | 1.0.9 | 9 |
| web-rasies | 1.0.11 | 12 |
| web-rassyapp | v1.14.10 | 13 |
| web-rassyonline | 0.1.10 | 6 |
| web-rassys | 1.0.33 | 27 |
| web-totallyrighteoustales | 0.5.6 | 11 |
| web-usmender | 24 | 9 |

The BAT package retains the live Mastra service. All four BAT build services explicitly use pull_policy: build; no service is removed or renamed as part of this source move.

## Live persistent bind sources and clean-install destinations

Observed from Docker bind mounts on 2026-10-10. These live paths, rather than the app name or generated app.env alone, define the current data. The intended clean install target is the app-specific Runtipi root `/data/runtipi/app-data/gpu-private-store/<app>/` plus the same volume suffix already in that app's Compose definition. Before starting a reinstalled app, prove that each Compose bind resolves to the preserved data.

| App | Current persistent bind sources | Migration handling |
| --- | --- | --- |
| web-astro | `/data/runtipi/app-data/gpu-private-store/web-astro/app-data/web-astro/named/{astro-index,astro-postgres,astro-redis,astro-qdrant}` | Already under its per-app root; retain the source through reinstall and verify exact paths. |
| web-bat | `/app-data/web-bat/named/{bat-postgres-data,bat-qdrant-data}` | Offline archive while stopped; place into the new app-specific Runtipi root before first start. |
| web-crackstack | `/app-data/web-crackstack/named/{crackstack-backend,crackstack-minio,crackstack-postgres}` | Offline archive while stopped; restore all three into the new app-specific root before first start. |
| web-jogmania | `/app-data/web-jogmania/named/{jogmania-minio,jogmania-pg}` | Offline archive while stopped; restore both into the new app-specific root before first start. |
| web-lickingvape | `/app-data/web-lickingvape/named/{lickingvape-cat-data,lickingvape-postgres}` | Offline archive while stopped; restore both into the new app-specific root before first start. |
| web-rasies | `/data/runtipi/app-data/gpu-private-store/app-data/web-rasies/named/mastra` | Move from store-level app-data into the per-app root and preserve the Mastra state. |
| web-rassyapp | `/app-data/web-rassyapp/named/{prisma-data,cat-data,cat-plugins,cat-static,qdrant-storage}` | Offline archive while stopped; restore all five into the new app-specific root before first start. |
| web-rassyonline | `/data/runtipi/app-data/gpu-private-store/web-rassyonline/app-data/web-rassyonline/{artifacts,project-fix-fixtures,project-fix-workspaces,uploads,postgres,qdrant}` | Already under its per-app root; preserve the full tree and verify each target. |
| web-rassys | `/data/runtipi/app-data/gpu-private-store/web-rassys/app-data/web-rassys/named/{pg-data,redis-data}` | Already under its per-app root; retain and verify. Preserve OpenFang reports at `/data/apps/openfang/reports/{analyst-rassy,system-integration}` and `/mnt/cannonball` separately. |
| web-totallyrighteoustales | `/app-data/web-totallyrighteoustales/named/{trt-cat-data,trt-postgres}` | Offline archive while stopped; restore both into the new app-specific root before first start. |
| web-usmender | `/app-data/web-usmender/named/{cat-primary-data,cat-support-data}` and `/data/runtipi/app-data/gpu-private-store/web-usmender/app-data/web-usmender/named/{matrix-appservice-data,matrix-data,postgres-data}` | Offline archive Cat state while stopped; preserve existing Runtipi-root Matrix/Postgres state and verify all five targets. |

Shared media mounts remain at `/data/runtipi/media/data` and are not part of these app-data copies. Source-code binds currently served from `/data/runtipi/apps/gpu-private-store/<app>/repo` move to the mapped `/data/apps` Git checkout. `/app-data` volumes are outside Runtipi's normal `app-data/<store>/<app>` folder and are not protected by assuming the standard Runtipi backup covers them.

Runtipi's backup archive includes the installed app definition as well as `app-data/` and `user-config/`. Restoring the whole archive after reinstall can put the old vendored app definition back. Keep the archive intact as rollback evidence; on the migration path restore persistent data and protected user configuration while ensuring the installed definition remains the newly published store package. Verify the installed package SHA/version again after any restore.

## Existing /data/apps inventory

These top-level product folders are already standalone Git repositories and remain independent projects: aider, opencode, mc_troupe, nextcloud, openfang, plex, qwencode, rassymind, and web-closepeeps. Their existing branches and local edits are preserved. In particular, dirty local work in Nextcloud, Qwen Code, RassyMind, and ClosePeeps is not staged or reset by this web-app migration.

The /data/apps/hermes folder is an integration/release-candidate workspace, not the Hermes source checkout; its README identifies /opt/rassy-hermes as the protected source deployment and the rassy-hermes GitHub repository as that source. /data/apps/gpu-private-store is a managed app-store mirror, not a product repository. .github, .pytest_cache, and the old reference directories 1-WIP and 2-Migrated are not application source checkouts. Do not use either old reference folder in new Compose paths or source-sync commands.

## Implementation stages and gates

### 1. Verify source repositories

For each mapped repository:

- Confirm the folder is a Git root with the intended origin, private/public visibility, default branch, and no unexpected staged or untracked files.
- Confirm the published GitHub branch contains the complete current source snapshot. Keep real .env files, protected credentials, generated output, runtime databases, uploads, and host media out of commits.
- Remove operational defaults that still point at 1-WIP, 2-Migrated, or an app-store source mirror. Historical audit notes may describe the old layout, but must be labeled historical.
- Ensure every source bind path in the app-store Compose exists in the canonical repository. Keep empty-but-required bind directories represented by a tracked .gitkeep.

### 2. Publish and validate the app-store package

- Set each source link to its matching standalone GitHub repository.
- Point every build context and app-source bind at the mapped /data/apps checkout. Jogmania remains bind-mounted from its repository layout; its appdata and media mounts are separate.
- Keep only config.json, docker-compose.yml, and metadata/ in each store package. Do not publish private app source in the store repository.
- Confirm app IDs, service names, port assignments, healthchecks, Compose project naming, app-data targets, shared media sources, and secret variable names are unchanged.
- Render every Compose file with its installed app environment without printing values. Verify all build contexts and source bind files exist; compare app-data and media mounts against the current package.
- Run the store package validator and inspect the complete package diff before publishing to the active custom-store branch.

### 3. Synchronize Runtipi's store

- Push the reviewed app-store commit to codex/rassys-openfang-20260926, the branch currently checked out for the configured gpu-private-store.
- Update the configured store from Runtipi and confirm the eleven package definitions and links match the published commit.
- Confirm Runtipi has recognized each higher version and tipi_version before uninstalling anything.

### 4. Baseline and back up each installed app

Handle one app at a time. Before its uninstall:

1. Record whether the app is running, its full Compose project and service names, container health, current host port/domain, and actual bind sources from Docker labels/inspection.
2. Record the exact app-data path and all app-specific user-config files without printing their contents. Confirm shared media is mounted from /data/runtipi/media and is not included in app deletion.
3. Create a Runtipi backup with runtipi-cli app backup <app-id>:gpu-private-store; verify the backup is listed and non-empty.
4. Stop only this app, then make an offline archive of every actual persistent bind source from Docker inspection, including off-root `/app-data` paths. Record each archive size and checksum, preserve ownership/permissions, and verify the archive listing. Keep shared media out of app-data archives. Do not proceed if any source is missing, unreadable, or cannot be inspected.
5. Record current database/service health and a reachable app endpoint so the reinstall has a real before/after comparison.

Never infer the data path from an app name alone: read the running Compose bind source first. Runtipi's uninstall removes app data, so the backup check is a hard gate before every uninstall.

### 5. Uninstall, reinstall, and restore one app

For the app whose backups passed:

1. Use Runtipi to uninstall the namespaced app ID. Do not remove shared media or the source checkout.
2. Install the same package again from the configured gpu-private-store app store branch, keeping its app ID, port, and exposure choices.
3. Reconcile the verified backup into the new install. Preserve its protected user-config files and persistent data, but keep the newly published app definition; do not blindly restore the archive's older `app/` directory. Place any off-root data copy at the exact newly rendered Compose source before starting services.
4. Start the app, then confirm the generated Compose project name and every build/source bind point at that app's /data/apps repository.
5. Verify persistent services can read the original data, all expected healthchecks are healthy, the prior host port/domain responds, and the app's primary user flow returns a meaningful response.
6. Compare rendered pages/API responses and external routing to the pre-uninstall baseline. Record the app version, source Git commit, package Git commit, service health, and endpoint result.
7. Do not begin the next app until the current app passes. If it fails, stop the app, restore its prior package revision and verified backup, and prove the old endpoint is back before continuing.

The CLI exposes backup, uninstall, restore, and update commands but no install command. Reinstallation is performed from the Runtipi app-store UI using the same installed store and app ID.

### 6. Rollout order

Roll out in this order, with the per-app backup and acceptance gates above applied to each:

1. web-rasies — one portal service and media mounts.
2. web-jogmania — two source-mounted application services plus Postgres and MinIO.
3. web-crackstack — backend/web builds and Postgres, Redis, MinIO, Temporal persistence.
4. web-lickingvape — API/web/worker and Cheshire Cat/Postgres state.
5. web-totallyrighteoustales — API/web/worker and Cat/Postgres state.
6. web-rassyapp — app/Cat builds and vector, plugin, and database state.
7. web-astro — six image builds and four data services.
8. web-usmender — Matrix, appservice, Postgres, Cat, and worker data.
9. web-rassyonline — accounts, uploaded files, artifacts, workspace fixtures, Postgres, and Qdrant.
10. web-bat — preserve the current API, Mastra scheduler, social publisher, web UI, Postgres, and Qdrant.
11. web-rassys — perform last because it combines the radio, live media, Minecraft bridge, databases, reports, and multiple shared host mounts.

This order is a scheduling aid only; an app still waits for its own backup and health gates.

### 7. Close-out

- Verify all eleven source checkouts are clean and match their published GitHub commits.
- Verify all eleven app-store packages contain only their Runtipi manifest, Compose, and metadata/assets.
- Verify every source link, build context, and source mount maps to the correct GitHub repository and /data/apps folder.
- Verify Runtipi has the same eleven installed IDs and Compose project names, with their original app-data and media mounts intact.
- Record each verified backup artifact, repository SHA, app-store SHA, package version, service health, and endpoint result.
- Leave 1-WIP and 2-Migrated as read-only historical references; no live Runtipi package points to them.

## Rollout record

Package/source separation is in progress. All eleven dedicated source repositories have been created or reconciled under /data/apps and pushed to their GitHub repositories. App-store package links, build paths, backup artifacts, reinstalls, and live endpoint checks remain gated by the implementation stages above.
