# Jogmania: Vision Review and Transformation Plan

**Status:** Product vision, implementation review, and remaining qualification plan  
**Review date:** 2026-10-03  
**Goal:** Turn real runs into a lively, personal, repeatable arcade adventure across Apple Watch, iPhone, and web.

## Implementation snapshot

The source pass now connects saved runs to live cartridge beats, a deterministic first postcard, optional asynchronous Mastra enrichment, evidence-checked runner observations, versioned sparks and level awards, route-specific story chapters with keepsakes, a placeable arcade decoration set, a keepsake collection, and invite-based cooperative arcade projects. The native Watch source also persists an atomic run draft and reconnects HealthKit sessions after a crash. Runner feedback steers later copy; optional heart-rate and energy collection is off by default. Current source qualification passes web lint, typecheck, and production build; iPhone and Mastra TypeScript; Mastra's mocked golden workflow smoke; API undefined-name lint; migration SQL generation; and all 21 API tests (rerun inside the managed API image with temporary test dependencies and an in-memory SQLite test database). The updated web, API, and Mastra services are now deployed; API health is good and the live database is at migration `0011_arcade_decorations`. A real Mastra request reaches RassyMind but currently gets a retryable `context_accounting_unavailable` 503, so model voice quality remains unproven. Paired Watch behavior and runner delight still need device/user review. The browser game remains a no-save practice cabinet.

## The vision

Jogmania should make a runner feel that their familiar streets have become a playful world that knows them. Their real route is the level. Their effort changes the story. Their next run has a reason to exist. A watch glance delivers a small moment of arcade delight without asking the runner to stop, stare at a screen, or chase an unsafe target. Afterward, Jogmania tells a warm, specific story about what happened, shows how the world changed, and gives the runner something they are excited to bring along next time.

This is **Atari adventure energy**: bold shapes, simple rules, surprising creatures, collectible treasures, readable action, and a wink. The game should feel welcoming to somebody who has never played an RPG. No stat spreadsheet is the main event. Detailed charts may exist for runners who want them, but the first thing they see is a world, a moment, and a reason to smile.

### The player promise

> “Jogmania noticed *my* run, made it an adventure while I was out there, and left my world a little more alive when I got home.”

Each run should deliver four feelings:

1. **I know what I am heading into.** Pick a route or let Jogmania make an easy, sensible suggestion; see a one-screen mission card.
2. **Something fun is happening now.** The watch gives a few well-timed, glanceable story beats as the real run unfolds.
3. **It understood what I did.** The recap points to a real moment or change in this runner's own history, in plain language.
4. **My effort mattered to the world.** A level, character, collection, or place visibly changes; the next adventure has a personal hook.

## Review of the current product

### What was here before the transformation pass

- A distinctive retro arcade identity and an explicit “run IRL, play the course” hook on the marketing page.
- A Next.js web portal, Expo iPhone app, FastAPI API, shared TypeScript packages, and a native SwiftUI watchOS companion.
- Real native watch capture: HealthKit workout session, GPS/route points, distance, energy, and heart-rate samples. The watch can choose an active course and upload a completed workout.
- A useful base of durable game concepts: routes/courses, route instances, adventure summaries, parties, worlds, world events, rewards, and inventory.
- Deterministic route signals for climbs, turns, pace surges, and heart-rate moments; run maps and replays can show where some of these happened.
- An existing web arcade simulation and some course/reward/party surfaces that can be shaped into a broader game.

These were good ingredients, but the original product stopped short of a complete running game loop. The implementation snapshot at the top of this review records what this pass has since connected and what remains unqualified.

### Current state against the promise

