# Web Rassy App

Code Console is a multi-user AI coding workspace built on Next.js and Prisma. It provides a focused surface for chat, code context, memory, plugins, model settings, and user management over an existing Cheshire Cat deployment. The WebSocket chat adapter uses the official `ccat-api` client. This repository now includes .

## Deployment stance

- Secondary-node role: this app is packaged for the private Runtipi node on `192.168.1.162`.
- Primary edge remains `192.168.1.57` (`runtipi.rasies.com`).
- Recommended exposure: eligible for selective edge proxying later.

## Migration notes

- Source tree today: `/data/repos/apps/web-rassyapp`
- Recommended source repo target: `/data/repos/apps/web-rassyapp`
- Conversion strategy: `auto-with-manual-review`
- Migration complexity: `medium`
- This package now uses the host-published RassyCodex gateway instead of recreating the old external Ollama compose network.
- Cheshire Cat and Qdrant stay internal to the package by default. The main web app remains the only host-facing service.

## Data notes

- Runtipi app-data convention: migrate app-owned state into `${APP_DATA_DIR}/app-data/web-rassyapp/...`.
- Keep source code in the app repo and keep external shared media/model libraries on explicit host paths when needed.

## Port notes

- Reserve `80` and `443` on this node for Runtipi itself.
- During migration, use `3194` as the stable direct host port for the main web UI on this node.
- Database, cache, and vector-store helper services are intentionally de-published by default in generated packages to reduce collisions.

- Named volume `prisma_data` mounted to `/data`
- Named volume `cat_static` mounted to `/app/cat/static`
- Named volume `cat_plugins` mounted to `/app/cat/plugins`
- Named volume `cat_data` mounted to `/app/cat/data`
- Named volume `qdrant_storage` mounted to `/qdrant/storage`

## Edge-routing notes

- Do not let this node become the public edge by accident.
- If this app should be reachable externally later, proxy it from the primary node rather than moving edge duties here.

## Runtime notes

- Keep the RassyCodex gateway available on `host.docker.internal:8844` so `cheshire-cat-core` can resolve `rassy-smart` and `rassy-embed`.
- Keep app secrets and node-local overrides in `/data/runtipi/user-config/gpu-private-store/web-rassyapp/app.env` instead of relying on the source repo `.env`.
