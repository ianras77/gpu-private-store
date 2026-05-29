# Crewai

Crewai is packaged here as an internal JupyterHub workbench for agent, notebook, and RAG-style experimentation.

## Deployment stance

- Secondary-node role: this app is packaged for the private Runtipi node on `192.168.1.162`.
- Primary edge remains `192.168.1.57` (`runtipi.rasies.com`).
- Recommended exposure: internal-only by default.

## Migration notes

- Source tree today: `/data/apps/crewai`
- Recommended source repo target: `/data/repos/apps/crewai`
- Conversion strategy: `converted with preserved external dependencies`
- Migration complexity: `medium`

## Data notes

- Runtipi app-data convention: migrate app-owned state into `${APP_DATA_DIR}/app-data/crewai/...`.
- Keep source code in the app repo and keep external shared media/model libraries on explicit host paths when needed.
- The current package stores JupyterHub state, workspace content, outputs, and Qdrant data under app-data.
- Source-controlled JupyterHub helper files are mounted from this local app package at runtime.

## Port notes

- Reserve `80` and `443` on this node for Runtipi itself.
- Main web UIs should be reached through the Runtipi local domain rather than a copied legacy host port.
- Database, cache, and vector-store helper services are intentionally de-published by default in generated packages to reduce collisions.

- Main host port: `3215`

## Edge-routing notes

- Do not let this node become the public edge by accident.
- If this app should be reachable externally later, proxy it from the primary node rather than moving edge duties here.

## Runtime notes

- The Docker socket is intentionally preserved because Crewai/Jupyter workflows may use Docker-backed tools from inside the workbench.
- The model layer currently targets the existing RassyGPT gateway using stable alias names:
  - `rassy-smart`
  - `rassy-embed`
  - `rassy-rerank`
  - `rassy-image`
