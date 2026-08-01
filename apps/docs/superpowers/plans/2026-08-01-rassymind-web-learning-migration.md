# RassyMind Web and Learning App Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recover `rassy.online`, migrate every active `web-*` model integration to RassyMind, then migrate the relevant `learning-*` integrations and prove all Runtipi runtime layers agree.

**Architecture:** RassyMind remains the single host gateway on port `8844`. Runtipi packages expose `RASSYMIND_*` or app-prefixed `*_RASSYMIND_*` settings, while third-party protocol variables receive those values internally. Rollout is staged through Rassy Online, the rest of the web family, and finally the learning family, with a live proof gate between stages.

**Tech Stack:** Runtipi schema v2 packages, Docker Compose, TypeScript/Next.js/Vitest, Python/pytest, Cheshire Cat bootstrap scripts, OpenAI- and Ollama-compatible RassyMind APIs, PostgreSQL, Qdrant, Playwright.

---

## File Structure

- `scripts/validate-rassymind-apps.py`: canonical static validator for RassyMind form variables, gateway defaults, retired names, and supported model aliases.
- `web-rassyonline/apps/web/src/lib/rassymind.ts`: RassyMind mode catalog, endpoint construction, SSE parsing, and embedding client.
- `web-rassyonline/apps/web/src/lib/runtipi-health.ts`: dependency status using the `rassymind` key and RassyMind environment names.
- `web-rassyonline/config.json`, `docker-compose.yml`, `metadata/description.md`, `README.md`: current Runtipi and operator contract.
- Other `web-*/config.json`, `docker-compose.yml`, application clients, bootstrap scripts, tests, and active docs: consumer-specific RassyMind wiring.
- `learning-*/config.json`, `docker-compose.yml`, and active descriptions: learning-family wiring or accurate supporting-service descriptions.

Historical files under existing `docs/superpowers/` trees are excluded from mechanical renaming because they describe prior designs. All current operational documentation is included.

### Task 1: Replace the Static Contract Validator

**Files:**
- Create: `scripts/validate-rassymind-apps.py`
- Delete: `scripts/validate-rassycodex-apps.py`

- [ ] **Step 1: Write the failing RassyMind validator**

Create the new validator by preserving the existing app enumeration and adding these exact rules:

```python
RETIRED_NAMES = ("RASSYCODEX", "RASSYGPT")
RASSYMIND_KEY_SUFFIX = "_RASSYMIND_API_KEY"
ALLOWED_MODELS = {
    "rassy-smart", "rassy-mind", "rassy-code", "rassy-fast",
    "rassy-utility", "rassy-embed", "rassy-embed-query",
    "rassy-rerank", "rassy-stt", "rassy-tts",
}
```

For each active file returned by the migration scan, fail on retired names. Require every direct consumer's form fields to expose either `RASSYMIND_API_KEY` or an app-prefixed variable ending in `_RASSYMIND_API_KEY`. Require container-facing defaults to contain `host.docker.internal:8844`. Do not require gateway fields for `learning-minio` or `learning-qdrant`.

- [ ] **Step 2: Run the validator and confirm it fails on the current tree**

Run:

```bash
python3 scripts/validate-rassymind-apps.py
```

Expected: non-zero with retired-name and missing-RassyMind-setting failures for current web and learning consumers.

- [ ] **Step 3: Remove the retired validator only after the new failure is reproduced**

Run:

```bash
git rm scripts/validate-rassycodex-apps.py
```

- [ ] **Step 4: Commit the regression guard**

```bash
git add scripts/validate-rassymind-apps.py scripts/validate-rassycodex-apps.py
git commit -m "test(appstore): define RassyMind integration contract"
```

### Task 2: Migrate Rassy Online's Application Client

