# Architecture

## Services

- `apps/web`: public + admin Next.js app
- `apps/api`: FastAPI orchestration API + worker runtime
- `apps/social-publisher`: isolated publish adapter with dry-run mode
- `postgres`: relational store for sources/themes/editorial objects/memory
- `qdrant`: vector store for chunk embeddings
- `redis`: runtime queue/cache and health signal store
- `cheshire-cat`: editorial brain runtime endpoint

## Flow

1. Hourly worker queue starts a `pipeline_cycle`.
2. `Researcher` role builds a directed query plan (runtime directive + active themes + fallback pack), ingests SearXNG (and optional X), chunks text, writes embeddings, and refreshes theme clusters.
3. `Analyst` role turns fresh source signal into persisted site/theme briefs, tone lanes, source-role maps, and story targets.
4. `Writer` role generates lead + theme outputs and homepage snapshot with persistent voice memory and analysis context injected.
5. `Queen` role curates links, generates social variants, and optionally dispatches live X posts.
6. Pipeline events are logged in revision history for admin telemetry.
7. Runtime controls can switch between draft-first and direct-publish without redeploy.

## Role plugin chain

- `Researcher`: `search_connector`, `trend_engine`, `voice_memory`
- `Analyst`: `trend_engine`, `analysis_engine`, `voice_memory`
- `Writer`: `trend_engine`, `analysis_engine`, `homepage_editor`, `voice_memory`
- `Queen`: `analysis_engine`, `social_voice`, `homepage_editor`, `voice_memory`

Plugin names map to service responsibilities in `apps/api/src/services`. The `apps/cat-plugins` directory documents the runtime contract rather than shipping standalone Cheshire Cat plugin packages in this repo.
