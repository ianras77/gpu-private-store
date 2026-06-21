# Deployment

## Local draft deployment

```bash
cp .env.example .env
docker compose up -d --build
```

## Health checks

- API: `GET http://localhost:8017/api/v1/health/live`
- Web: `GET http://localhost:3197`
- Social publisher: `GET http://localhost:8117/health`

## Notes

- Keep `ENABLE_MANUAL_REVIEW=true` in non-dev environments.
- Keep `X_DRY_RUN=true` until production adapter hardening is complete.
- Local compose defaults now assume the RassyCodex gateway is reachable from containers at `http://host.docker.internal:8844`; BAT maps that name with Docker `host-gateway` for API, worker, and Cheshire Cat containers.
- Cheshire Cat stays live in the local stack, using `rassy-smart` for chat and `rassy-embed` for Qdrant-backed memory through the same host-gateway model path.
- If generation is degraded, direct homepage publication is held until the story slate has at least one publish-ready story.
- Worker defaults now run at `WORKER_CYCLE_MINUTES=15`, with `PIPELINE_LOCK_TTL_SECONDS=7200` preventing overlapping worker/manual runs and `PIPELINE_STALE_AFTER_SECONDS=7200` keeping interrupted cycles visible long enough for the Runtipi restart recovery path to mark orphaned worker cycles explicitly.
