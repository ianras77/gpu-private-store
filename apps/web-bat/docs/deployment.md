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
- Local compose defaults now assume the shared Ollama proxy is reachable from containers at `http://ollama-proxy:8080`.
- Cheshire Cat stays live in the local stack, using `qwen3.6:27b` for chat and `qwen3-embedding:8b` for Qdrant-backed memory.
- Worker defaults now run at `WORKER_CYCLE_MINUTES=30`.
