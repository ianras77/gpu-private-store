# Backend Audit Report

## Scope

Audit + repair pass for the Cheshire-Cat-centered backend stack (`api`, `worker`, ingestion, memory/vector, trend pipeline, generation, publishing prep, and observability).

Audit date: 2026-03-13 (UTC)

## Current architecture summary

- Orchestrator: FastAPI (`apps/api`) + worker (`apps/api/src/workers`).
- Data stores: PostgreSQL (`sources`, `themes`, `trend_observations`, `editorial_objects`, `social_posts`, `voice_memory`, `revision_history`), Qdrant (`source_chunks`), Redis.
- Discovery/search: `search.rasies.com` via `search_client`/`search_connector`.
- Editorial engine: Cheshire Cat primary, LLM fallback secondary.
- Publishing: `social-publisher` adapter with dry-run default.

## Issue inventory (symptom -> root cause -> fix)

| Severity | Symptom | Root cause | Files/services | Implemented fix |
|---|---|---|---|---|
| Critical | `POST /trends/refresh` returned `500` (`MultipleResultsFound`) | duplicate `trend_observations` per `(theme_id, observation_date)` with `scalar_one_or_none()` lookup | `services/trend_engine.py` | switched to tolerant upsert, duplicate cleanup pass, summary includes `deduped_observations`; added uniqueness migration script |
| High | ingestion pipeline silently swallowed connector errors | broad `except` with empty returns in search/fetch/embedding/qdrant/x/cat/social paths | `services/search_client.py`, `search_connector.py`, `fetcher.py`, `embedding_service.py`, `qdrant_service.py`, `x_connector.py`, `cat_client.py`, `social_dispatcher.py` | structured event logs with error details + explicit debug payloads in responses |
| High | low-quality junk results contaminated content set (dictionary/finance/irrelevant pages) | weak relevance checks and no normalized search filtering | `services/ingestion_service.py`, `services/search_client.py` | normalized search client, blocked domains, political-signal gating, quality scoring, skip reason accounting |
| High | trend ledger inflated with duplicate daily entries | no dedupe or uniqueness controls | `services/trend_engine.py`, `infra/sql/003_trend_observation_uniqueness.sql` | in-cycle dedupe + SQL migration script for persistent uniqueness |
| High | voice generation insufficiently inspectable and frequently generic | prompt chain not explicitly layered; retrieval context limited to recent titles | `services/cat_client.py`, `services/editorial_service.py`, `services/retrieval_service.py` | layered prompt assembly (A/B/C/D), retrieval bundle persisted in metadata, output contracts added |
| Medium | social drafts published despite generic/under-specific text | social style gate penalties too weak | `services/editorial_service.py` | stricter social/live style gating (`missing_political_specificity` hard-fails) |
| Medium | X research path had hidden config gap | missing `x_api_base_url` in app settings model | `config.py`, `.env.example`, `services/x_connector.py` | added explicit config field and logging |
| Medium | no readiness/diagnostics answer for "what failed and why" | health endpoint only returned static `{status: ok}` | `routes/health.py`, `routes/admin.py` | added `/health/live`, `/health/ready`, `/health/diagnostics`, `/admin/jobs/recent`, `/admin/jobs/failed` |
| Medium | no automated regression coverage for core hardening changes | missing tests for search normalization/filtering/style guard behavior | `src/tests/*` | added 6 unit tests + fixture for search payload normalization |

## Root-cause details by phase

### 1) Discovery/architecture

- Stack topology is coherent but previously opaque at runtime.
- Worker and API shared many silent-failure codepaths.

### 2) Why processing failed or degraded

- Search integration accepted malformed/noisy results without normalized quality controls.
- Trend refresh could hard-fail due duplicate observations.
- Embedding/connector failures were hidden.
- Prompt context assembly did not clearly separate facts/themes/voice contract.

### 3) Cheshire Cat hardening

- Cat now receives layered prompt sections and retrieval bundle context.
- Editorial artifacts now retain `retrieval_bundle` + `prompt_layers` metadata for inspection.

### 4) search.rasies.com integration

- Added robust client with retries, normalization, dedupe, blocked-domain filtering, and debug payload.
- Ingestion summary now returns `search_debug` and per-skip counters.

### 5) Ingestion/trend catalog pipeline

- Pipeline now records skip causes (`token_overlap_too_low`, `missing_political_signals`, etc.).
- Source metadata now distinguishes normalized source layer and quality score.
- Trend observations dedupe and upsert behavior corrected.

### 6) Memory/embeddings/retrieval

- Chunk metadata now tags source layer/type/query.
- Retrieval bundle combines vector hits + quality recent sources + themes + trend ledger.
- Embedding failures are visible; fallback is explicitly controlled by config.

### 7) Prompt architecture/voice consistency

- Explicit layer model implemented in code path and metadata.
- Style gate tightened for social/live lanes to prevent weak off-voice outputs publishing directly.

### 8) Publisher readiness

- Website + social draft flows remain functional with explicit style gate outcomes.
- Dispatch path logs outcomes and fallback behavior.

### 9) Observability

- Structured event logging across search/fetch/embedding/retrieval/cat/editorial/pipeline/social.
- Diagnostics endpoint now answers: readiness, recent jobs, failed jobs, counts, queue depth.

### 10) End-to-end validation evidence

Validated in running stack after rebuild:

- `POST /api/v1/sources/ingest` returns structured skip/create/update summary with `search_debug`.
- `POST /api/v1/trends/refresh` succeeded after fix; duplicate cleanup reported.
- `POST /api/v1/editorial/generate` produced inspectable object metadata with retrieval/prompt layers.
- `POST /api/v1/editorial/{id}/social/generate` produced drafts with strict style-gate metadata.
- `GET /api/v1/health/ready` now reports degraded state when embedding/LLM/search dependencies fail.
- `GET /api/v1/health/diagnostics` reports counts, recent jobs, failed jobs, queue depth.

## Remaining risks

- Search quality still depends heavily on query design and upstream engine behavior.
- If `EMBEDDING_API_URL` is unreachable and `EMBEDDING_ALLOW_FALLBACK=false`, new vectors are not written.
- Existing historical source corpus contains legacy low-quality records from pre-fix ingestion.
- Cheshire Cat output quality is still model/runtime dependent and needs editorial QA.

## Recommendations

1. Set production-grade `EMBEDDING_API_URL` and `LLM_API_URL`; keep fallback disabled in production.
2. Apply `infra/sql/003_trend_observation_uniqueness.sql` in all non-local environments.
3. Add source-domain allowlist/credibility weighting for stricter discovery quality.
4. Add integration tests with mocked HTTP transports for Cat/search/qdrant to cover failure paths.
5. Add retention and archival policy for stale/low-quality sources.
