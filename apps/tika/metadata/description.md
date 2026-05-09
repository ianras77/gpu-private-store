# Tika

Tika is an internal service stack. with persistent supporting data services.

## Deployment stance

- Secondary-node role: this app is packaged for the private Runtipi node on `192.168.1.162`.
- Primary edge remains `192.168.1.57` (`runtipi.rasies.com`).
- Recommended exposure: internal-only by default.

## Migration notes

- Source tree today: `/data/apps/tika`
- Recommended source repo target: `/data/repos/apps/tika`
- Conversion strategy: `auto`
- Migration complexity: `low`

## Data notes

- Runtipi app-data convention: migrate app-owned state into `${APP_DATA_DIR}/app-data/tika/...`.
- Keep source code in the app repo and keep external shared media/model libraries on explicit host paths when needed.

## Port notes

- Reserve `80` and `443` on this node for Runtipi itself.
- Main web UIs should be reached through the Runtipi local domain rather than a copied legacy host port.
- Database, cache, and vector-store helper services are intentionally de-published by default in generated packages to reduce collisions.

- Named volume `ocr_data` mounted to `/var/lib/postgresql/data`

## Edge-routing notes

- Do not let this node become the public edge by accident.
- If this app should be reachable externally later, proxy it from the primary node rather than moving edge duties here.
