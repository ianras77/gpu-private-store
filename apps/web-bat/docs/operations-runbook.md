# Operations Runbook

## 1. Start / stop

Start full stack:

```bash
docker compose up -d --build
```

Restart API + worker only:

```bash
docker compose up -d --build bat-api bat-worker
```

Stop stack:

```bash
docker compose down
```

Model routing toggle:

- `CAT_PRIMARY_ENABLED=true`: Cheshire Cat primary, LLM fallback.
- `CAT_PRIMARY_ENABLED=false`: route generation directly to `LLM_API_URL` for debugging or bypassing Cheshire Cat.

## 2. Health and readiness

Liveness:

```bash
curl -sS http://localhost:8017/api/v1/health | jq .
```

Readiness (dependency checks + degraded states):

```bash
curl -sS http://localhost:8017/api/v1/health/ready | jq .
```

Diagnostics (recent jobs, failed jobs, queue depth, counts):

```bash
curl -sS http://localhost:8017/api/v1/health/diagnostics | jq .
```

## 3. Inspect logs

API logs:

```bash
docker compose logs -f bat-api
```

Worker logs:

```bash
docker compose logs -f bat-worker
```

Cheshire Cat logs:

```bash
docker compose logs -f bat-cheshire-cat
```

## 4. Run ingestion manually

Single query:

```bash
curl -sS -X POST 'http://localhost:8017/api/v1/sources/ingest' \
  -H 'Content-Type: application/json' \
  -d '{"query":"court blocks Trump administration action","limit":6,"use_query_pack":false,"include_x":false}' | jq .
```

Interpretation:

- `created` / `updated`: source writes.
- `skipped_irrelevant`, `skipped_fetch_failed`, `skipped_embedding`: pipeline rejection/failure counters.
- `search_debug`: upstream search telemetry.

## 5. Validate trend processing

Refresh trends:

```bash
curl -sS -X POST http://localhost:8017/api/v1/trends/refresh | jq .
```

Check duplicate safety in DB:

```bash
docker compose exec -T postgres psql -U bat -d bat -c \
"select count(*) from (select theme_id, observation_date, count(*) as c from trend_observations group by theme_id, observation_date having count(*) > 1) dupes;"
```

## 6. Test Cheshire Cat editorial path

Generate lead draft:

```bash
curl -sS -X POST 'http://localhost:8017/api/v1/editorial/generate' \
  -H 'Content-Type: application/json' \
  -d '{"object_type":"lead_story","publish_now":false}' | jq .
```

Inspect metadata for retrieval + prompt layers:

```bash
curl -sS http://localhost:8017/api/v1/editorial/objects/<OBJECT_ID> | jq '.metadata.prompt_layers, .metadata.retrieval_bundle'
```

## 7. Validate vector writes

DB embedding count:

```bash
docker compose exec -T postgres psql -U bat -d bat -c "select count(*) from source_embeddings;"
```

Qdrant points count:

```bash
curl -sS http://localhost:6337/collections/source_chunks_v4096 | jq '.result.points_count'
```

If counts stop moving while ingestion updates sources, check:

- `EMBEDDING_API_URL`
- `EMBEDDING_ALLOW_FALLBACK`
- `/api/v1/health/ready` embedding status
- API logs for `embedding.request_failed`

## 8. Generate social drafts from editorial object

```bash
curl -sS -X POST http://localhost:8017/api/v1/editorial/objects/<OBJECT_ID>/social/generate | jq .
```

Inspect style-gate reasons:

```bash
curl -sS 'http://localhost:8017/api/v1/social/posts?limit=20' | jq '.[0].metadata.style_gate'
```

## 9. Recent / failed job reports

```bash
curl -sS http://localhost:8017/api/v1/admin/jobs/recent | jq .
curl -sS http://localhost:8017/api/v1/admin/jobs/failed | jq .
```

## 10. One-command throughput cycle

Run one pipeline-driven content burst with extra theme takes and a live social burst:

```bash
python3 infra/scripts/run_research_generation_cycle.py --configure --direct-publish --publish-ready --theme-takes 6 --social-burst 6
```

Include X ingestion in the cycle:

```bash
python3 infra/scripts/run_research_generation_cycle.py --configure --include-x --social-burst 4
```

## 11. Recovery playbook

### A) `trends/refresh` fails

1. Check API logs for SQL or duplicate errors.
2. Apply uniqueness migration:

```bash
docker compose exec -T postgres psql -U bat -d bat -f /docker-entrypoint-initdb.d/003_trend_observation_uniqueness.sql
```

If file is unavailable in running container, execute SQL manually from `infra/sql/003_trend_observation_uniqueness.sql`.

### B) Analyst stage fails on missing `analysis_briefs`

1. Recent builds will auto-create the table on the first analysis/admin request, but apply the migration manually if your environment blocks runtime DDL or you want an explicit schema step.
2. Apply the analysis brief migration:

```bash
docker compose exec -T postgres psql -U bat -d bat -f /docker-entrypoint-initdb.d/004_analysis_briefs.sql
```

If file is unavailable in the running container, execute SQL manually from `infra/sql/004_analysis_briefs.sql`.

### C) Search quality collapse (mostly irrelevant sources)

1. Inspect ingestion skip reasons and `search_debug` payload.
2. Tighten `SEARXNG_BLOCKED_DOMAINS` and query directives.
3. Re-run single-query ingestion and verify `created` only for high-quality political sources.

### D) Editorial outputs become generic

1. Check style-gate metadata in generated editorial/social records.
2. Validate retrieval bundle quality in `editorial_objects.metadata.retrieval_bundle`.
3. Update runtime voice controls (`/api/v1/admin/system-settings`) and re-generate.

### D) Queue/worker visibility needed

Use:

- `/api/v1/health/diagnostics`
- `/api/v1/admin/jobs/recent`
- `/api/v1/admin/jobs/failed`

These now provide actionable event history and failure snapshots.
