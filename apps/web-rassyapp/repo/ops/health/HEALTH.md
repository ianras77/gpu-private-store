# Health Endpoints

- Liveness: GET /healthz
- Readiness: GET /readyz (optional)

## Expectations
- 200 OK for healthy
- JSON response like: {"ok": true}
