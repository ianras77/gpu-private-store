# RassyMind Web and Learning App Migration Design

## Objective

Make RassyMind the sole active model-stack contract for this custom Runtipi app store. Recover `web-rassyonline` first, prove its complete public user flow at `https://rassy.online`, then migrate the remaining `web-*` apps and finally the `learning-*` apps.

The migration removes active RassyCodex and RassyGPT naming, settings, and runtime wiring. It does not rename unrelated third-party compatibility variables such as `OPENAI_BASE_URL` or `OLLAMA_BASE_URL` when an upstream application requires those names, but their values and app-facing configuration must point to RassyMind.

## Scope and Order

The work is divided into three sequential, independently verifiable stages:

1. Recover and migrate `web-rassyonline`.
2. Apply the proven contract to every other `web-*` package.
3. Apply the proven contract to `learning-*` packages that consume or describe the model stack.

Historical design and implementation records remain historical records. Active source, tests, configuration, metadata, operational documentation, installed packages, generated Compose, environment layers, and running containers must use RassyMind terminology and settings.

Apps that do not call the model gateway directly need only accurate current documentation; they must not receive artificial gateway dependencies.

## Canonical RassyMind Contract

RassyMind is available to Linux containers at `http://host.docker.internal:8844`, with OpenAI-compatible consumers using `http://host.docker.internal:8844/v1`. Each calling service must include `host.docker.internal:host-gateway` when it does not already inherit equivalent reachability.

The primary secret is `RASSYMIND_API_KEY`. App-specific variables use the same naming pattern, for example `LABEL_STUDIO_RASSYMIND_API_KEY` and `AIRFLOW_RASSYMIND_API_BASE`. There are no active fallbacks to `RASSYCODEX_*` or `RASSYGPT_*` variables.

Canonical model aliases are:

- `rassy-smart` for deterministic general routing;
- `rassy-mind` for deep reasoning and agent work;
- `rassy-code` for coding and architecture;
- `rassy-fast` for low-latency chat;
- `rassy-utility` for summaries, classification, and background work;
- `rassy-embed` for document embeddings;
- `rassy-embed-query` when query-specific embedding behavior is required;
- `rassy-rerank` for bounded reranking;
- `rassy-stt` and `rassy-tts` for voice.

New configuration must not select legacy aliases merely because RassyMind can translate them. Image endpoints and image-model configuration must be removed because RassyMind deliberately does not provide image generation.

## Rassy Online Recovery

### Confirmed failure

`https://rassy.online` currently returns `502`, nothing listens on host port `3199`, and Runtipi reports `web-rassyonline` as stopped. Repeated lifecycle attempts fail before Compose startup with `Variable Auth Secret is required`. The installed package is version `0.1.3` / Tipi version `2`, behind the app-store source at `0.1.4` / Tipi version `3`.

The generated app-data environment contains an auth-secret entry, so recovery must trace why Runtipi's required-field validation does not see it. The likely boundary is the separation between Runtipi-managed form state, user-config overrides, and generated app-data env; implementation must confirm this hypothesis with a minimal lifecycle test before changing application code.

### Recovery behavior

The package will expose RassyMind fields in `config.json`, map them into the web service through generated Compose, and use RassyMind-named server modules and health output. Required Runtipi secrets must be present in the Runtipi-managed configuration layer so lifecycle validation succeeds; simply editing generated `app.env` is not sufficient proof.

Once the package starts, the recovery must validate:

- Postgres initialization and application migrations;
- Qdrant readiness and authenticated access;
- the Next.js server health endpoint and dependency report;
- anonymous chat and, where enabled, registration/sign-in;
- streaming chat through RassyMind;
- document upload, embedding, storage, retrieval, and scoped chat context;
- optional web-search behavior through `search.rasies.com`;
- admin diagnostics without secret disclosure;
- exact public routing at `https://rassy.online`.

Visible product text may continue to call the product “Rassy Online,” but model-stack text must say “RassyMind.” Internal module and type names should follow that contract so future maintenance does not reintroduce the retired name.

## Secret Handling

The prior gateway key appeared in diagnostic output during discovery. It must be treated as disclosed and rotated before rollout. The replacement must be generated outside Git, installed as RassyMind's accepted key, propagated to Runtipi consumer settings, and verified only by presence, length, or hash comparison. No verification command or report may print secret values.

