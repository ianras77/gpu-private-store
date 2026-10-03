# Jogmania — The Outdoor Arcade

Jogmania turns ordinary outdoor runs into a bright, personal adventure. A real course becomes a storybook trail; the Apple Watch delivers distance-triggered surprises; each saved run lights a durable arcade world; Mastra writes a runner-aware mission and postcard from a small, privacy-conscious history snapshot.

The product rule is simple: the runner's real workout is the source of truth. The API validates beats and owns progression. Mastra writes copy, never workout facts, safety decisions, or reward amounts. The browser game is a no-save practice cabinet; only captured iPhone or Apple Watch workouts grow the persistent world.

## Repo Layout

- `repo/repo/apps/web` — Next.js dashboard, arcade world, course storybooks, run postcards, and practice cabinet
- `repo/repo/apps/ios` — Expo iPhone app and native SwiftUI watchOS companion
- `repo/repo/api` — FastAPI workout, runner profile, cartridge, recap, and progression APIs
- `repo/repo/apps/mastra` — private Mastra story service and typed cartridge/recap workflows
- `repo/repo/packages/api-client` — shared TypeScript API client
- `repo/repo/packages/shared` — shared TypeScript types and schemas

## Current Product Loop

1. Choose a familiar course and a gentle mission intention in the iPhone app or Watch.
2. Jogmania prepares a small cartridge with four distance-triggered story beats. The Watch caches it before the run, then plays it locally with optional haptics.
3. The Watch records the HealthKit workout and queues uploads safely when the network is missing. The iPhone capture path can also record live story beats.
4. The API checks that submitted beat IDs belong to the saved cartridge, awards distance-based sparks and course/return keepsakes, and turns on an arcade light.
5. Mastra writes a warm post-run postcard from the actual workout, validated beat log, runner preferences, and aggregate history. If Mastra is unavailable, the run and deterministic fallback story still save.
6. The web and iPhone home screens show the growing chapter, lights, level, rewards, and course history.

Progress never depends on pace, heart rate, calories, device type, or missing a day. Precise GPS and health samples stay out of Mastra prompts.

## Source Status and Qualification

The source now also includes evidence-driven Mastra trend and recap workflows, a durable recap outbox, runner story feedback and memory clearing, a versioned progression ledger with level rewards, an illustrated keepsake shelf, pause/resume, optional health-data capture (off by default), and invite-based crew projects that share arcade progress without sharing route or pace details. These are source capabilities. Paired Apple Watch behavior, HealthKit permission dialogs, actual offline retries, configured-model quality, live database migrations, and deployment still need qualification.

See [`docs/VISION_AND_TRANSFORMATION_PLAN.md`](docs/VISION_AND_TRANSFORMATION_PLAN.md) for the review, implementation status, complete product plan, and acceptance gates. See [`docs/REPORT.md`](docs/REPORT.md) for implementation notes and remaining qualification work.

## Local Development

```bash
docker compose -f docker-compose.dev.yml up --build
```

Services:

- Web: http://localhost:3000
- API: http://localhost:8000
- API docs: http://localhost:8000/docs
- Mastra: internal service on port 4112 (not published to the host)
- MinIO console: http://localhost:9001

Mastra uses `JOGMANIA_MASTRA_MODEL_BASE_URL` and `JOGMANIA_MASTRA_MODEL_API_KEY`, falling back to RassyMind settings. If model configuration is missing or Mastra times out, the API uses deterministic authored copy and still records the run.

For local non-Docker development, run the API and web commands from the root `repo/repo` as before. Apply database migrations with `alembic upgrade head` from `repo/repo/api` before starting the API.

## Apple Watch Bring-up

Read [`apps/ios/docs/APPLE_WATCH.md`](apps/ios/docs/APPLE_WATCH.md) for native project setup, connectivity, cache/retry behavior, and the device qualification checklist. A paired iPhone must be signed in before the Watch can receive its initial course context and mission.

## Environment

Copy `.env.example` and set the required database, JWT, Redis, and API values. For Mastra, configure an OpenAI-compatible model URL and server-side model key; optional RassyMind variables are supported. Never put model credentials in web or iPhone public environment variables.

Common app settings include `JOGMANIA_MASTRA_MODEL`, `JOGMANIA_MASTRA_TIMEOUT_SECONDS`, `JOGMANIA_MASTRA_INTERNAL_TOKEN`, `EXPO_PUBLIC_API_BASE_URL`, and `EXPO_PUBLIC_CAPTURE_MODE` (`gps` or `mock`).

## Existing Features

- Cookie-backed auth, route/course history, workout maps, MinIO exports, and iPhone GPS capture
- Deterministic route storybooks based on course geometry, without pulse gates or pace rewards
- Durable sparks, course discovery, course familiarity, arcade attractions, and level chapters
- Runner settings for story voice, run intention, and Watch haptics
- Apple Watch QA import remains available, clearly separate from the native Watch run path

The browser practice cabinet is intentionally separate from the workout ledger. Its toy GPS/theme paths and keepsakes are local practice content and are never uploaded as workouts.