| Area | Current state observed in source | Product consequence |
|---|---|---|
| Product direction | README, report, Watch guide, and product surfaces now describe the Outdoor Arcade and distinguish source capability from qualification. | The product has a shared canon; original art direction, voice review, and runner interviews remain. |
| Live run | Watch source prepares/caches a cartridge, plays four distance-triggered story beats with preference-controlled haptics, shows run progress, and queues completed uploads. iPhone capture also plays live beats. | Real gameplay exists in source. Pairing, battery, GPS dropout, glanceability, and retry behavior remain unqualified on hardware. |
| Watch Sync screen | Native Watch gameplay is the runner path; Expo Watch Sync is QA/import support. | There is a clear boundary between actual capture and simulation/import tooling. |
| Run understanding | Mastra has typed cartridge, trend-interpreter, and recap workflows behind an authenticated service. Trend and recap observations must select supplied evidence IDs; raw GPS, pace, HR, and energy samples stay out of prompts. A durable outbox retries enrichment while a useful fallback postcard is already saved. | The runner can correct the tone and clear story memory. Model quality and the golden-run set still require a configured runtime and human review. |
| Progression | The API writes a versioned ledger for run sparks, level changes, discoveries, familiarity, attractions, route chapter keepsakes, and the first Watch link. Awards are pace-neutral and idempotent per workout/reason. The collection explains keepsakes and their earning reasons. | Short runs still advance the story. Cosmetic placement and live economy balance still need design review. |
| World and visuals | Web and iPhone show the arcade, eight decoration slots, five authored props, and collection; an invite ticket lets a crew progress one shared “Grand Reopening” project asynchronously. Members see shared lights/project progress without another runner's workout ID, course ID, distance, or pace. | Cooperative and decoration flows are source-covered with API tests. Original sprite packs, animation, sound design, and paired-device usability remain. |
| Runner's voice | Preferences include story voice, intention, haptics, feedback correction, and an opt-in health-data switch that defaults off. Feedback changes later Mastra copy. | Accessibility and health-permission behavior still need physical-device qualification. |
| Current proof | Web lint, typecheck, and production build pass. iPhone and Mastra TypeScript pass. The Mastra golden smoke exercises real workflows against a deterministic OpenAI-compatible fixture and checks schemas plus evidence/event IDs. API undefined-name lint and offline migration generation pass; the API suite passes all 21 tests using the managed API image and an in-memory SQLite test database. The deployed API exposes adventure/profile/session, world decoration, route mastery, party, reward, and workout endpoints; API, web, and Mastra are healthy, and migrations reached `0011_arcade_decorations`. | The live Mastra request reaches RassyMind but receives retryable `context_accounting_unavailable` 503, so real-model voice review is open. No paired Apple Watch or human runner delight study has been qualified. |

At the original review baseline, the most important strategic gap was the missing bridge from **measured run → moment-to-moment play → personal meaning → lasting world change**. The first Lost Arcade slice now connects those stages in source. The open question is whether it feels surprising and delightful in a real run, which requires the qualification and runner-review work below.

### Evidence map

- Product copy and feature claims: [README](../README.md), [landing page](../repo/apps/web/src/app/page.tsx), and the older [implementation report](REPORT.md).
- Native watch UI and capture path: [watch screen](../repo/apps/ios/ios/JogmaniaWatchExtension/ContentView.swift), [run session](../repo/apps/ios/ios/JogmaniaWatchExtension/RunSessionStore.swift), and [Apple Watch setup guide](../repo/apps/ios/docs/APPLE_WATCH.md).
- Simulated iPhone QA flow: [Watch Sync tab](../repo/apps/ios/app/%28tabs%29/watch.tsx).
- Run interpretation and current model hook: [adventure generator](../repo/api/app/services/adventure_generator.py) and [API settings](../repo/api/app/core/config.py).
- Existing progression/world foundations: [progression service](../repo/api/app/services/progression.py), [world service](../repo/api/app/services/worlds.py), and [data model](../repo/api/app/models.py).
- Current post-run presentation: [overview](../repo/apps/web/src/app/%28dashboard%29/overview/page.tsx), [run detail](../repo/apps/web/src/app/%28dashboard%29/runs/%5Bid%5D/page.tsx), and [adventure replay](../repo/apps/web/src/components/AdventureReplay.tsx).

## Product rules

