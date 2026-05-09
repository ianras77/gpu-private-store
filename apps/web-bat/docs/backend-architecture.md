# Backend Runtime Architecture

## Service map

```mermaid
flowchart LR
  Web[Next.js web/admin]\n3197 --> API[FastAPI API\n8017]
  Worker[Pipeline worker]\n(api image) --> API
  API --> PG[(PostgreSQL\n5437)]
  API --> QD[(Qdrant\n6337)]
  API --> Redis[(Redis\n6387)]
  API --> Cat[Cheshire Cat\n1866]
  API --> Search[search.rasies.com]
  API --> Embedding[Embedding API]
  API --> LLM[LLM API]
  API --> SocialPublisher[Social publisher\n8117]
  SocialPublisher --> X[X API]
```

## Dependency map

- `web` depends on `api`.
- `api` depends on `postgres`, `redis`, `qdrant`, `cheshire-cat`.
- `worker` runs the same Python backend image and executes staged pipeline jobs.
- `social-publisher` is an isolated publishing adapter.

## Data flow map

1. Discovery: `search_client` queries `search.rasies.com` with retries and normalized parsing.
2. Ingestion: `ingestion_service` fetches pages, filters relevance/quality, dedupes, writes `sources`.
3. Embeddings: chunks are embedded (`embedding_service`) and written to Qdrant + `source_embeddings` metadata.
4. Themes/trends: `trend_engine` rebuilds `themes`, `theme_members`, and upserts/dedupes `trend_observations`.
5. Retrieval: `retrieval_service` merges vector hits + high-quality recent sources + trend ledger.
6. Editorial generation: layered prompt (`constitution/task/retrieval/output-contract`) through Cheshire Cat.
7. Publishing prep: editorial objects, homepage snapshots, and social drafts persisted with style-gate reports.
8. Dispatch: social posts go through `social-publisher` (dry-run by default).

## Job flow map

- Worker role sequence: `researcher -> analyst -> writer -> queen`.
- `researcher`: search/ingest/embeddings/themes.
- `analyst`: persist sitewide/theme analysis briefs, tone lanes, and story targets from the live source mix.
- `writer`: lead story + theme takes + homepage snapshot.
- `queen`: social variants + curation links + optional dispatch.
- Stage and cycle events are recorded in `revision_history` (`object_table=pipeline_cycle`).

## Cheshire Cat role

- Cheshire Cat is the primary generation endpoint (`/message`) for editorial and social drafting.
- Prompt assembly is now explicit:
  - Layer A: `cat_editor_system` constitution
  - Layer B: task-specific prompt
  - Layer C: retrieval bundle (facts/themes/trends)
  - Layer D: output contract
- Fallback chain: Cheshire Cat -> LLM API -> safe draft fallback with non-publish style-gate outcome.

## Storage role

- PostgreSQL stores durable editorial state, source corpus, trends, pipeline events, and runtime controls.
- Qdrant stores chunk vectors keyed by source/chunk metadata for retrieval.
- Redis provides runtime health signal + queue depth visibility (`queue:*` lists).

## Publishing flow

1. Draft creation (`editorial`, `homepage`, `social`) with style-gate metadata.
2. Manual approval path remains available (`/approve` and `/publish` routes).
3. Direct publish mode is runtime-controlled in `voice_memory` system settings.
4. `social-publisher` enforces dry-run unless explicitly configured for live posting.
