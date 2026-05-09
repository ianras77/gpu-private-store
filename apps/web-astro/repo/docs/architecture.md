# Architecture

## Overview
This monorepo ships four web brands and one Expo app that can be built into four branded iOS binaries. All experiences share a single astrology and reading backbone while swapping brand configuration and assets.

## Monorepo Layout
- `apps/api`: Fastify API, Prisma, auth, and reading orchestration.
- `apps/web-*`: Next.js App Router sites (one per brand).
- `apps/mobile`: Expo app with multi-brand builds via `APP_BRAND`.
- `packages/astro-core`: Core chart types, math, aspects, house logic, schema.
- `packages/astro-engine-astro`: Default dev engine with deterministic ephemeris approximations.
- `packages/astro-engine-swiss`: Swiss Ephemeris stub gated by env.
- `packages/reading-core`: Prompt builder, schema, safety filters, caching.
- `packages/brands`: Brand configs and asset pointers.
- `packages/ui`: Shared UI tokens and components (web + native).

## Request Flow
1. Client gathers birth inputs and calls `POST /v1/geo/resolve` to geocode and resolve timezone.
2. Client calls `POST /v1/chart/natal` to compute the natal chart server-side.
3. Client calls `POST /v1/reading/natal` with chart JSON to generate a structured reading.
4. Optional storage: `POST /v1/charts` saves charts in Postgres and can store readings.

## Engine Selection
- Default engine: `@astro/astro-engine-astro` (MIT-compatible, deterministic).
- Swiss engine: `ASTRO_ENGINE=swiss` and `SWISS_EPHEMERIS_ENABLED=true` enable the stub.
- Swiss Ephemeris requires a professional license for closed-source commercial use.

## Data Storage & Security
- Only derived chart JSON and coarse location label are required for persistence.
- Birth time and coordinates are encrypted at rest when `DATA_ENCRYPTION_KEY` is set.
- Auth uses Supabase JWT verification on the API side.

## Caching
- Reading output is cached by chart hash, brand, and length.
- Redis is optional; set `REDIS_URL` to enable.

## Observability
- Fastify structured logging with request IDs.
- Error handler returns safe error messages to clients.
