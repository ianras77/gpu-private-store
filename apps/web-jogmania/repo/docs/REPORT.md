# Jogmania Implementation Report

**Updated:** 2026-10-03
**Scope:** Outdoor Arcade source implementation across API, Mastra, web, iPhone, and native Watch.

## What changed

- Added durable runner preferences and snapshots plus persisted adventure cartridges, verified event logs, post-run recaps, and world changes.
- Added a private Mastra service with typed cartridge-director and run-storyteller workflows. Provider/model configuration is server-side; workflow failures fall back to authored copy.
- Made run progression pace-neutral: completed distance grants sparks; first course visits, returning to familiar courses, every-fifth-run attractions, and the first Watch link unlock keepsakes. Heart rate, calories, speed, and device type do not grant rewards.
- Connected all saved courses to the same growing arcade, so choosing a new trail still lights the runner's world.
- Added four distance-triggered Watch story beats, preference-controlled haptics, cached mission/context support, and an on-Watch retry queue for finished workouts.
- Allowed course-based uploads to save when GPS trace data is missing. Workout metrics and progression still save; the map simply has no trace for that run.
- Added real-time story beats to the iPhone capture path and a persistent arcade chapter, level, lights, runner preferences, and grounded run postcards across iPhone/web screens.
- Added a pixel-art arcade scene whose marquee changes as real runs light the shared world, plus an iPhone home action and pull-to-refresh for the next adventure.
- Added an auditable, versioned progression ledger with idempotent reason codes, a keepsake catalogue, level milestones, and historical-reward backfill migration.
- Added runner feedback and tone controls; a runner can say a story missed, steer later copy, and clear story memory without deleting runs or earned items.
- Added a typed Mastra trend interpreter with evidence-ID validation, and a durable recap outbox so a deterministic postcard is saved before optional model enrichment.
- Added asynchronous invite-code crews and a shared arcade reopening project. Members contribute through ordinary runs while other runners' course, distance, pace, and workout IDs remain private.
- Added Watch pause/resume and finish-while-paused controls. HealthKit heart-rate and energy collection is opt-in and defaults off; location/distance capture remains part of run recording.
- Replaced the browser cabinet's fake workout submissions with a local no-save practice game. It no longer fabricates GPS traces or writes toy rounds into the real run/reward ledger.
- Reworked older route adventure language and generated events so heart-rate and pace surges no longer create pulse gates, sprint gates, bosses, or rewards.
- Updated the README, Watch guide, and vision plan to describe one product and make source implementation distinct from hardware qualification.

## Product boundary

The API owns workouts, evidence, beat validation, progression, rewards, and world state. Mastra receives aggregate counts/history, recent-run median distance and duration, coarse current workout distance and duration, preapproved story events, and evidence records; it never receives raw GPS coordinates, pace, or heart-rate samples. Mastra may choose words, not facts or reward outcomes. Offline cartridges and deterministic recap copy keep the run usable without a model response.

## Verification status

Source gates run for this implementation pass:

- API integration suite: 17 tests passed, including workout persistence, ledger/idempotency, privacy-safe parties, feedback, and recap outbox enrichment.
- API Ruff undefined-name checks: passed.
- Web ESLint and TypeScript checks: passed.
- iPhone Expo TypeScript check: passed.
- Mastra strict TypeScript check: passed.
- Mastra service smoke check with a dummy provider URL: startup passed, `/healthz` returned 200, and an unauthenticated workflow request returned 401. This does not qualify model output.
- Web production build: passed.
- Alembic offline SQL generation through `0010_story_outbox`: passed.

The following release evidence is still outstanding because it requires production-like infrastructure, macOS/Xcode, configured model access, or real runner review:

- Apply migrations `0007`–`0010` to a disposable copy of the current PostgreSQL database and prove legacy workouts/rewards survive the upgrade.
- Run the Mastra service against the selected provider/model and inspect structured output, timeout behavior, invalid-output fallback, and all golden-run scenarios in [GOLDEN_RUNS.md](GOLDEN_RUNS.md).
- Bootstrap/build the native Apple project on macOS, then pair an iPhone and physical Apple Watch to qualify HealthKit permission flows, live beat distances/haptics, pause/resume, no-network capture, saved-run retry, GPS dropout, and duplicate uploads.
- Complete a real run and show the same verified event log, recap, sparks, and visible world light across Watch, iPhone, and web.
- Have runners review voice, accessibility, world art, reward cadence, and the fun of first-run, familiar-route, comeback, easy-intention, and short-outing stories.
- Apply the app-store deployment and migration path, then verify the deployed API, Mastra worker, and clients end to end.

The software source pass is complete. Watch gameplay, live Mastra personalization, production migration, and deployment are not represented as hardware-qualified or released until those gates pass.