1. **Effort is the controller; pace is not the score.** Give credit for showing up, exploring, staying with a chosen intention, returning after a break, and improving relative to one's own history. Never make speed, calories, or high heart rate the price of a good story or a reward.
2. **The world reacts to the run, but it does not command the body.** No “sprint now,” “beat this pace,” route hazards to dodge in real life, or health diagnosis. Game hazards are visual metaphors, not navigation instructions. On-run prompts are optional, sparse, and safe to ignore.
3. **Mastra interprets; deterministic code decides.** Use Mastra to notice patterns and author bounded, structured plans and stories. Keep workout facts, event triggers, reward eligibility, inventory changes, and level completion in validated deterministic code so the experience is reproducible and auditable.
4. **Offline after Start.** A runner must be able to start a prepared mission and get its live beats without cellular service, an LLM response, or interaction with the phone.
5. **Personal without pretending.** Every statement about a run must be traceable to available data or something the runner told Jogmania. If GPS or sensor quality is weak, use a simpler story rather than confident invention.
6. **A run is a story, not a test.** No missed-day penalties, broken-streak shame, leaderboard pressure, or punishment for slow/short runs. A return after a break is a welcome-back moment.
7. **Arcade first; charts on request.** Keep the default vocabulary plain, funny, warm, and concrete. Put pace distributions and sensor detail behind an optional “show me the numbers” affordance.
8. **The runner owns the memory.** Ask what may be retained, store a small useful profile rather than a lifetime GPS transcript, and provide export, correction, and delete controls.

## The target loop

### Before the run: choose today's cartridge

- The home screen opens on the runner's world and one clear next action: **Play a run**.
- Offer one relevant mission card, not a wall of metrics. Examples: “Light the river path for 18 minutes,” “Find a new loop,” or “The lantern crew would love a visit.”
- Let the runner set an intention in ordinary language or a few friendly choices: easy wander, keep moving, explore, repeat a favorite, or surprise me. Do not require a pace target.
- Mastra uses an opt-in runner profile, selected route/course, recent run summaries, and the runner's intention to prepare a compact, typed “cartridge”: narrative skin, event schedule, accessibility settings, and optional reward opportunities.
- The phone transfers and caches the cartridge on the watch before the runner starts. If Mastra or the network is unavailable, a deterministic template produces a complete cartridge.

### During the run: a tiny arcade in the corner of the watch

- Keep the normal workout essentials instantly readable: elapsed time, distance, current/average pace when available, and heart rate only if the runner enabled it.
- Add one large, simple adventure state: a character moving along a short course strip, a world object filling, or a creature getting closer. Prefer chunky native shapes and a few expressive frames over small text or a tiny simulated console.
- Trigger a small number of moments from distance, elapsed time, route features, and trustworthy sensor events: a gate opens, a bridge appears, a token is found, a companion waves, the final room lights up. Use haptics and optional short audio; let users choose quiet mode and event frequency.
- A moment can acknowledge persistence, a hill, a steady stretch, an intentional easy run, or a new route. It must not pressure a harder effort. Never require a tap while the runner is moving.
- Keep the mission playable in airplane mode. Store event IDs and run state locally; sync the event log and captured workout idempotently when connectivity returns.

### After the run: show that Jogmania noticed

- Lead with a one-sentence “what happened” story tied to evidence: “You kept the lantern alive through the long climb, and this is the steadiest you've run that hill.” Only say that if the route match and supporting data really establish it.
- Replay the real route as a colorful, chaptered level: place beats at their actual distances, show the runner's route and a few memorable moments, then reveal the world change.
- Give three layers of detail: **story**, **moments**, and optional **numbers**. Do not make a dashboard the reward.
- Ask one optional, low-friction feeling question now and then (“How did that one feel?”). Use the answer to improve future missions, and show the runner when it meaningfully changes the plan.
- Grant a clear reward with a visible use: a new world tile, companion reaction, cosmetic, sound, collectible set, or chapter reveal. The runner should understand why it was earned.

### Between runs: a world that remembers kindly

- Make routes recurring levels and the runner's world a small, colorful place that gradually fills in: paths become landmarks, a clubhouse gains decorations, creatures return, and completed adventures unlock the next scene.
- Progress has several doors: showing up, route discovery, steady effort, personal improvement, returning, and helping a party/world. A runner can advance without being fast.
- Keep streaks forgiving. Prefer “you have visited this world 4 times” and comeback bonuses over expiring streaks.
- Make parties cooperative first: shared world goals can be advanced by each person's ordinary run; do not require synchronized runs or public pace comparisons.

