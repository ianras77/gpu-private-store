# Web USMender

USMender is a mobile-first repair messenger built around a local Matrix core. Users see USMender rooms, private drafts, mediator approvals, trust controls, and mobile clients. Matrix/Synapse stays local underneath as the durable room/event substrate.

## Deployment stance

- Secondary-node role: this app is packaged for the private Runtipi node on `192.168.1.162`.
- Primary edge remains `192.168.1.57` (`runtipi.rasies.com`).
- Recommended exposure: eligible for selective edge proxying later.

## Architecture direction

- Phase 0 uses the bundled local Postgres/SSE bridge while the Matrix provider boundary is built.
- Target core: local Synapse plus a USMender Matrix appservice.
- Raw drafts stay private to USMender; only approved mediated messages enter the Matrix room.
- RAG/LLM mediation stays behind provider interfaces so local RassyMind/Cheshire Cat lanes can evolve.

## Data notes

- Runtipi app-data convention: keep app-owned state under `${APP_DATA_DIR}/app-data/web-usmender/...`.
- Keep source code in the app repo and keep external shared media/model libraries on explicit host paths when needed.

## Port notes

- Reserve `80` and `443` on this node for Runtipi itself.
- Web UI: 3294.
- API: 3295.
- Database, Matrix, cache, and vector helper services should remain internal unless a specific operational need says otherwise.

## Edge-routing notes

- Do not let this node become the public edge by accident.
- If this app should be reachable externally later, proxy it from the primary node rather than moving edge duties here.