Application-specific secrets such as the Rassy Online auth secret, Postgres password, and Qdrant key are preserved unless evidence shows they are invalid. Required missing Runtipi form state is repaired without needlessly replacing persisted application credentials.

## Fleet Migration

Each `web-*` and relevant `learning-*` package is classified by consumer style:

- OpenAI-compatible: `/v1/chat/completions`, `/v1/embeddings`, or `/v1/rerank`;
- Ollama-compatible: `/api/tags`, `/api/chat`, `/api/embed`, or `/api/embeddings`;
- Cheshire-backed: bootstrap scripts that configure chat and embedding providers;
- indirect/supporting: no direct gateway call, documentation only.

For each direct consumer, migration includes app-store fields, Compose variables, application defaults, bootstrap scripts, active documentation, tests, and version metadata. Cheshire bootstrap paths receive special verification because their provider configuration can retain stale auth and model values even when the main container env is correct.

Both `version` and `tipi_version` are incremented where required for Runtipi to recognize and install the update. Version changes must follow each package's existing convention.

## Runtime Synchronization

Source changes alone do not complete this migration. For each stage, synchronize and verify:

1. app-store source;
2. installed package under `/data/runtipi/apps/gpu-private-store/<app>`;
3. generated `docker-compose.generated.yml`;
4. Runtipi-managed form/user-config values;
5. app-data `app.env`;
6. live containers and public routes.

Runtipi lifecycle operations use the namespaced identifier `<app>:gpu-private-store`. Local build contexts must remain visible to Runtipi; existing `RUNTIPI_APP_BUILD_ROOT` behavior is preserved where required.

## Error Handling and Rollout Safety

Migration proceeds one stage at a time. A stage does not widen until its proof gate passes. Failed lifecycle actions are investigated from Runtipi logs, generated Compose, container state, and dependency health rather than retried blindly.

RassyMind overload responses such as `429` or `503` remain visible to applications with bounded, user-safe handling. Authentication failures must distinguish missing configuration from rejected credentials without echoing keys. Public failures must present a useful application error rather than a blank page or indefinite loading state.

Existing persistent Postgres, Qdrant, and application data are retained. Destructive resets are outside scope unless separately approved after a demonstrated data-level blocker.

## Testing and Proof Gates

### Rassy Online gate

- Runtipi status is stably running after lifecycle reconciliation.
- All three Compose services are healthy.
- Local port `3199` and `https://rassy.online` return the intended application.
- The rendered desktop and mobile interfaces have no framework overlay or relevant console errors.
- At least one anonymous chat completes through RassyMind.
- Registration/sign-in and authenticated history are exercised when registration is enabled.
- A document round trip proves 4,096-dimension RassyMind embedding compatibility and user-scoped retrieval.
- Search-enabled chat proves the optional search boundary without describing search as gateway-native.
- Admin health reports RassyMind, Postgres, and Qdrant status without exposing secrets.

### Web-family gate

- A repository regression scan finds no active RassyCodex or RassyGPT contract references under `web-*`.
- Package-specific tests pass for changed applications.
- Every installed direct consumer reaches the expected authenticated RassyMind endpoint from its container.
- Runtipi reports each previously running app as running and stable after update.
- Exact public hosts for exposed apps return the intended service.

### Learning-family gate

- A regression scan finds no active RassyCodex or RassyGPT contract references under `learning-*`.
- Direct consumers complete authenticated RassyMind probes appropriate to their protocol.
- Supporting services remain healthy without unnecessary gateway dependencies.
- Known persistence requirements, including Label Studio ownership and Qdrant env materialization, remain satisfied.

### Final gate

- RassyMind `/ready`, models, chat, embeddings, and rerank probes pass with the rotated key.
- App-store source, installed packages, generated Compose, env layers, and live containers agree.
- No secret values appear in diffs, test output, or reports.
- Git diff checks and the app-store validators pass.

## Completion Criteria

The migration is complete only when Rassy Online works publicly and broadly, all active `web-*` model integrations use RassyMind exclusively, relevant `learning-*` integrations follow, and live Runtipi state matches the committed app-store contract. A source-only rename or a green internal health check without real user-flow proof is not completion.
