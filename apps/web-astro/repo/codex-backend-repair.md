# Codex Repair Program: Multi‑Brand Backend + Location Resolve That Never Fails Quietly

## What this is
This is a Codex “repair program” prompt intended to be pasted into a codegen agent. It assumes:
- You already have **several brand frontends** (web + iOS) pointing at **one backend**.
- The backend exists but “has never worked”, and **location search always fails**.
- You want the backend to be **single-source-of-truth** for geo resolution, timezone logic, chart calculation, and reading generation.

The goal: **keep your existing structure**, fix the backend, and make location/timezone resolution reliable with fallbacks, caching, tests, and observability.

---

## Paste everything below into Codex

```text
You are a senior backend engineer. You are operating inside an EXISTING repository that already has some of the planned multi-brand structure (multiple frontends, one backend). Do NOT rebuild everything from scratch. Instead, repair and harden the backend with special attention to location resolution.

PRIMARY PROBLEM
The "location find" feature always fails. The backend has never worked reliably. Frontends exist but cannot depend on this backend.

GOALS (IN ORDER)
1) Make the backend boot reliably in local dev and production.
2) Implement a robust geo + timezone resolution pipeline with:
   - multiple geocoding providers (primary + fallback)
   - strict request/response schemas
   - meaningful error codes (no silent failures)
   - caching
   - rate limiting
   - logging with request ids and provider timings
3) Ensure the backend supports multiple brands from a shared backend:
   - brandId inferred from header or subdomain
   - shared endpoints behave consistently across brands
4) Provide a clear, testable contract that frontends can use:
   - location autocomplete/search
   - timezone inference
   - chart calculation endpoint consuming lat/lon/timezone
5) Add health endpoints and diagnostics so failures are visible.

NON-NEGOTIABLES
- Move all geocoding/timezone resolution server-side (avoid CORS, avoid leaking API keys).
- No TODOs for core flows (geo search must work).
- Use TypeScript, Zod, structured logs, and real tests.
- Make it trivial to swap providers via env.
- If no provider keys are configured, the backend must still work in dev using a free fallback provider with proper usage headers + strict rate limiting.

REPO DISCOVERY PHASE (DO THIS FIRST)
Inspect the existing repo:
- Identify backend location (e.g., apps/api, server/, api/, etc.)
- Identify how frontends call location search today (path, payload, expectations).
- Find current failing code path:
  - is it calling a client-side geocoder (CORS)?
  - is it missing API keys?
  - is it hitting a blocked provider (Nominatim requires User-Agent)?
  - is it parsing results incorrectly?
  - is it returning errors without details?
- Ensure backend starts locally with docker-compose (postgres, redis optional).

OUTPUTS
You will:
- Implement/repair geo endpoints:
  - POST /v1/geo/resolve   (autocomplete/search: query string -> candidates)
  - POST /v1/geo/reverse   (lat/lon -> place label + timezone)
- Implement timezone inference:
  - Use tz-lookup or geo-tz to infer IANA timezone from lat/lon.
- Implement health + diagnostics:
  - GET /health
  - GET /health/providers
- Add request id middleware and structured logging.
- Add rate limiting to geo endpoints and reading endpoint.
- Add caching for geo results (Redis if configured; otherwise in-memory LRU).
- Add tests (unit + integration) that mock providers.

TECH CHOICES (USE THESE UNLESS ALREADY PRESENT)
- Server: Fastify OR Next.js route handlers (choose what the repo already uses; do not introduce a new runtime unless necessary).
- Validation: Zod for all input/output.
- HTTP client: undici or fetch (node 18+).
- Time: Luxon for timezone conversions (or Temporal polyfill if already used).
- Timezone lookup: tz-lookup (small, reliable).
- Cache: ioredis if redis is present; fallback to lru-cache in-memory.
- Testing: Vitest.
- Provider mocking: nock or MSW for node.

MULTI-BRAND REQUIREMENT
The backend must accept a brand identifier:
- Accept header: X-Brand-Id: jupiterseek|saturnseer|saturnleo|maleficme
- If missing, default brand is "jupiterseek".
- Add brandId into logs and into rate limit keys (so one brand can’t starve the others).
- Geo results themselves are not brand-specific, but logging and analytics are.

GEOCODING PROVIDERS (MUST IMPLEMENT WITH FALLBACK)
Implement a provider interface:

interface GeocodeProvider {
  id: string;
  isConfigured(): boolean;
  forward(query: string, limit: number, locale?: string): Promise<GeocodeCandidate[]>;
  reverse(lat: number, lon: number, locale?: string): Promise<ReverseGeocodeResult | null>;
}

Candidate must normalize to:
- label: string (human readable)
- lat: number
- lon: number
- countryCode?: string
- region?: string
- city?: string
- confidence?: number (0..1)
- provider: string
- timezone: string (IANA)  <-- always fill by tz-lookup based on lat/lon, not provider text

Providers:
1) Mapbox (primary if MAPBOX_TOKEN is set)
2) OpenCage (optional if OPENCAGE_KEY is set)
3) Nominatim (fallback dev/provider)
   IMPORTANT: Nominatim requires a valid User-Agent identifying the app and a contact email.
   - Require env NOMINATIM_USER_AGENT and NOMINATIM_CONTACT_EMAIL
   - Add strict rate limiting for nominatim usage (e.g., 1 req/sec overall + cache)
   - Always send headers per usage policy
   - Cache responses aggressively

PROVIDER SELECTION LOGIC
- Build a provider chain from configured providers in priority order:
  - Mapbox if configured
  - OpenCage if configured
  - Nominatim as last resort (even in production only if explicitly enabled)
- For forward geocode: try first provider, if network failure or 5xx, fallback to next.
- If provider returns 0 results, do NOT fallback automatically unless configured; instead return 200 with empty list and a code "GEO_NO_RESULTS".
- Never return 500 for “no results”.
- Always return structured error payloads.

API CONTRACTS (STRICT)
POST /v1/geo/resolve
Request:
{
  "query": "string (min 2 chars)",
  "limit": 5,
  "locale": "en" (optional)
}
Response 200:
{
  "brandId": "…",
  "query": "…",
  "candidates": [GeocodeCandidate...],
  "meta": {
     "providerChain": ["mapbox","opencage","nominatim"],
     "providerUsed": "mapbox",
     "cached": true|false,
     "requestId": "…",
     "elapsedMs": 123
  }
}
Response 400 Zod error:
{
  "error": { "code": "BAD_REQUEST", "message": "...", "issues": [...] },
  "requestId": "…"
}

POST /v1/geo/reverse
Request:
{ "lat": 40.7128, "lon": -74.0060, "locale": "en" }
Response 200:
{
  "result": {
    "label": "New York, NY, USA",
    "lat": 40.7128,
    "lon": -74.0060,
    "timezone": "America/New_York",
    "provider": "…"
  },
  "meta": { "providerUsed": "...", "cached": true|false, "requestId": "...", "elapsedMs": 123 }
}

TIMEZONE + DATETIME PIPELINE (MUST FIX)
- Frontend sends local birth date/time and location text.
- Backend:
  1) resolves location text -> lat/lon + timezone
  2) converts local datetime in that timezone to UTC
  3) converts to Julian day for astrology calc
- Add tests verifying DST boundary correctness (e.g., America/New_York around DST change).

DIAGNOSTICS & HEALTH
GET /health
- returns ok, uptime, version, requestId

GET /health/providers
- show configured providers, which are enabled, and what env vars are missing
- DO NOT leak full API keys, only boolean configured flags

LOGGING & ERROR VISIBILITY
- Add request id middleware:
  - accept incoming X-Request-Id or generate one
  - return it in response headers and in JSON meta
- Structured logs (JSON):
  - requestId, brandId, route, providerUsed, elapsedMs, cached, errorCode
- If a provider request fails, log:
  - providerId, status code, error message, timeout vs parse error

RATE LIMITING
- Apply per-IP + per-brand rate limiting for:
  - /v1/geo/*
  - /v1/reading/*
- Use Redis if available; fallback to memory (with a warning log).

CACHING
- Cache forward geocode results by normalized query + locale + limit.
- Cache reverse geocode results by rounded lat/lon (e.g. 4 decimals).
- TTL 7 days for geo data.
- Ensure cache key includes providerUsed for safety.

FRONTEND COMPATIBILITY
- Keep existing endpoint path if already used, but add these endpoints as canonical.
- If the frontend expects a different shape today, add a compatibility adapter or keep the old endpoint as a thin wrapper that calls the new service.

TESTS (MUST WRITE)
- Unit tests:
  - normalize query, cache keys, tz inference
  - provider parsing for each provider
- Integration tests:
  - mock Mapbox/OpenCage/Nominatim responses
  - /v1/geo/resolve returns candidates
  - missing provider config -> falls back to Nominatim in dev
  - “no results” returns 200 with empty candidates and GEO_NO_RESULTS meta/code
- Add a smoke test script:
  - curl example queries
  - returns non-empty for “New York” and “London”

DONE WHEN
- Running locally:
  - docker compose up
  - pnpm dev (or equivalent)
  - POST /v1/geo/resolve with query "New York" returns candidates with timezone
- Frontend location search works end-to-end without CORS errors.
- Logs show providerUsed, elapsedMs, requestId.
- Tests pass in CI.

NOW DO THE WORK
1) Inspect repo and identify existing backend.
2) Implement geo services and endpoints per spec.
3) Repair any wiring issues so backend actually runs.
4) Update env.example and docs.
5) Add tests and a quick-start section.

Produce:
- Updated file tree
- The new/changed files
- Short run instructions
- Example curl commands
```

