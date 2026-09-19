# Deployment

## Local draft deployment

```bash
cp .env.example .env
docker compose up -d --build
```

The two required secrets must be non-empty and must remain stable across
restarts: `BAT_INTERNAL_SERVICE_TOKEN` authenticates internal API/Mastra/web
calls, while `BAT_POSTGRES_PASSWORD` must match the password used by the
database URL. Managed Runtipi deployments source these from the protected
`app.env`; never commit that file or replace its values with placeholders.

For a recreated empty Postgres volume, Compose runs all checked-in init SQL,
including the Mastra editorial tables and legacy-provenance reconciliation.
Existing volumes are not re-initialized; apply any newly added SQL migrations
once according to the operations runbook before declaring the deployment ready.

## Health checks

- API: `GET http://localhost:8017/api/v1/health/live`
- Web: `GET http://localhost:3197`
- Social publisher: `GET http://localhost:8117/health`

## Notes

- Keep `ENABLE_MANUAL_REVIEW=true` in non-dev environments.
- Keep `X_DRY_RUN=true` until production adapter hardening is complete.
- Local compose defaults now assume the RassyMind gateway is reachable from containers at `http://host.docker.internal:8844`; BAT maps that name with Docker `host-gateway` for API, worker, and Cheshire Cat containers.
- Cheshire Cat stays live in the local stack, using `rassy-mind` for chat and `rassy-embed` for Qdrant-backed memory through the native host-gateway model path.
- `/api/v1/health/ready` probes a small `rassy-mind` chat completion by default so lane or alias drift in RassyMind is visible before a worker cycle gets stuck. Set `LLM_READINESS_INFERENCE_PROBE_ENABLED=false` only for environments where readiness must be catalog-only.
- If generation is degraded, direct homepage publication is held until the story slate has at least one publish-ready story.
- Worker defaults now run at `WORKER_CYCLE_MINUTES=15`, with `PIPELINE_LOCK_TTL_SECONDS=7200` preventing overlapping worker/manual runs and `PIPELINE_STALE_AFTER_SECONDS=7200` keeping interrupted cycles visible long enough for the Runtipi restart recovery path to mark orphaned worker cycles explicitly.
