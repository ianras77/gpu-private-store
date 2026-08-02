# BlondesAgainstTrump Draft Platform

Containerized draft implementation of `BlondesAgainstTrump.com` with:

- Next.js public and admin surfaces
- FastAPI orchestration API
- Background worker for ingestion/trend/draft jobs
- Explicit Cat role chain (`researcher -> analyst -> writer -> queen`) on hourly cadence
- PostgreSQL + Qdrant data layer
- Cheshire Cat integration adapter
- SearXNG ingestion connector
- Social publisher service with dry-run mode
- Runtime control plane for direct publish, research directives, analysis directives, and voice directives

## Satire and safety

This project is designed for satirical commentary, not fabricated reporting.

- Public pages include satire/commentary disclosure.
- Editorial objects track source links and IDs.
- Manual review is enabled by default before publishing.

## Quick start

1. Copy env file:

```bash
cp .env.example .env
```

Leave `NEXT_PUBLIC_API_BASE_URL` blank unless you intentionally want the browser to
talk to a separate API host. The default same-origin proxy is the safest option
for rebuilt stacks.

2. Build and start:

```bash
docker compose up -d --build
```

3. Services:

- Web: `http://localhost:3197`
- API docs: `http://localhost:8017/docs`
- Social publisher: `http://localhost:8117/docs`
- Qdrant: `http://localhost:6337`
- Cheshire Cat: `http://localhost:1866`

Cheshire Cat now auto-selects the host RassyMind gateway through Docker host-gateway DNS on startup:
- chat/general: `rassy-smart` via `http://host.docker.internal:8844`
- embeddings: `rassy-embed` via `http://host.docker.internal:8844`

The local compose stack is wired around RassyMind and Qdrant-backed Cheshire Cat memory:
- the direct writer path uses `rassy-smart` at `/api/chat`
- readiness verifies that `rassy-smart` can answer through the current gateway route, not only that the alias is listed
- embeddings and Cat memory use `rassy-embed` at `/api/embed` for batched vectors

`CAT_PRIMARY_ENABLED=false` remains the default so long-form publication quality continues to come from the stronger direct writer stack, while Cheshire Cat stays live and testable as an integrated sidecar.

## Core folders

- `apps/web`: Next.js app (public + admin)
- `apps/api`: FastAPI API + workers
- `apps/social-publisher`: isolated social posting adapter
- `infra/sql`: schema + seed data
- `docs`: architecture and operational docs

## Manual review workflow

1. Trigger ingestion via admin or `POST /api/v1/sources/ingest`.
2. Generate drafts via `POST /api/v1/editorial/generate` and `POST /api/v1/homepage/generate`.
3. Review/approve in admin UI or API approve endpoints.
4. Publish approved stories/homepage/social posts.

## Direct publish workflow (no draft hold)

1. Open `/admin/settings` and enable `Direct publish`.
2. Set `Research directive`, `Analysis directive`, `Voice blueprint`, and `Live vibe`.
3. Run one full cycle now with `POST /api/v1/admin/pipeline/run-now` or the admin button.
4. Use `POST /api/v1/social/live` for immediate short-form responses.

Key publish-first endpoints:

- `POST /api/v1/editorial/generate-and-publish`
- `POST /api/v1/homepage/generate-and-publish`
- `POST /api/v1/social/live`

## Worker cadence and role stages

- Worker loop interval defaults to `WORKER_CYCLE_MINUTES=15`; worker and manual admin runs share a Redis lock so only one editorial cycle runs at a time.
- `Researcher` ingests search results, embeds chunks, and refreshes themes.
- `Researcher` follows a directed query plan (runtime directive + active themes + default pack) and can ingest X results.
- `Analyst` turns live source signal into persisted analysis briefs, tone lanes, story targets, and link-role guidance.
- `Writer` creates lead/theme/editorial layout outputs with persistent voice memory injected.
- `Queen` curates links, generates X variants, and can dispatch live posts.
- Analysis telemetry is available at `GET /api/v1/analysis`; full cycle telemetry remains at `GET /api/v1/admin/pipeline`.
- The admin desk now exposes an `/admin/analysis` board for sitewide briefs, theme briefs, tone lanes, and link-role maps.

## Notes

- If Cheshire Cat, LLM, embedding API, or SearXNG are unavailable, the system keeps deterministic fallback output in draft/preview lanes and holds direct homepage publication until a publish-ready story exists.
- The stack expects a reachable model host through `LLM_API_URL_CONTAINER` / `EMBEDDING_API_URL_CONTAINER` in Docker; the defaults use `host.docker.internal:8844`, mapped with Docker `host-gateway`, so Runtipi containers can reach the local RassyMind gateway.
- `LLM_READINESS_INFERENCE_PROBE_ENABLED=true` keeps `/api/v1/health/ready` sensitive to routing drift after RassyMind model-lane updates. Set it to `false` only when you need readiness to avoid live chat inference entirely.
- X publishing is adapter-driven and defaults to dry-run mode unless `x_live_posting` runtime control is enabled and X credentials are valid.
- Cheshire Cat is included in the local stack now so its health and Ollama wiring can be observed continuously even when it is not the primary generation path.

## Throughput run (research + generation examples)

Run one practical content burst with the live role pipeline, extra theme takes, and a social burst:

```bash
python3 infra/scripts/run_research_generation_cycle.py --configure --direct-publish --publish-ready --theme-takes 6 --social-burst 6
```

Show full body for the top generated draft:

```bash
python3 infra/scripts/run_research_generation_cycle.py --configure --show-full
```
