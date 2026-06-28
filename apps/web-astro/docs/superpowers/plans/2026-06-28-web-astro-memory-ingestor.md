# Web Astro Memory Ingestor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Promote the existing esoterica indexing script into a tested web-astro memory ingestor that scans `/data/runtipi/media/data/web-astro`, embeds supported materials, stores them in Qdrant, and exposes dry-run/status/admin controls.

**Architecture:** Keep the first version native to `@astro/api`: a reusable ingestion library owns scanning, extraction, chunking, manifest state, embedding, Qdrant upsert, and status. The existing script becomes a thin CLI wrapper, the API exposes token-gated controls, and Cheshire Cat can later adapt to these endpoints without becoming a new runtime dependency.

**Tech Stack:** TypeScript, Vitest, Fastify, OpenAI-compatible embeddings, Qdrant HTTP API, `pdf-parse`, `epub2`, Docker Compose/Runtipi.

---

## File Structure

- Create `repo/apps/api/src/lib/esoterica-ingestor.ts`: reusable memory ingestor with injectable filesystem/embed/Qdrant dependencies for tests.
- Create `repo/apps/api/src/lib/__tests__/esoterica-ingestor.test.ts`: TDD coverage for scanning, dry-run, manifest skipping, Qdrant payloads, and status.
- Modify `repo/apps/api/scripts/index-esoterica.ts`: replace duplicated script logic with a CLI call into `runEsotericaIngest`.
- Modify `repo/apps/api/src/routes/lore.ts`: add token-gated `POST /v1/lore/ingest` and `GET /v1/lore/status`.
- Modify `repo/apps/api/src/server.ts`: call the ingestor directly for scheduled refresh instead of spawning `pnpm`.
- Modify `repo/apps/api/package.json`: add `esoterica:dry-run`.
- Modify `docker-compose.yml`: mount `${ROOT_FOLDER_HOST}/media/data/web-astro` at `/esoterica:ro`.

---

### Task 1: Extract Tested Ingestor Core

**Files:**
- Create: `repo/apps/api/src/lib/esoterica-ingestor.ts`
- Test: `repo/apps/api/src/lib/__tests__/esoterica-ingestor.test.ts`

- [ ] **Step 1: Write failing tests**

Create tests that import `scanSupportedFiles`, `chunkTextForIngest`, `buildChunkId`, `planEsotericaIngest`, and `runEsotericaIngest`.

The tests must assert:
- recursively scans `.pdf`, `.epub`, `.txt`, `.md`, `.markdown` and ignores unsupported files;
- chunking overlaps words deterministically;
- dry-run reports files and estimated chunks without calling embedding or Qdrant;
- unchanged files are skipped when manifest entries match;
- successful ingest writes a manifest/status file and sends Qdrant points with `source`, `sourcePath`, `title`, `text`, `tags`, `contentHash`, and `chunkIndex`.

Run:

```bash
pnpm --dir repo --filter @astro/api test -- src/lib/__tests__/esoterica-ingestor.test.ts
```

Expected: FAIL because `../esoterica-ingestor` does not exist.

- [ ] **Step 2: Implement minimal ingestor**

Create `esoterica-ingestor.ts` with:
- `SUPPORTED_EXTENSIONS`
- `scanSupportedFiles(sourceDir)`
- `cleanTextForIngest(text)`
- `chunkTextForIngest(text, maxWords = 850, overlap = 140)`
- `buildChunkId(sourcePath, contentHash, chunkIndex)`
- `planEsotericaIngest(options)`
- `runEsotericaIngest(options)`
- `readEsotericaIngestStatus(options)`

The implementation must:
- read `ESOTERICA_SOURCE_DIR`, `ESOTERICA_INDEX_PATH`, `ESOTERICA_EMBED_BASE_URL`, `ESOTERICA_EMBED_MODEL`, `QDRANT_URL`, and `QDRANT_COLLECTION` by default;
- support `dryRun`;
- write `ingest-manifest.json` and `ingest-status.json` beside the resolved index path;
- skip unchanged files using `relativePath`, `size`, `mtimeMs`, and `contentHash`;
- create Qdrant collection on first embedding dimension;
- upsert batches of Qdrant points;
- optionally write JSONL when `ESOTERICA_WRITE_JSONL=1`.

- [ ] **Step 3: Run focused tests**

Run:

```bash
pnpm --dir repo --filter @astro/api test -- src/lib/__tests__/esoterica-ingestor.test.ts
```

Expected: PASS.

