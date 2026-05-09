# Web Usmender

This app was brought to minimum compliance baselines for Dockerized operations. | Service | Port | Purpose | Health | |---|---:|---|---| | web | 3294 | Primary web UI | / | | api | 3295 | Backend API | /healthz | | db | 3297 | Postgres | - | npm install npm run dev docker compose up -d --build The default stack is self.

## Deployment stance

- Secondary-node role: this app is packaged for the private Runtipi node on `192.168.1.162`.
- Primary edge remains `192.168.1.57` (`runtipi.rasies.com`).
- Recommended exposure: eligible for selective edge proxying later.

## Migration notes

- Source tree today: `/data/apps/web-usmender`
- Recommended source repo target: `/data/repos/apps/web-usmender`
- Conversion strategy: `auto`
- Migration complexity: `medium`

## Data notes

- Runtipi app-data convention: migrate app-owned state into `${APP_DATA_DIR}/app-data/web-usmender/...`.
- Keep source code in the app repo and keep external shared media/model libraries on explicit host paths when needed.

## Port notes

- Reserve `80` and `443` on this node for Runtipi itself.
- Main web UIs should be reached through the Runtipi local domain rather than a copied legacy host port.
- Database, cache, and vector-store helper services are intentionally de-published by default in generated packages to reduce collisions.

- Named volume `postgres_data` mounted to `/var/lib/postgresql/data`

## Edge-routing notes

- Do not let this node become the public edge by accident.
- If this app should be reachable externally later, proxy it from the primary node rather than moving edge duties here.
