# Health Endpoints

- Core health: GET /health
- Liveness: GET /healthz
- Provider diagnostics: GET /health/providers
- Readiness: GET /readyz (optional)

## Expectations
- 200 OK for healthy
- `/health` includes `{ ok, uptimeSeconds, version, requestId }`
- `/health/providers` includes enabled/configured provider states without exposing secrets