---

### Task 2: Wire CLI, Scheduler, and Lore Routes

**Files:**
- Modify: `repo/apps/api/scripts/index-esoterica.ts`
- Modify: `repo/apps/api/src/routes/lore.ts`
- Modify: `repo/apps/api/src/server.ts`
- Modify: `repo/apps/api/package.json`
- Test: `repo/apps/api/src/routes/__tests__/lore.integration.test.ts`

- [ ] **Step 1: Write failing route tests**

Create integration tests for:
- `GET /v1/lore/status` returns `503` when admin token is missing;
- `GET /v1/lore/status` returns `401` for a wrong token;
- `GET /v1/lore/status` returns status JSON for a good token;
- `POST /v1/lore/ingest` accepts `{ "dryRun": true }` and returns an ingest summary for a good token.

Run:

```bash
pnpm --dir repo --filter @astro/api test -- src/routes/__tests__/lore.integration.test.ts
```

Expected: FAIL because routes are missing.

- [ ] **Step 2: Implement routes and wrappers**

Update `lore.ts` to reuse the existing token parsing/auth behavior for `/audit`, `/status`, and `/ingest`.

Update `index-esoterica.ts` so it imports `runEsotericaIngest` and passes:

```ts
{
  dryRun: process.argv.includes("--dry-run") || process.env.ESOTERICA_DRY_RUN === "1",
  writeJsonl: process.env.ESOTERICA_WRITE_JSONL === "1"
}
```

Update `server.ts` so `runEsotericaRefresh` calls `runEsotericaIngest({ writeJsonl: process.env.ESOTERICA_WRITE_JSONL === "1" })` directly.

Add script:

```json
"esoterica:dry-run": "tsx scripts/index-esoterica.ts --dry-run"
```

- [ ] **Step 3: Run route and library tests**

Run:

```bash
pnpm --dir repo --filter @astro/api test -- src/routes/__tests__/lore.integration.test.ts src/lib/__tests__/esoterica-ingestor.test.ts
```

Expected: PASS.

---

### Task 3: Runtime Mount and Verification

**Files:**
- Modify: `docker-compose.yml`

- [ ] **Step 1: Update media mount**

Change the API volume from:

```yaml
- ${ROOT_FOLDER_HOST}/media/data/books/2-Collections/Esoterica:/esoterica:ro
```

to:

```yaml
- ${ROOT_FOLDER_HOST}/media/data/web-astro:/esoterica:ro
```

- [ ] **Step 2: Run full package tests/build**

Run:

```bash
pnpm --dir repo --filter @astro/api test
pnpm --dir repo --filter @astro/api build
pnpm --dir repo run build
```

Expected: PASS.

- [ ] **Step 3: Dry-run against real mounted source**

Run:

```bash
ESOTERICA_SOURCE_DIR=/data/runtipi/media/data/web-astro \
ESOTERICA_INDEX_PATH=/tmp/web-astro-esoterica-index \
ESOTERICA_DRY_RUN=1 \
pnpm --dir repo --filter @astro/api esoterica:dry-run
```

Expected: command reports supported files and estimated chunks without embedding.

- [ ] **Step 4: Commit, push, sync, redeploy, and smoke**

Run:

```bash
git status --short
git add docs/superpowers/plans/2026-06-28-web-astro-memory-ingestor.md docker-compose.yml repo/apps/api
git commit -m "Add web astro memory ingestor"
git push
rsync -a --exclude node_modules --exclude .pnpm-store --exclude .next --exclude dist /data/runtipi/runtipi-appstore/gpu-private-store/apps/web-astro/ /data/runtipi/apps/gpu-private-store/web-astro/
docker compose -p web-astro_gpu-private-store --env-file /data/runtipi/app-data/gpu-private-store/web-astro/app.env --env-file /data/runtipi/user-config/gpu-private-store/web-astro/app.env -f /data/runtipi/apps/gpu-private-store/web-astro/docker-compose.yml up -d --force-recreate
curl -fsS http://127.0.0.1:3200/healthz
```

Expected: commit and push succeed, containers become healthy, health returns `{"ok":true}`.

---

## Self-Review

- Spec coverage: The plan builds native API ingestion, dry-run, status, token-gated API control, Qdrant upsert, manifest state, the requested `/data/runtipi/media/data/web-astro` mount, and leaves Cheshire as a future adapter.
- Placeholder scan: No placeholder steps are present.
- Type consistency: Public functions and option names are defined in Task 1 and reused by Task 2.