## Mastra: make it the adventure director, not a title generator

At the original review baseline there was no Mastra package or service in the active Jogmania monorepo; the only model integration was an optional title request in the Python adventure generator. This pass has added the bounded service and its first two workflows. The rest of this section describes the intended next depth of runner understanding while FastAPI remains authoritative for workout, safety, and progression rules.

### Mastra workflows and typed tools

1. **Runner Snapshot workflow** — turn workout history into a compact, explainable profile: favorite routes, typical duration bands, consistency, route-specific trends, known preferences, and confidence/data quality. Store aggregate facts and provenance; do not persist raw location trails as conversational memory by default.
2. **Run Interpreter workflow** — compare the latest run to the runner's own relevant history. Return a schema of candidate observations, each with `claim`, `evidence_refs`, `confidence`, and `plain_language_reason`. Examples: first return to a route after a break, smoother middle section on a familiar course, new distance, or a steady finish. Null/low-quality signals produce no claim.
3. **Cartridge Director workflow** — select one playful story arc and emit a small validated event manifest: event kind, trigger rule, distance/time window, copy/audio key, haptic pattern, fallback, and allowed reward candidate. Use user-selected intent and presentation preferences. It writes no points and cannot change HealthKit settings or choose a real-world route.
4. **Run Recap workflow** — turn the verified workout facts, event log, history comparison, and optional runner feedback into a tight, warm recap and an optional next-run hook. Keep a source/evidence link on every performance claim; let the UI show plain prose while keeping proof inspectable.
5. **Worldkeeper workflow** — choose a suitable next chapter from curated world content based on completed events and unlocks. Return a proposal only; deterministic progression code validates whether the chapter can unlock.

Expose narrow tools such as `get_runner_snapshot`, `get_route_history`, `compare_route_effort`, `get_run_event_log`, `get_world_state`, and `propose_cartridge`. Define input/output schemas in shared contracts. Bound latency, context size, retries, and tokens. Persist workflow version, evidence refs, model/version, fallback state, and accepted result so every surprising moment can be explained and replayed.

### What “it understands my runs” should feel like

Jogmania should notice the *shape* and *meaning* of effort over time, not just restate distance and pace. It should be able to recognize a runner returning to a path, choosing an easy day after a hard week, exploring instead of repeating, making it up a hill more comfortably, becoming more consistent, pausing and then resuming, or finishing with more energy than they started. It should remember the runner's favorite kinds of missions and preferred level of chatter. It should say “I might be wrong” through softer language when evidence is incomplete.

Examples of playful moments:

- “The old footbridge is back. You made it across this hill twice now.”
- “No rush today. You kept the campfire glowing for the whole wander.”
- “A new path! Your map just grew a secret corner.”
- “You came back to the Crystal Steps after a while. The crew saved you the good lantern.”

Those lines are examples, not canned claims: the run history and event evidence must make each one true.

## Complete implementation plan

Work in this order. Each phase should leave a usable product slice and a clear acceptance gate.

### Phase 0 — Set the product canon

**Status:** Product canon, voice rules, first playable world, preference controls, and synthetic golden-run review set are written. Commissioned art direction and runner interviews remain.

- Replace the conflicting portal-only / watch-out-of-scope language with this unified vision. Mark every feature as **live**, **prototype**, **planned**, or **unverified on device**.
- Write a short world and voice guide: Pitfall/Atari-inspired chunky shapes, readable silhouettes, funny/warm writing, no faux-military HUD, no jargon-first copy, and sample reactions to easy days, hard days, breaks, firsts, and GPS loss.
- Choose the first end-to-end demo world and its content: one familiar loop, one small setting, a companion, 4–6 event beats, a visible between-run change, and a small reward collection. Create or commission cohesive pixel/vector assets rather than leaning on placeholder text.
- Define an initial runner preference card (intention, quiet/loud, haptic preference, adventure tone, health-data consent) and a minimal aggregate runner snapshot.
- Write the golden-run scenarios and success measures below before building Mastra prompts or adding rewards.

