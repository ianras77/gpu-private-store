# Ian's Runtipi app store

This public Runtipi app store contains eleven app definitions. Application source stays in a separate GitHub repository for each app; every `config.json` `source` field points to that repository. The app source repositories are private, so another Runtipi server also needs authorized read access to them.

## Apps and source repositories

| Runtipi app ID | Standalone source repository | Checkout on the Docker host | Branch |
| --- | --- | --- | --- |
| `web-astro` | [web-astrology](https://github.com/ianras77/web-astrology) | `/data/apps/web-astrology` | `main` |
| `web-bat` | [web-bat](https://github.com/ianras77/web-bat) | `/data/apps/web-bat` | `main` |
| `web-crackstack` | [web-crack](https://github.com/ianras77/web-crack) | `/data/apps/web-crack` | `main` |
| `web-jogmania` | [web-jogmania](https://github.com/ianras77/web-jogmania) | `/data/apps/web-jogmania` | `main` |
| `web-lickingvape` | [web-lickingvape](https://github.com/ianras77/web-lickingvape) | `/data/apps/web-lickingvape` | `publish` |
| `web-rasies` | [web-rasies](https://github.com/ianras77/web-rasies) | `/data/apps/web-rasies` | `main` |
| `web-rassyapp` | [web-rassy.app](https://github.com/ianras77/web-rassy.app) | `/data/apps/web-rassy.app` | `main` |
| `web-rassyonline` | [web-rassyonline](https://github.com/ianras77/web-rassyonline) | `/data/apps/web-rassyonline` | `main` |
| `web-rassys` | [web-rassy](https://github.com/ianras77/web-rassy) | `/data/apps/web-rassy` | `main` |
| `web-totallyrighteoustales` | [web-totallyrighteoustales](https://github.com/ianras77/web-totallyrighteoustales) | `/data/apps/web-totallyrighteoustales` | `main` |
| `web-usmender` | [web-usmender](https://github.com/ianras77/web-usmender) | `/data/apps/web-usmender` | `main` |

The app-store repository is [gpu-private-store](https://github.com/ianras77/gpu-private-store), branch `main`. The app repositories are private; the app store contains no GitHub credentials.

## Separate source repo awaiting its Runtipi release

[`web-closepeeps`](https://github.com/ianras77/web-closepeeps) is also maintained as an independent private source repository. Its current source is not yet a Runtipi package: the repository's release gate still lacks A06-A09 proof and required staging, restore, security, simulator, and device evidence. Keep it out of the installable catalog until those gates pass; the source checklist explicitly does not authorize a live beta deployment yet.

## Install on another Runtipi server

1. Give the server's operator account read access to the private source repositories. Authenticate GitHub on the host with `gh auth login` and configure Git with `gh auth setup-git`, or use an approved SSH deploy-key setup. Keep credentials on that server, outside this repository and app configuration.
2. Clone each repository from the table into its exact `/data/apps` path. Use the listed branch; `web-lickingvape` uses `publish`.
3. Mount the host's `/data/apps` directory read-only into the Runtipi container at `/host-apps`. The app Compose files build from `/host-apps/<repository-folder>`. Their `/data/apps/...` bind mounts are resolved by Docker on the host and must also exist there.
4. Add `https://github.com/ianras77/gpu-private-store` as a Runtipi app store on branch `main`, then install the desired app from that store. Configure each server's own protected app settings and domains in Runtipi.

The `source` field in Runtipi's app metadata is the GitHub repository link shown with the app. Runtipi obtains app definitions from this store; it does not automatically clone a private source repository from that link. Keep the local `/data/apps` checkout current before rebuilding an app.

## Update flow

- For an application-code change, commit and push to that app's repository, fast-forward the matching `/data/apps` checkout on the target server, then use Runtipi to update/rebuild the installed app.
- For a Runtipi package change, edit the app's definition in `apps/<id>`, increment `tipi_version` (and the app `version` when the shipped app release changes), validate the store, push to `main`, refresh the store in Runtipi, then update the installed app.
- Keep user configuration, databases, uploads, and shared media in their protected per-server storage. They do not belong in these source repositories.

See [the migration and operations plan](WEB_APP_REPOSITORY_MIGRATION_PLAN.md) for app-by-app storage details and rollout gates.
