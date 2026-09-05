# Qualification status

## Passed

- canonical/vendored source locations recorded;
- optional chart points exposed additively;
- deterministic fact graph build and tests;
- life-handbook planning omission behavior;
- intelligence and API TypeScript builds;
- Prisma schema validation with a supplied validation-only `DATABASE_URL`;
- additive migration present.
- deterministic synastry fact graph and tests;
- compatibility and weekly workflow contracts registered in the Mastra registry;
- report-run API selects natal, compatibility, or weekly workflows with kind-specific validation;
- API tests remain passing after workflow selection changes.
- legacy `reading-core` provider selection now fails closed unless explicitly opted into, with RassyMind route tests.
- Chart Companion thread/message API exists with authenticated ownership checks and deterministic fact-only prompts.
- Chart Companion memory listing, toggle, deletion endpoints, and Report Atlas controls are implemented.
- required lore inventory, RAG behavior, and brand-lens documents are present.
- full workspace lint passed (16 tasks);
- full workspace tests passed (26 tasks; API 7 files / 31 tests);
- full workspace build passed (16 tasks, including all five web applications);
- legacy `AstrologyReportArtifact` to `ReadingOutput` adapter test passed;
- mobile TypeScript check passed with the native UI entry point;
- Docker Compose rendering passed with pinned Qdrant and migration-based startup;
- no active `prisma db push`, `accept-data-loss`, or `qdrant:latest` references remain in the deployment configuration; the legacy bind-mounted Compose still performs runtime dependency installation/builds and is not the immutable production path.
- source-sync verifier runs and reports the expected canonical/vendored drift without silently overwriting either checkout.
- live RassyMind edge catalog probe authenticated successfully and exposed `rassy-fast`, `rassy-mind`, `rassy-utility`, `rassy-embed`, and `rassy-rerank`;
- live plain chat smoke test succeeded for `rassy-fast`.
- immutable `infra/Dockerfile.api` build passed, including Swiss Ephemeris compilation and Prisma generation;
- parameterized `infra/Dockerfile.web` builds passed for all five brands: Jupiterseek, Malefic Me, Oracle Veil, Saturn Leo, and Saturnseer.

## Not yet qualified

- live RassyMind structured inference;
- live structured-output qualification remains open: the edge returned HTTP 501 (`requested capability is not qualified on the available local providers`) for JSON response-format probes on `rassy-fast`, `rassy-mind`, and `rassy-utility`;
- Mastra package safety/version selection;
- durable report execution and streaming;
- production Postgres migration execution;
- complete Qdrant lore inventory and migration comparison;
- five-brand Report Atlas browser proof;
- mobile real-device/user-flow proof and Playwright proof;
- Runtipi image deployment using the qualified Dockerfiles (the Dockerfiles themselves build successfully).

The Playwright command was attempted on 2026-09-05 and failed before application assertions because no web servers were listening on `localhost:3000`, `3001`, `3002`, or `3003` (`ERR_CONNECTION_REFUSED` / one 60-second locator timeout). This is an environment-only result, not browser qualification.