**Exit gate:** README, implementation report, Apple Watch guide, and product screens describe the same product and accurately distinguish source capability from hardware-qualified behavior. The first world's mechanics and copy can be reviewed without reading code.

### Phase 1 — Build one complete playable run

**Status:** Source loop includes live distance beats, offline upload queue, pause/resume, short-run fallback, and duplicate-safe progression. Crash recovery and physical-device acceptance remain unverified.

- Define versioned contracts for `RunnerSnapshot`, `Cartridge`, `RunEvent`, `RunSession`, `RunInsight`, `RewardDecision`, and `WorldChange`. Put shared public types in the shared package and authoritative validation in the API.
- Persist runner profiles and adventure sessions with course/intent, cartridge, verified event IDs, workout link, recap, and world change. Make workout creation retry-safe and idempotent.
- Build a local Watch gameplay state machine around a cached cartridge and live HealthKit/GPS stream. Start, finish, cached mission, missing-GPS course save, no-network upload retry, and pause/resume are implemented in source. Crash recovery remains unverified.
- Give the watch a strong 3-screen vocabulary: **mission**, **in-run**, and **finish**. During a run, show one bold game image/state and a glanceable cue with restrained haptics; keep workout essentials available. No tiny map, scrolling quest log, or forced interaction.
- Turn the iPhone's Watch Sync QA panel into clearly labeled developer/demo tooling. Add a real connected-watch status and a plain-language setup path; remove the stale “simulated until native target is ready” wording.
- Make one run travel end to end: choose a mission → transfer cartridge → play distance-triggered beats offline → upload workout and event log → show a colorful recap → award one deterministic cosmetic/world change → see that change next visit.
- For the first slice, use authored fallback content and deterministic analysis. This proves the loop before making the experience dependent on AI.

**Exit gate:** A runner can complete the first world loop on a paired physical Watch with the iPhone app closed and network disabled after start. The same workout can be retried without duplicate rewards. The web/iPhone recap shows the same event and world outcome.

### Phase 2 — Add runner understanding with Mastra

**Status:** Typed cartridge, trend, and recap workflows; evidence checks; feedback correction; memory clearing; and a retryable durable recap outbox are implemented. Provider quality and human-reviewed evaluation remain.

- Add a Mastra service/workspace using the official supported Mastra APIs for the selected installed version. Wire it behind an authenticated internal API boundary; store model credentials only in protected runtime configuration.
- Implement deterministic runner snapshots plus bounded Cartridge Director, Trend Interpreter, and Run Recap workflows with typed schemas. The model stays out of workout validation, safety decisions, event trigger execution, and reward writes. Curated chapter proposals remain deferred.
- Persist a useful deterministic recap with the workout first; the durable outbox enriches it later and retries provider failures without delaying capture or progression.
- Store runner preferences and explainable aggregate history. Keep raw GPS data only as required for route display/replay; exclude coordinates and precise health samples from prompts unless the runner explicitly opts into a clearly described use.
- Attach evidence refs and confidence to generated observations. Reject unsupported facts, medical claims, prescriptive exertion advice, repeat/copy spam, out-of-tone text, and tool/schema violations. Save the validated result plus provenance for replay and audit.
- Ask for lightweight feedback after selected runs and use it to correct tone/effort interpretation. Give users a “that doesn't sound like me” control that updates preference, not an opaque model score.

**Exit gate:** On a fixed runner-history set, Mastra produces materially different, fact-grounded mission/recap choices for different histories; every factual claim has evidence; invalid or unavailable Mastra cleanly falls back. Runners can inspect, edit, and delete the saved profile.

### Phase 3 — Make routes into levels and worlds into places

**Status:** First chapter arc, route returns/discovery, versioned reward ledger, level milestones, five visit-based route chapters with milestone keepsakes, curated keepsake display, eight decoration slots, world lights, and crew project progress are implemented. A wider authored asset catalog and live-economy balance remain.