**Files:**
- Create: `web-rassyonline/apps/web/src/lib/rassymind.ts`
- Create: `web-rassyonline/apps/web/src/lib/rassymind.test.ts`
- Delete: `web-rassyonline/apps/web/src/lib/rassycodex.ts`
- Delete: `web-rassyonline/apps/web/src/lib/rassycodex.test.ts`
- Modify: `web-rassyonline/apps/web/src/app/api/chat/route.ts`
- Modify: `web-rassyonline/apps/web/src/app/api/documents/route.ts`
- Modify: `web-rassyonline/apps/web/src/app/page.tsx`
- Modify: `web-rassyonline/apps/web/src/app/admin/page.tsx`
- Modify: `web-rassyonline/apps/web/src/components/chat-workbench.tsx`
- Modify: `web-rassyonline/apps/web/src/lib/chat-intents.ts`
- Modify: `web-rassyonline/apps/web/src/lib/chat-intents.test.ts`
- Modify: `web-rassyonline/apps/web/src/lib/chat-presentation.ts`
- Modify: `web-rassyonline/apps/web/src/lib/chat-presentation.test.ts`
- Modify: `web-rassyonline/apps/web/src/lib/markdown.test.ts`

- [ ] **Step 1: Write failing canonical-mode and URL tests**

The new test must assert this catalog and endpoint behavior:

```ts
expect(CHAT_MODES.map(({ id, model }) => [id, model])).toEqual([
  ["general", "rassy-smart"],
  ["deep-coding", "rassy-code"],
  ["fast-coding", "rassy-fast"],
  ["quick", "rassy-utility"],
  ["knowledge", "rassy-mind"],
]);
expect(getRassyMindChatUrl("http://host.docker.internal:8844/"))
  .toBe("http://host.docker.internal:8844/v1/chat/completions");
expect(getRassyMindEmbeddingsUrl("http://host.docker.internal:8844/"))
  .toBe("http://host.docker.internal:8844/v1/embeddings");
```

- [ ] **Step 2: Run the focused test and verify the new module is missing**

```bash
npm --prefix web-rassyonline/apps/web test -- --run src/lib/rassymind.test.ts
```

Expected: FAIL because `./rassymind` does not exist.

- [ ] **Step 3: Implement the RassyMind client**

Move the SSE parser and embedding behavior into `rassymind.ts`. Use only:

```ts
const baseUrl = process.env.RASSYMIND_BASE_URL ?? "http://host.docker.internal:8844";
const apiKey = process.env.RASSYMIND_API_KEY;
```

Rename exported URL helpers to `getRassyMindChatUrl` and `getRassyMindEmbeddingsUrl`. Preserve `embedTexts` and `extractDeltaFromSseLine`. Error messages must say `RassyMind` and must never include the key.

- [ ] **Step 4: Update all imports, visible text, and route environment reads**

Replace internal `rassycodex` module/type/function names with `rassymind`. Replace current user-visible model-stack text with `RassyMind`, while retaining `Rassy Online` as the product name.

- [ ] **Step 5: Run the complete Rassy Online unit suite**

```bash
npm --prefix web-rassyonline/apps/web test
npm --prefix web-rassyonline/apps/web run lint
```

Expected: all Vitest tests pass and TypeScript emits no errors.

- [ ] **Step 6: Commit the application-client migration**

```bash
git add web-rassyonline/apps/web
git commit -m "feat(web-rassyonline): migrate client to RassyMind"
```

### Task 3: Migrate Rassy Online's Health and Runtipi Package

**Files:**
- Modify: `web-rassyonline/apps/web/src/lib/runtipi-health.ts`
- Modify: `web-rassyonline/apps/web/src/lib/runtipi-health.test.ts`
- Modify: `web-rassyonline/config.json`
- Modify: `web-rassyonline/docker-compose.yml`
- Modify: `web-rassyonline/metadata/description.md`
- Modify: `web-rassyonline/README.md`
- Modify: `web-rassyonline/apps/web/public/manifest.webmanifest`

- [ ] **Step 1: Change the health test first**

Require this health input and output:

```ts
const env = {
  RASSY_ONLINE_PUBLIC_BASE_URL: "https://rassy.online",
  RASSYMIND_BASE_URL: "http://host.docker.internal:8844",
  DATABASE_URL: "postgresql://user:secret@postgres/db",
  QDRANT_URL: "http://qdrant:6333",
  RASSY_ONLINE_UPLOAD_ROOT: "/app-data/uploads",
};
expect(buildHealthReport(env).dependencies.rassymind.configured).toBe(true);
expect(buildHealthReport(env).missing).not.toContain("RASSYMIND_BASE_URL");
```

