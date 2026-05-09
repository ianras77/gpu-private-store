# web-lickingvape

This app was brought to minimum compliance baselines for Dockerized operations.

## Ports
| Service | Port | Purpose | Health |
|---|---:|---|---|
| web | 3199 | Primary web UI | / |
| api | 3200 | Backend API | /healthz |
| cat | 3201 | Cheshire Cat admin | / |

## Local Run
```bash
npm install
npm run dev
```

## Run with Docker
```bash
cp .env.example .env
docker compose -f infra/docker-compose.yml up -d --build
```

## Health
- Check `ops/ports.yaml` for each service-specific health path.
