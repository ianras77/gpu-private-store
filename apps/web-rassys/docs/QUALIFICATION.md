# Qualification record

Date: 2026-09-05

| Check | Result | Evidence / caveat |
|---|---|---|
| `git status`, root and history audit | PASS | Active source is parent `gpu-private-store`; unrelated sibling changes preserved. |
| source reconciliation audit | PARTIAL | Canonical remote `HEAD/main=6ca94ba159d...` and managed mirror were verified; exact package-level differences are recorded in `SOURCE-RECONCILIATION.md`. Clean upstream merge and deployment mirror update remain open. |
| `git diff --check` | PASS | No whitespace errors in the scoped app changes. |
| `docker compose config` | PASS | Configuration renders; expected warnings occur because protected Runtipi env was not loaded. |
| shared registry and intelligence TypeScript build | PASS | `pnpm run build` in `services/rassy-intelligence`. |
| Mastra runtime contract smoke | PASS | Health, protected agent lookup, and tool registry checks passed locally. |
| `pnpm audit --prod` for intelligence service | PASS | Fastify upgraded to patched 5.12.1; no known vulnerabilities reported. |
| intelligence Docker image build | PASS | `docker build -f services/rassy-intelligence/Dockerfile ...` completed. |
| radio-controller build | PASS | `pnpm run build` in `services/radio-controller`. |
| radio-controller tests | PASS | 16 files, 62 tests passed; Redis connection warnings came from the isolated notes test setup. |
| radio listener migration wiring | PASS | Controller build plus Compose wiring; live RassyMind-backed response not run without protected runtime credentials. |
| DM transport migration wiring | PASS | Web lint/build passed; state authority remains in the existing DM service. Live Mastra-backed turn not run without protected runtime credentials. |
| DM embedding migration wiring | PASS | Intelligence embedding endpoint compiles and safely returns degraded status when RassyMind is unavailable; web fallback remains. |
| radio enrichment migration wiring | PASS | Controller build and 62 tests passed; embeddings/rerank prefer intelligence service and retain null/direct fallbacks. |
| music librarian migration wiring | PASS | Registered agent plus controller integration compile; strict track insight schema and direct fallback remain. |
| public curio migration wiring | PASS | Web lint and production build passed; route target/schema validation and compatibility fallback remain. |
| agent registry consistency | PASS | Intelligence service consistency endpoint reported 14 registered agents with no missing channel references. |
| Mastra Postgres storage compilation | PASS | `@mastra/pg` 1.22.3 registered with dedicated schema and explicit `storage:init` command. |
| Mastra conversational memory wiring | PASS | Shared `@mastra/memory` instance is attached only to conversational agents when Postgres storage is configured; DM authoritative state remains separate. Live persistence remains pending restored database qualification. |
| intelligence readiness truthfulness | PASS | `/livez` remains independent; `/readyz` now performs a bounded authenticated RassyMind `/v1/models` probe and reports degraded readiness on upstream failure. |
| local intelligence runtime smoke | PASS | Built service returned livez 200, readiness 503 for unreachable RassyMind, registry consistency 200 with 14 agents, and channel generation now maps upstream model failure to 503. |
| live capability discovery contract | PASS | Protected `/v1/models/capabilities` now probes RassyMind `/v1/models`, reports discovered count without exposing model credentials, and degrades with 503 when unavailable. |
| pure channel authorization policy | PASS | Extracted policy to `services/rassy-intelligence/src/policy.ts`; compiled service plus public/home and anonymous/family policy smoke passed. |
| private channel context requirement | PASS | Canonical channel endpoint rejects missing trusted context for authenticated, family and admin channels before agent generation. |
| radio caller channel convergence | PASS | Radio listener preferred calls now use `/v1/channels/mr-rassy/chat`; registry ordering selects the radio listener agent while deterministic radio authority and legacy fallback remain intact. Core, radio build and 62 tests pass. |
| DM caller channel convergence | PASS | DM preferred narration now uses authenticated `/v1/channels/dungeon-master/chat` with campaign/session/user context; existing schema validation, locks, dice and Cheshire fallback remain intact. Web lint/build pass. |
| notebook caller channel convergence | PASS | Admin notebook drafting now uses the authenticated `notebook` channel boundary with trusted admin context, strict response parsing and existing authored-file/artifact behavior preserved. Web lint/build pass. |
| latest intelligence image build | PASS | Production Docker build now uses the workspace pnpm lockfile and completed as `web-rassys-rassy-intelligence:workspace`, image `sha256:a5190e620252...`. |
| web Docker dependency reproducibility | PASS | Web Dockerfile now installs through the canonical pnpm lockfile and Node 22 builder/runner; image build completed successfully. |
| typed radio selection module | PASS | Removed `@ts-nocheck` from `utils/selection.ts`, added explicit track/context types, and passed the radio build plus 62 tests. |
| production `@ts-nocheck` removal | PARTIAL | Selection is fully typed; the legacy scheduler, DJ, and Cheshire proxy remain explicitly suppressed. Removing scheduler suppression exposed broad implicit-shape errors, so the boundary is retained until behavior-preserving module extraction is completed. |
| Mastra storage database initialization | NOT RUN | Requires protected Postgres/Runtipi backup and restored test volume. |
| request-context validation | PASS | Shared Zod schema compiles; intelligence endpoint rejects malformed context before agent execution. |
| channel-scoped agent authorization | PASS | Generate endpoint now rejects agents not registered for the request channel and protects family/admin channels using trusted context permissions. |
| AI health compatibility seam | PASS | Web deep health now treats Rassy Intelligence and legacy Cheshire as alternative AI providers; optional legacy outage no longer masks a healthy migrated runtime. |
| canonical channel chat boundary | PASS | Intelligence exposes `/v1/channels/:channelId/chat`, resolves the registered agent deterministically, validates request context, and applies channel authorization before generation. |
| public curio caller migration | PASS | Easter-egg generation now calls the canonical `home` channel boundary first, with schema validation and legacy Cheshire fallback retained for rollout safety. |
| insecure Compose defaults removed | PASS | Database and Postgres password defaults are now empty; deployment requires Runtipi-managed secrets instead of `rassy:password`/`password`. Compose still renders with explicit missing-secret warnings only. |
| canonical RassyMind Compose route | PASS | Web and radio default `RASSYMIND_BASE_URL` to `http://host.docker.internal:8844`; Cheshire is no longer in the Compose service graph. Compose rendering and intelligence/radio builds pass. |
| Cheshire runtime removal | PASS (source) | Cheshire was removed from the Compose service graph; the web deep-health contract now treats `rassy-intelligence` as the sole AI runtime. Compatibility source remains fail-closed under the canonical-only default. Live managed runtime replacement is pending backup/deployment. |
| strict canonical migration switch | PASS | `RASSY_INTELLIGENCE_REQUIRE_CANONICAL=true` disables web, radio DJ, track analysis, embeddings and rerank compatibility calls for staging qualification while retaining rollback code; default remains false until live parity is proven. |
| required documentation set | PASS | README and architecture, identity, channels, agents, tools, workflows, RassyMind, channel, privacy, operations, deployment and rollback documents now exist and describe implemented or explicitly pending behavior. |
| patched Next.js runtime | PASS | Web upgraded from Next.js `15.5.12` to exact `15.5.24`; frozen workspace install, lint and production build passed. |
| workspace production audit | PASS | Patched Fastify 5.12.1, `music-metadata` 11.12.3, SWC 15.5.24, PostCSS 8.5.23 and sharp 0.35.0 overrides; `pnpm audit --prod` reports no known vulnerabilities. Radio, Minecraft and Cheshire builds pass after the dependency update. |
| unified `pnpm run qualify` | PASS | Frozen install, audit, intelligence/radio builds, 16 radio test files/62 tests, Minecraft and Cheshire builds, web lint and Next production build all completed successfully. |
| artifact persistence/API | PASS | Added non-destructive `rassy_artifacts` schema initialization and authenticated admin list/save route; web lint passed. |
| notebook artifact integration | PASS | Generated admin thought writes preserve canonical thought behavior and persist a linked `notebook-draft` artifact on success. |
| scoped pnpm workspace install | PASS | `pnpm install --frozen-lockfile` succeeded across 7 workspace projects; per-service package locks removed. |
| unified radio build/tests | PASS | Prisma generation plus radio build succeeded; 16 files and 62 tests passed. |
| intelligence Docker build | PASS | Workspace image built as `web-rassys-rassy-intelligence:workspace` (`ae9e703c...`). |
| radio Docker build | PASS | Workspace-lockfile Node 22 image built as `web-rassys-radio-controller:workspace` (`sha256:7519a8254ee5...`); Prisma emits its existing OpenSSL detection warning under Prisma 5.22 but compilation and image creation pass. |
| radio Docker dependency reproducibility | PASS | Radio Dockerfile now installs through the canonical pnpm lockfile and deploys a production dependency tree rather than running independent npm resolution. |
| web Docker build | PASS | Workspace-lockfile image built as `web-rassys-web:workspace` (`sha256:93c45332fb02...`); Next 15.5.24 build completed with expected missing-build-time-DATABASE_URL warnings only. |
| managed runtime inspection | PASS | Current live project is `web-rassys_gpu-private-store`; existing release has web/radio/minecraft/Postgres/Redis/Icecast/Liquidsoap/Cheshire and no intelligence service. |
| pre-deployment backup | BLOCKED/EXTERNAL | Supported backup attempts, including `/data/runtipi/runtipi-cli app backup web-rassys:gpu-private-store`, produced no backup artifact; `app list-backups web-rassys:gpu-private-store` reports none. The alternate bare app identifier is rejected as an invalid URN. No deployment was performed. |
| workspace web build | PASS | `pnpm run build:web` completed and emitted the full route manifest; no build-time failure. |
| full workspace install/build checks | PASS | Frozen workspace install, intelligence build, radio build/tests, and web lint/build completed in the reconciled subtree. |
| image build and live smoke | NOT RUN | Requires the managed Runtipi environment and protected credentials. |

No test marked NOT RUN is treated as passing. The new intelligence service is
an additive migration seam; legacy Cheshire removal and live qualification
remain required before a production cutover.