- [ ] **Step 2: Verify the focused health test fails**

```bash
npm --prefix web-rassyonline/apps/web test -- --run src/lib/runtipi-health.test.ts
```

Expected: FAIL because the current report exposes `rassycodex`.

- [ ] **Step 3: Implement the health contract**

Rename the dependency key to `rassymind`, require `RASSYMIND_BASE_URL`, and preserve URL-password redaction.

- [ ] **Step 4: Update package settings and Compose**

Use these form fields:

```json
{
  "label": "RassyMind Base URL",
  "env_variable": "RASSYMIND_BASE_URL",
  "default": "http://host.docker.internal:8844"
}
```

```json
{
  "label": "RassyMind API Key",
  "env_variable": "RASSYMIND_API_KEY",
  "required": true
}
```

Compose must pass only `RASSYMIND_BASE_URL` and `RASSYMIND_API_KEY` to the web service. Keep the auth, Postgres, and Qdrant secrets required. Increment `version` from `0.1.4` to `0.1.5` and `tipi_version` from `3` to `4`.

- [ ] **Step 5: Update current package documentation and manifest text**

All current documentation must describe RassyMind, the canonical aliases, and the absence of image generation.

- [ ] **Step 6: Verify package and tests**

```bash
npm --prefix web-rassyonline/apps/web test
npm --prefix web-rassyonline/apps/web run lint
docker compose --env-file /data/runtipi/app-data/gpu-private-store/web-rassyonline/app.env -f web-rassyonline/docker-compose.yml config --quiet
python3 scripts/validate-rassymind-apps.py
```

Expected: unit/type checks pass; Compose validates after supplying the required RassyMind variable in a sanitized temporary env if the live env has not yet migrated; the fleet validator still fails only on not-yet-migrated packages.

- [ ] **Step 7: Commit package migration**

```bash
git add web-rassyonline
git commit -m "feat(web-rassyonline): publish RassyMind settings"
```

### Task 4: Repair and Prove Rassy Online Live

**Files:**
- Modify outside Git: `/data/apps/rassymind/.env`
- Modify outside Git: `/data/runtipi/user-config/gpu-private-store/web-rassyonline/app.env`
- Synchronize: `/data/runtipi/apps/gpu-private-store/web-rassyonline`
- Regenerate: `/data/runtipi/apps/gpu-private-store/web-rassyonline/docker-compose.generated.yml`
- Verify: `/data/runtipi/app-data/gpu-private-store/web-rassyonline/app.env`

- [ ] **Step 1: Capture secret-safe baselines**

Record only presence, lengths, and SHA-256 hashes for the current RassyMind and Rassy Online secrets. Record the installed package version, Runtipi status, generated build context, and current `502` public result.

- [ ] **Step 2: Confirm the auth-secret boundary hypothesis minimally**

Compare variable presence across the Runtipi-managed configuration response, user-config env, and app-data env without printing values. Expected: the auth secret exists in app-data but not in the form state used by lifecycle validation.

- [ ] **Step 3: Rotate the disclosed gateway key**

Generate a 64-hex-character secret with:

```bash
openssl rand -hex 32
```

Store it as `RASSYMIND_API_KEY` in `/data/apps/rassymind/.env`, remove active predecessor-key entries, restart only the RassyMind edge as prescribed by `/data/apps/rassymind/Makefile`, and verify authenticated `/ready` plus `/v1/models`. Never echo the value.

- [ ] **Step 4: Repair Runtipi-managed required values**

Set `RASSY_ONLINE_AUTH_SECRET`, `RASSYMIND_API_KEY`, `RASSYMIND_BASE_URL`, Postgres password, and Qdrant key through Runtipi's managed app configuration path. Reuse valid application-specific secrets; only the gateway key is rotated.

- [ ] **Step 5: Update and start the namespaced app**

```bash
/data/runtipi/runtipi-cli app update web-rassyonline:gpu-private-store
/data/runtipi/runtipi-cli app start web-rassyonline:gpu-private-store
```

If installed files remain stale, synchronize the committed package into the installed tree using the established root-capable copy path, regenerate Compose, then retry once.