---

## Operator Notes (for humans)

### Common reasons “location find always fails”
These are the top real-world failure modes your Codex changes should explicitly prevent:

- **CORS**: frontend calling geocoding provider directly (blocked in browsers).
- **Missing API key**: provider returns 401/403 and you swallow the error.
- **Nominatim blocked**: missing required `User-Agent` and contact, or too many requests without caching.
- **Parsing mismatch**: provider payload shape changed, code assumes fields that are not present.
- **Timezone step missing**: you geocode but never infer IANA timezone consistently.
- **Silent failure**: backend catches and returns empty without error code.

### Sample curl tests (post-fix)
```bash
curl -s http://localhost:3000/health | jq
curl -s http://localhost:3000/health/providers | jq

curl -s -X POST http://localhost:3000/v1/geo/resolve \
  -H 'Content-Type: application/json' \
  -H 'X-Brand-Id: saturnseer' \
  -d '{"query":"New York","limit":5,"locale":"en"}' | jq

curl -s -X POST http://localhost:3000/v1/geo/reverse \
  -H 'Content-Type: application/json' \
  -d '{"lat":40.7128,"lon":-74.0060,"locale":"en"}' | jq
```

### Env vars to add to `.env.example`
- MAPBOX_TOKEN=...
- OPENCAGE_KEY=...
- NOMINATIM_USER_AGENT="YourAppName/1.0"
- NOMINATIM_CONTACT_EMAIL="you@domain.com"
- GEO_PROVIDER_ALLOW_NOMINATIM_IN_PROD=false
- REDIS_URL=redis://...
- NODE_ENV=development