- Replace arbitrary three equal-length segments as the primary level model with meaningful, repeatable course chapters based on route length, verified turns/climbs, and story pacing. Keep the map accurately anchored to physical distance.
- Introduce a curated content catalog: biomes, objects, companions, animations, sound/haptic cues, event copy, rarity, and unlock rules. Mastra selects and combines allowed pieces; it does not invent unshippable assets or endlessly rename generic hazards.
- Build a visible world map/arcade cabinet on iPhone and web. A run should leave a clear mark: repair a bridge, light a district, decorate a clubhouse, welcome a creature, or reveal a new route tile.
- Define a durable, versioned progression ledger with idempotent awards and clear reason codes. Separate XP/level milestones from inventory/cosmetics and from route mastery.
- Make multiple progression styles equally viable: exploration, consistency, personal best/effort trend, returning, gentle intention, and party contribution. Balance reward cadence so a short run can still produce a delightful moment.
- Give the post-run recap a “show me the adventure” replay: real map, actual run moments, game overlays, world change, and optional stats drawer.

**Exit gate:** A repeat route visibly evolves over several sessions; a new route produces discovery; two runners at different paces can both earn meaningful progression; each unlock's reason can be explained from the ledger.

### Phase 4 — Bring the world to life between people and runs

**Status:** Invite-based asynchronous crew projects, privacy-safe contribution events, copyable crew tickets, and leave controls are implemented. Rotating chapters and workout-source imports remain deferred.

- Add optional party projects with shared goals that count each member's ordinary activity, accessible contribution targets, privacy controls, and no public pace ranking by default.
- Add a friendly companion/collectible collection with simple animation and personality reactions grounded in the run; avoid an expensive, sprawling game economy.
- Add imports from other workout sources only after source identity, duplicate handling, GPS/sensor quality, and consent are well defined. Existing watch/iPhone capture remains a first-class path.
- Build seasonal or rotating chapters only when the base world loop is already replayable. No expiring progress or scarcity pressure.

**Exit gate:** A party can make shared progress asynchronously without exposing individual routes or paces; the user can leave a season or disable social surfaces without losing their world.

### Phase 5 — Qualify delight, safety, and delivery

**Status:** Synthetic golden-run scenarios are documented. API regression cases cover invented evidence IDs, unsafe exertion copy, course chapter keepsakes, and idempotency; all 21 tests pass when run in the managed API image against the in-memory SQLite test database. Current gates pass API undefined-name lint, web lint/typecheck/production build, iPhone TypeScript, Mastra strict TypeScript, mocked Mastra workflow smoke, and offline migration SQL generation. The managed web, API, and Mastra services are deployed and healthy; the live database is at revision `0011_arcade_decorations`, and the API exposes the new adventure, progression, and world endpoints. A real Mastra request reached RassyMind but received a retryable `context_accounting_unavailable` error, so model voice quality remains unproven. Paired Watch qualification and runner review remain open.

- Verify each declared product capability across source, installed iPhone build, physical paired Watch, backend persistence, and user-visible result. Do not call capture “gameplay” until live events and an after-run world change both work on hardware.
- Run the golden-run suite, offline/retry scenarios, sensor-dropout cases, tiny/short/easy runs, workout interruption, duplicate upload, time-zone/DST boundaries, and profile deletion/export flows.
- Qualify battery, GPS stability, HealthKit authorization messages, VoiceOver, large text, color contrast, one-hand readability, and haptic/audio controls.
- Evaluate on a mix of runner histories: beginner, fast, slow, short-run, long-run, trail/hills, route repeater, route explorer, irregular schedule, comeback, no-HR permission, and noisy GPS.
- Measure whether runners want another run because of the story/world, not only whether a request succeeded. Remove mechanics that create pressure or make the run feel like a data exam.

**Exit gate:** Hardware and backend gates are recorded separately, the model's groundedness and fallback behavior are demonstrated, reward writes are auditable/idempotent, and the world is enjoyable without an AI response.

## First shippable slice: “The Lost Arcade”

