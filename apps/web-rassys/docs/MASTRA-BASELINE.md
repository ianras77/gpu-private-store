# Mastra baseline

Date: 2026-09-05

## Current topology

The app currently runs Next.js (`apps/web`), `radio-controller`,
`minecraft-bridge`, Postgres, Redis, Liquidsoap, Icecast, and a service named
`cheshire` (`services/cheshire-proxy`). The web app owns the public routes and
the existing DM implementation; radio-controller owns queue/playback truth
and radio intelligence.

## Current model paths

Web and DM use `apps/web/src/lib/cheshire-client.ts` and
`apps/web/src/lib/dm/cheshire.ts`. Radio-controller calls the configured
RassyMind OpenAI-compatible endpoints directly from `dj/rassy.ts` and
`library/track-intelligence.ts`, through the Cheshire queue headers. The model
gateway is configured by `RASSYMIND_BASE_URL` and semantic aliases such as
`rassy-fast`, `rassy-mind`, `rassy-embed`, and `rassy-rerank`.

## Current channels and contracts

The app has home, Mr Rassy/radio, Dungeon Master, Minecraft, stories, family,
notebook/thoughts, admin, and compatibility API routes under
`/api/radio/*`, `/api/dm/*`, `/api/minecraft/*`, `/api/thoughts/*`, and
`/api/photos/*`. Existing playback, queue, DM persistence, media, and mobile
contracts are domain-owned and must remain authoritative.

## Implemented foundation

`services/rassy-intelligence` now runs Mastra `1.64.0` with a RassyMind-only
OpenAI-compatible provider, semantic aliases, fourteen registered agents, internal
Bearer authentication, channel/tool registries, and independent liveness,
readiness, capability, and agent contract endpoints. It is intentionally
additive while callers are migrated and domain parity is tested.

The shared core now defines a validated `RassyRequestContext` containing the
channel, viewer class, trusted resource identifiers, permissions, locale, and
bounded model policy. The intelligence endpoint rejects malformed context and
adds trusted context as data rather than accepting resource identity from the
model.

Radio listener generation now attempts the authenticated `radio-listener`
agent first. `radio-controller` still owns context assembly, recommendation
validation, request persistence, skip actions, Redis idempotency, and all
playback/queue authority. If the intelligence service is unavailable or its
schema response is invalid, the existing controller fallback path remains.

Dungeon Master narration now attempts the authenticated `dungeon-master`
agent first. The existing context packet, normalization/schema validation,
transactional state patching, authoritative dice, locks, idempotency, and
fallback retry remain in the web DM domain service. LLM-call provenance is
recorded as `rassy-intelligence`, `cheshire`, or `fallback`.

DM embedding retrieval now attempts the authenticated intelligence
`/v1/embeddings` contract using `rassy-embed` before the legacy compatibility
embedding path. An unavailable embedding lane returns to the existing safe
null/fallback behavior and does not affect authoritative campaign state.

Radio track intelligence now attempts the authenticated intelligence
`/v1/embeddings` and `/v1/rerank` contracts before its existing direct
compatibility calls. Enrichment remains background work and failure returns
null, so live queue/playback behavior is unaffected.

Background track knowledge enrichment now attempts the registered
`music-librarian` agent before its direct compatibility chat call. The
existing strict insight schema and fallback behavior remain in the controller.

Public site curios now attempt the shared `mr-rassy-host` agent before the
legacy JSON client. Route-target validation and fallback curios remain in the
Next.js route, so the model cannot create arbitrary destinations.

## Known pressure points

- Cheshire remains the compatibility proxy for existing callers; the new
  runtime is not yet the default caller path.
- `dj/rassy.ts`, `scheduler.ts`, `track-intelligence.ts`, and DM service code
  are large; several production files still use `@ts-nocheck`.
- The shared typed channel/tool/artifact registry exists, but domain tool
  implementations and persistent artifact storage are still being migrated.
- The active tree has no pnpm workspace or single lockfile; service-local
  manifests and a service-local package lock remain.
- `docker-compose.yml` still wires `cheshire` as a required service and has
  insecure development fallback database URLs that must be removed before a
  production release.

## Baseline qualification

Full install/build/lint/test and live deployment qualification were not
claimed in this baseline pass. The next implementation milestone is the
typed `rassy-intelligence` seam and compatibility migration, followed by
focused tests before any service removal.
