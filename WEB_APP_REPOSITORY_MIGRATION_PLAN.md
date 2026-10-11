# Web app repository and Runtipi migration record

Updated: 2026-10-11 UTC
Status: migration, package alignment, first-server rollout, and final verification complete on 2026-10-11 UTC.

## Outcome and deployment model

The eleven custom `web-*` applications have full source checkouts under `/data/apps`, each connected to its own GitHub repository. The public Runtipi store is [ianras77/gpu-private-store](https://github.com/ianras77/gpu-private-store), branch `main`. Its packages contain Runtipi manifests, Compose wiring, and store metadata; application source remains in the individual (private) repositories.

Each package's `source` field links to the matching application repository. Runtipi installs package definitions from the configured app store; the `source` link is repository metadata, not an instruction for Runtipi to clone source. The Compose client sees read-only source checkouts under `/host-apps/<repo-folder>`, while Docker host bind mounts use `/data/apps/<repo-folder>/...`.

For a source release, push the source repo, synchronize its checkout at `/data/apps`, and update the installed Runtipi app. For package changes, bump both `version` and `tipi_version`, publish the store change, run the Runtipi app-store update, and update the installed app. These are separate releases and must be recorded separately.

### Use this store on another Runtipi server

1. Add `https://github.com/ianras77/gpu-private-store` as the custom app store and update the store index.
2. Before installing an app, give that server read access to its private source repository and clone the repository into the exact `/data/apps` path in the table below. BAT and Jogmania have their Git roots one directory below their app folder.
3. Configure the Runtipi host's Compose source mount so the Runtipi container can read each checkout under `/host-apps/<repo-folder>`. The store Compose files use those source mounts for builds and keep app data/media as separate host mounts.
4. Install the app from the custom store. Preserve any chosen ports/domains and configure that server's own secrets and app-data. Do not copy this server's credentials or databases to another server.

The source repositories are private, so a second server needs its own GitHub deploy key or equivalent read-only Git credential. The custom store itself is public.

## App and repository map

The registry row IDs are Runtipi's current internal IDs after reinstall; the stable installed identity is the `app:gpu-private-store` URN. Source commits below were verified as clean local Git checkouts after publishing.

| Runtipi app | GitHub repository | `/data/apps` Git root | Source commit | Package `version` / `tipi_version` | Port | Registry row |
| --- | --- | --- | --- | --- | ---: | ---: |
| `web-astro` | [web-astrology](https://github.com/ianras77/web-astrology) | `/data/apps/web-astrology` | `281c0d395e44` | `1.1.5` / 11 | 3201 | 74 |
| `web-bat` | [web-bat](https://github.com/ianras77/web-bat) | `/data/apps/web-bat` (`blondesagainsttrump/` source) | `01d83bde3cf8` | `2.0.7` / 37 | 3197 | 77 |
| `web-crackstack` | [web-crack](https://github.com/ianras77/web-crack) | `/data/apps/web-crack` | `27d1da26b31f` | `1.0.13` / 14 | 3212 | 70 |
| `web-jogmania` | [web-jogmania](https://github.com/ianras77/web-jogmania) | `/data/apps/web-jogmania` (`repo/` source) | `103ad8d62ff3` | `1.1.10` / 26 | 3177 | 69 |
| `web-lickingvape` | [web-lickingvape](https://github.com/ianras77/web-lickingvape) | `/data/apps/web-lickingvape` | `9ebb45f5c9f6` | `1.0.13` / 13 | 3195 | 71 |
| `web-rasies` | [web-rasies](https://github.com/ianras77/web-rasies) | `/data/apps/web-rasies` | `2d3076059468` | `1.0.14` / 16 | 3186 | 66 |
| `web-rassyapp` | [web-rassy.app](https://github.com/ianras77/web-rassy.app) | `/data/apps/web-rassy.app` | `d15bd6559476` | `v1.14.12` / 16 | 3194 | 73 |
| `web-rassyonline` | [web-rassyonline](https://github.com/ianras77/web-rassyonline) | `/data/apps/web-rassyonline` | `d14e536c938d` | `0.1.17` / 14 | 3199 | 75 |
| `web-rassys` | [web-rassy](https://github.com/ianras77/web-rassy) | `/data/apps/web-rassy` | `d695a3672433` | `1.0.42` / 36 | 3187 | 78 |
| `web-totallyrighteoustales` | [web-totallyrighteoustales](https://github.com/ianras77/web-totallyrighteoustales) | `/data/apps/web-totallyrighteoustales` | `6ed50a5b41aa` | `0.5.10` / 15 | 3190 | 72 |
| `web-usmender` | [web-usmender](https://github.com/ianras77/web-usmender) | `/data/apps/web-usmender` | `d6a4db6d0b9b` | `27` / 13 | 3294 | 65 |

The source package manifests were synchronized with their current store package revisions where those repositories carry a `config.json`. Source working trees were clean at final source audit. The store `source` mappings were checked against all eleven repositories.

## Runtipi deployment and acceptance

Each of the eleven Runtipi apps was backed up, uninstalled, and reinstalled from `gpu-private-store` with the original URN, host port, persistent data, user configuration, and shared media preserved. All registry rows report `running`; their package versions, ports, URNs, and row IDs are in the table above. The Runtipi-generated definitions use the published package revisions listed above.

All eleven homepage ports returned HTTP 200 after rollout. Additional checks returned HTTP 200 for Jogmania API `/healthz` on 3178, BAT API `/api/v1/health/live` on 8017, Tales API `/health` on 3191, and Rassys Icecast on 3188. Defined container healthchecks were healthy; auxiliary services without healthchecks were confirmed running. The final post-update verification is recorded below.

The latest package versions above include release-provenance labels on every locally built image, tied to the source commit shown in the table. Jogmania's four host-mounted application services carry the same source revision in their container labels.

Mastra is the current architecture in BAT, Jogmania, Rasies, Rassys, and Rassy Online. LickingVape, Rassyapp, Totally Righteous Tales, and Usmender still run Cheshire Cat in their current source and package configuration; those Cat services match the current GitHub source and were not replaced by an uncommitted migration. Astro's source documents a separately gated Mastra migration and its current package does not claim to have completed it.

Two package-specific corrections were required during rollout:

- BAT package 2.0.7 / T37 sets host networking for the four source builds, so package builds can reach dependencies on the Docker host.
- Jogmania package 1.1.10 / T26 keeps its dependency service alive and healthy, and makes application services wait for that healthy dependency. This prevents the Runtipi status reconciler from treating a completed one-shot dependency container as a stopped app.

Jogmania's supported Runtipi updater completed successfully after T26 publication. Its active app package is 1.1.10 / T26 and it is running on the original port. Runtipi may retain an older historical `template_version` registry field after package updates; the active package files and running services were checked directly instead of editing that internal field.

Rassys had an invalid pre-migration registry row without a template URN/version. Reinstall corrected it to `web-rassys:gpu-private-store`, running on port 3187, row 78. Its package is now 1.0.42 / T36. Postgres, Redis, radio, Icecast, Liquidsoap, Minecraft bridge, reports, survey routes, and shared media binds were restored and verified. Survey collection remains deliberately disabled until its privacy, database-role, persistence, backup/restore, retention, and operator-readiness gates are satisfied.

## Persistent data and protected rollback archives

Every app was snapshotted before uninstall. The archives are under `/data/runtipi/backups/web-app-migration-20261010/`, are mode `0600`, and have the following SHA-256 checksums. Retain these until the normal backup retention policy has safely superseded them.

| App | Snapshot artifact | SHA-256 |
| --- | --- | --- |
| Astro | `web-astro-reinstall-pre-uninstall-20261011.tar.gz` | `7c5fe92866217f8a7441f1eb3322def4c0f6e0bbb5c43abcfb1b5ac5a409923a` |
| BAT | `web-bat-reinstall-pre-uninstall-20261011.tar.gz` | `47b349659a7b53911e19c2795547c598d82a08dc18dd19771441c941bfbaa494` |
| Crackstack | `web-crackstack-reinstall-pre-uninstall-20261011.tar.gz` | `0ea4d8ceb7931357320e4ec3b4717e183904b499f3c55528c50536d3779fd69d` |
| Jogmania | `web-jogmania-reinstall-pre-uninstall-20261011.tar.gz` | `f8146d41cd288e3cbc33b3a355a726296d4ded65a95e12eef9b60bd41f6f9211` |
| LickingVape | `web-lickingvape-reinstall-pre-uninstall-20261011.tar.gz` | `2f43880835743dc8d0d522f466d3292aca5e6eacec8a61a06eab1d7ec7d68e9a` |
| Rasies | `web-rasies-reinstall-pre-uninstall-20261011.tar.gz` | `a76f4fdbad875046aef00982bb121539845c3f3cf76aad9d2e8e9317a27c38e7` |
| Rassyapp | `web-rassyapp-reinstall-pre-uninstall-20261011.tar.gz` | `df402f30723ae9ddd267874ac589dc3ad6aa19774288d33d717767c5b0d11602` |
| RassyOnline | `web-rassyonline-reinstall-pre-uninstall-20261011.tar.gz` | `b3f7cac0c6332df244740224df98374d86103d2c7052e2cf4adcb708b97ccde6` |
| Rassys | `web-rassys-final-pre-uninstall-20261011.tar.gz` | `cb562b85d2c9ac509d827a1ce0c86f7a02b19d5970da4b9e720ec5c368223938` |
| Totally Righteous Tales | `web-totallyrighteoustales-reinstall-pre-uninstall-20261011.tar.gz` | `4eedd16f654defff0a6e921b2fbd48c6de8839751b8005879b7fbff8c5bc2b69` |
| Usmender | `web-usmender-reinstall-pre-uninstall-20261011.tar.gz` | `9b604c969d8128b7f8ef90045a406152a248c2d6da5559c6eba8edcd6a5f42b6` |

The active app-data roots are now namespaced at `/data/runtipi/app-data/gpu-private-store/<app>/`. Shared media remains under `/data/runtipi/media/data/`. Rassys OpenFang report mounts remain on their existing shared host paths. No shared media was deleted or copied into an app snapshot.

## Cleanup and preserved projects

Inactive legacy data roots (`web-astro`, `web-rassyonline`, `blondesagainsttrump`, and the old `app-data/web-rassys`) were verified absent from current container binds, archived, then removed. The protected archive is `legacy-app-data-roots-pre-cleanup-20261011.tar.gz`, SHA-256 `b4b81f1d0cd56640a854e23d419d9e2edb730f89a0fdd7670618cae242b51e86`. Superseded per-app `app.env` backups were archived before removal in `web-app-env-backups-pre-cleanup-20261011.tar.gz`, SHA-256 `493170c4413f7c7c0ce6a4aaee37bf9645b523b359fdbab20377639eb89aefe5`. Both archives are mode `0600`.

Four restore-generated directories for Tales and Usmender were removed after checksum dry-runs proved their file contents exactly matched the live directories. Temporary install JSON files containing protected configuration were deleted. `/data/runtipi/app-data/gpt`, shared media, the old `1-WIP` and `2-Migrated` references, and unrelated application data were preserved.

Core `/data/apps` repository audit: `rassymind`, `hermes`, `openfang`, `qwencode`, `opencode`, `aider`, `mc_troupe`, `nextcloud`, and `plex` already have independent Git repositories/remotes. Hermes was consolidated into the clean `ianras77/rassy-hermes` checkout at `/data/apps/hermes` and its live runtime stayed at `/opt/rassy-hermes`; the pre-consolidation workspace is archived as `hermes-integration-workspace-pre-repository-20261011.tar.gz` (SHA-256 `bf0c427e0d15742e52bf62542992bfb87c058d2ee8544768e60247f9949f5e47`). Existing unrelated local changes in RassyMind, OpenFang, Qwen Code, Nextcloud, and ClosePeeps were preserved and not bundled into this web-app migration.

## Final verification record

- `./scripts/validate-store.sh`: passed.
- Store package/source mapping: all eleven `source` links match the standalone repositories.
- Source checkouts: all eleven deployed Git roots plus the separate ClosePeeps Git root are clean, and each local HEAD equals the GitHub default-branch HEAD.
- Store package files: all eleven installed `config.json` and `docker-compose.yml` files match this store checkout.
- Live images: all 32 app-built images carry the exact source revision from their GitHub repository; Jogmania's four source-mounted app services carry the same revision. Astro is live on 1.1.5 and the unused 1.1.4 tag aliases were removed.
- Runtipi: all eleven app stacks are running, with all defined healthchecks healthy; app web roots returned HTTP 200 on their configured local ports.
- Public routes: Rassys health reports source `d695a3672433`; Rassy Online health reports source `d14e536c938d`; BAT, Rassys Reports/What We Carry, and Rassy Online pages returned HTTP 200.
- ClosePeeps: its source is current in its own GitHub repository, but it is intentionally not a Runtipi package or live web app. Its own release checklist still blocks live deployment on uncompleted production readiness and restore gates.
- Tests: not run (not requested).

The user-visible repository and deployment split is complete: GitHub source repos hold app source, `gpu-private-store` holds Runtipi package configuration, and Runtipi manages installs/updates while retaining app data and shared media on the server.