- [ ] **Step 6: Wait on conditions, not fixed sleeps**

Poll until all three services are healthy or a bounded timeout expires. On failure, inspect Runtipi lifecycle errors and service health without dumping prompts, request bodies, or secrets.

- [ ] **Step 7: Run backend and public probes**

Verify local `http://127.0.0.1:3199/api/health`, public `https://rassy.online`, authenticated chat, embeddings with `dimensions == 4096`, Qdrant access, and a document retrieval round trip.

- [ ] **Step 8: Run rendered QA using Playwright**

Browser plugin is unavailable, so use the existing package manager and a temporary Playwright script outside the repository. Test desktop and mobile page identity, meaningful DOM, no framework overlay, console health, anonymous chat, registration/sign-in when enabled, document upload/use, search toggle, and admin dependency status. Store screenshots under `/tmp` only.

- [ ] **Step 9: Commit any evidence-driven application fix separately**

If live proof reveals a code defect, first add a failing Vitest or Playwright reproduction, make the smallest fix, rerun the failed flow, and commit with a focused message. Do not bundle unrelated polish.

### Task 5: Migrate the Remaining Web Packages

**Files:**
- Modify active files reported by:

```bash
rg -l -i --hidden --glob '!**/.git/**' --glob '!**/node_modules/**' \
  --glob '!**/docs/superpowers/**' 'rassycodex|rassygpt' web-*
```

- [ ] **Step 1: Keep the validator failing while migrating one consumer style at a time**

Order the sweep as OpenAI-compatible, Ollama-compatible, Cheshire-backed, then documentation-only. Do not modify unrelated application behavior.

- [ ] **Step 2: Migrate OpenAI-compatible packages**

Rename app-facing fields and defaults to `RASSYMIND_*` or app-prefixed equivalents. Pass values into required `OPENAI_*` variables internally. Use `/v1`, canonical model aliases, and `host.docker.internal:host-gateway`.

- [ ] **Step 3: Migrate Ollama-compatible packages**

Rename app-facing fields to RassyMind and point required upstream `OLLAMA_*` variables at `http://host.docker.internal:8844`. Use canonical aliases and authenticated API-key injection supported by each client.

- [ ] **Step 4: Migrate every Cheshire bootstrap path**

Update these known bootstrap entrypoints plus any new scan hits:

```text
web-rasies/bootstrap_cat_ollama.py
web-lickingvape/repo/scripts/configure_cat_ollama.py
web-totallyrighteoustales/repo/ops/bootstrap_cat_ollama.py
web-rassyapp/repo/ops/bootstrap-cat.py
web-usmender/repo/services/cat/bootstrap/auto_configure_ollama.py
```

Ensure both chat and embedding providers receive the RassyMind key and canonical aliases.

- [ ] **Step 5: Update active metadata and versions**

Replace current descriptions and labels with RassyMind. Increment each changed app's `tipi_version` by one and bump its package version using its established patch convention.

- [ ] **Step 6: Run focused package tests**

At minimum:

```bash
pytest -q web-bat/apps/api/src/tests/test_cat_client.py web-bat/apps/api/src/tests/test_packaging_config.py
npm --prefix web-rasies/server run test:ci
npm --prefix web-rassyonline/apps/web test
python3 scripts/validate-rassymind-apps.py
git diff --check
```

Expected: all pass and the active-file scan has no retired contract names.

- [ ] **Step 7: Commit the source-family migration**

```bash
git add web-* scripts/validate-rassymind-apps.py
git commit -m "feat(web-family): migrate integrations to RassyMind"
```

### Task 6: Roll Out and Prove the Web Family

**Files:**
- Synchronize installed/runtime layers for every changed `web-*` package.

- [ ] **Step 1: Propagate the rotated RassyMind key safely**

Use Runtipi-managed settings or private user-config env for each direct consumer. Verify hashes only.

- [ ] **Step 2: Update apps sequentially**

Use `/data/runtipi/runtipi-cli app update <app>:gpu-private-store` one app at a time. Preserve whether each app was running before migration; do not start intentionally dormant packages.

- [ ] **Step 3: Verify all six runtime layers per app**

Compare source and installed `config.json`, generated Compose variables/build contexts, user-config/app-data variable names, container environment names without values, container health, and exact public/local endpoints.

