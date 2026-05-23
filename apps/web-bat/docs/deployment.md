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
- Local compose defaults now assume the RassyGPT Ollama-compatible gateway is reachable from containers at `http://rassygpt-gateway:8080`.
- Cheshire Cat stays live in the local stack, using `rassy-smart` for chat and `rassy-embed` for Qdrant-backed memory.
- If generation is degraded, direct homepage publication is held until the story slate has at least one publish-ready story.
- Worker defaults now run at `WORKER_CYCLE_MINUTES=30`, with `PIPELINE_LOCK_TTL_SECONDS=3600` preventing overlapping worker/manual runs and `PIPELINE_STALE_AFTER_SECONDS=1800` keeping interrupted cycles from looking active forever.
