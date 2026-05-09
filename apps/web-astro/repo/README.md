# web-astrology

This app was brought to minimum compliance baselines for Dockerized operations.

## Ports
| Service | Port | Purpose | Health |
|---|---:|---|---|
| api | 4020 | Core astrology API | /healthz |
| web-jupiterseek | 4021 | Brand web app | / |
| web-maleficme | 4022 | Brand web app | / |
| web-saturnleo | 4023 | Brand web app | / |
| web-saturnseer | 4024 | Brand web app | / |
| web-oracleveil | 4025 | Brand web app | / |

## Local Run
```bash
npm install
npm run dev
```

### API-only local run
```bash
pnpm --filter @astro/api dev
```

### Geo quick start
1. Copy `.env.example` to `.env` and set at least:
   - `NOMINATIM_USER_AGENT`
   - `NOMINATIM_CONTACT_EMAIL`
2. Optionally add `MAPBOX_TOKEN` and/or `OPENCAGE_KEY`.
3. Start API and run:
```bash
pnpm --filter @astro/api smoke:geo
```

### Swiss Ephemeris engine
1. Install dependencies (`pnpm install`) so native `swisseph` bindings are built.
2. Set:
   - `ASTRO_ENGINE=swiss`
   - `SWISS_EPHEMERIS_ENABLED=true`
3. Optional:
   - `SWISS_EPHEMERIS_PATH=/absolute/path/to/ephe` (if you need a custom ephemeris directory)
4. Start API and call `/v1/chart/natal` as usual.

### Geo API examples
```bash
curl -s http://localhost:4020/health | jq
curl -s http://localhost:4020/health/providers | jq

curl -s -X POST http://localhost:4020/v1/geo/resolve \
  -H 'Content-Type: application/json' \
  -H 'X-Brand-Id: saturnseer' \
  -d '{"query":"New York","limit":5,"locale":"en"}' | jq

curl -s -X POST http://localhost:4020/v1/geo/reverse \
  -H 'Content-Type: application/json' \
  -d '{"lat":40.7128,"lon":-74.0060,"locale":"en"}' | jq
```

## Run with Docker
```bash
docker compose up -d --build
```

This wrapper keeps the existing Compose project name as `astro`, so it manages the same running
stack instead of creating a duplicate project.

## Health
- Check `ops/ports.yaml` for each service-specific health path.