Start with one small world and one loop. The player takes a familiar route to relight an abandoned arcade. The Watch shows a bright little cabinet with a pixel lantern mouse. Four distance-based beats reveal the town: an old sign flickers on, a token rolls into the prize tin, the lantern mouse joins the trip, and the arcade marquee lights up. Beats work offline without a tap. The post-run replay traces verified moments on the real route; Mastra can make a personal observation only when a supplied history fact supports it. Each course visit adds sparks and lights an arcade feature; course and lifetime milestones unlock keepsakes and chapters. An easy-intention run lights the same world just as brightly as any other.

This slice deliberately connects capture, on-watch presentation, grounded intelligence, persistent progression, and art direction before the app grows more systems.

## Acceptance and product evidence

### Functional evidence

- `start → live play → finish → upload → recap → reward → world changed` works for phone and watch capture, including no network after mission start.
- Watch events are tied to actual elapsed distance/time or verified sensor observations; replay markers line up with the route and event log.
- Duplicate requests, app restarts, watch disconnection, and delayed sync do not duplicate workouts, events, inventory, or rewards.
- Removing or timing out Mastra does not block capture, finish, or deterministic rewards.

### “It knows me” evidence

- Create a versioned set of runner histories with deliberately contrasting patterns and a human-reviewed expected insight for each.
- The synthetic review shapes are recorded in [GOLDEN_RUNS.md](GOLDEN_RUNS.md); run them with and without Mastra before release and review outputs with runners.
- Require every personal claim to cite a run, route comparison, event, or explicit preference; require abstention on missing/noisy evidence.
- Review recap usefulness, specificity, kindness, and surprise with runners. “It repeated my stats” and “it guessed wrong about my body” are failures.
- Show how runner feedback changes later mission selection and allow clearing the memory.

### “It is fun” evidence

- A first-time runner understands what to do without learning RPG terms.
- The watch can be used with one glance and no mandatory taps while moving.
- Each short test run contains at least one charming moment, even without a personal best.
- Returning after a break is welcomed; missing runs never subtract progress.
- Watch test sessions include quiet/haptics-only mode and a no-HR-permission path.

### Health and privacy guardrails

- Do not reward high heart rate or calorie totals, and do not set model-generated pace/heart-rate targets.
- Treat sensor readings as uncertain; show fewer events when GPS/HR quality is poor.
- Keep any wellness recommendations outside the game narrator. The narrator may reflect supplied facts, not diagnose or prescribe.
- Make health-data use and retention opt-in, minimal, exportable, and deletable.

## Suggested measure set

Track product outcomes that indicate delight and understanding, not just API activity:

- **Playable-run completion:** percentage of started game sessions with at least one live beat, captured workout, recap, and visible world change.
- **Return by choice:** runners who voluntarily start another adventure within their own normal running rhythm; compare by mission style, not leaderboard rank.
- **Recognition quality:** runner ratings for “this sounds like my run” and “this feels personal,” plus unsupported-claim rate from review.
- **Moment quality:** watch event delivery success, dismiss/quiet preference, and optional fun rating. Do not optimize for prompt count.
- **Progression fairness:** reward distribution by pace band, run duration, and chosen intention; meaningful rewards must be available across each group.
- **Trust:** profile view/edit/delete completion, fallback clarity, and reports of pressure, shame, unsafe prompts, or false health claims.

## Review basis and limits

This review inspected the active source under `repo/repo`, the README, implementation report, Apple Watch guide, active API models/services/routes, and web/iOS/watch screens. The current session also verified web lint, typecheck, and production build; iPhone and Mastra TypeScript; Mastra mocked workflow smoke; API undefined-name lint; Watch template/source parity; bootstrap script syntax; whitespace; and all 21 API tests using a temporary test dependency install and in-memory SQLite. The managed API, web, and Mastra services are healthy; API health checks pass, the OpenAPI document exposes the adventure/world/progression paths, the six new story/progression tables exist, and the database is at `0011_arcade_decorations`. The live Mastra workflow reaches the configured RassyMind route but receives retryable `context_accounting_unavailable` 503 before generation. No paired Apple Watch, real-model voice review, or human runner study is qualified. The source, deployment, and mock workflow prove integration contracts, not device reliability or runner delight.