- [ ] **Step 4: Exercise each direct consumer**

Run an authenticated chat or embedding request from the actual consuming container. Cheshire-backed apps must prove the sidecar provider configuration rather than only gateway reachability.

- [ ] **Step 5: Recheck Rassy Online after fleet updates**

Repeat public page load, anonymous chat, console health, and a document-backed response to catch shared-key or gateway regressions.

### Task 7: Migrate the Learning Family

**Files:**
- Modify: `learning-airflow/config.json`, `docker-compose.yml`, `metadata/description.md`
- Modify: `learning-label-studio/config.json`, `docker-compose.yml`, `metadata/description.md`
- Modify: `learning-mlflow/config.json`, `docker-compose.yml`, `metadata/description.md`
- Modify: `learning-wandb/config.json`, `docker-compose.yml`, `metadata/description.md`
- Modify documentation only as appropriate: `learning-minio/config.json`, `metadata/description.md`, `learning-qdrant/config.json`, `metadata/description.md`

- [ ] **Step 1: Migrate direct consumers**

Use app-prefixed fields such as `AIRFLOW_RASSYMIND_API_KEY`, `AIRFLOW_RASSYMIND_API_BASE`, `LABEL_STUDIO_RASSYMIND_API_KEY`, and `LABEL_STUDIO_RASSYMIND_API_BASE`. Internally map those values to the third-party variables each product understands.

- [ ] **Step 2: Correct supporting-service documentation**

MinIO and Qdrant do not gain gateway settings. Their current metadata should describe their supporting role for RassyMind-backed learning workflows without claiming direct inference calls.

- [ ] **Step 3: Increment learning package versions**

Increment `tipi_version` and follow each package's existing patch-version convention.

- [ ] **Step 4: Validate source**

```bash
python3 scripts/validate-rassymind-apps.py
rg -n -i --hidden --glob '!**/.git/**' --glob '!**/docs/superpowers/**' 'rassycodex|rassygpt' learning-*
git diff --check
```

Expected: validator passes; the scan returns no active references.

- [ ] **Step 5: Commit learning migration**

```bash
git add learning-* scripts/validate-rassymind-apps.py
git commit -m "feat(learning-family): migrate integrations to RassyMind"
```

### Task 8: Roll Out Learning Apps and Complete Verification

**Files:**
- Synchronize installed/runtime layers for changed `learning-*` packages.

- [ ] **Step 1: Update only the scoped learning packages**

Run namespaced Runtipi updates sequentially and preserve prior running/dormant state.

- [ ] **Step 2: Recheck known persistence constraints**

Confirm Label Studio's mounted data remains writable by UID `1001:0`. Confirm Qdrant has its required private env materialized even when it has no form secrets.

- [ ] **Step 3: Exercise direct consumers**

From Airflow, Label Studio, MLflow, and W&B containers, prove authenticated RassyMind reachability using their configured protocol without exposing the key.

- [ ] **Step 4: Run the final proof bundle**

```bash
python3 scripts/validate-rassymind-apps.py
npm --prefix web-rassyonline/apps/web test
npm --prefix web-rassyonline/apps/web run lint
npm --prefix web-rasies/server run test:ci
pytest -q web-bat/apps/api/src/tests/test_cat_client.py web-bat/apps/api/src/tests/test_packaging_config.py
git diff --check
```

Also verify authenticated RassyMind `/ready`, `/v1/models`, chat, 4,096-dimension embeddings, rerank, Runtipi installed status, container health, and exact public endpoints.

- [ ] **Step 5: Review for secret disclosure**

Inspect tracked diffs and captured output for key-shaped values. Rotate again immediately if any replacement key was printed or committed.

- [ ] **Step 6: Commit any final test-only adjustments**

```bash
git add -u
git commit -m "test(appstore): verify RassyMind rollout"
```

Skip this commit when there are no tracked changes.

- [ ] **Step 7: Present final runtime evidence**

Report source commits, installed versions, Runtipi statuses, container health, Rassy Online rendered QA, gateway endpoint results, tests, and any intentionally dormant apps. Do not claim completion if any required live proof is missing.
