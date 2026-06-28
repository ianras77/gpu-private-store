# Rassy Online Stage 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first installable Runtipi skeleton for `web-rassyonline`.

**Architecture:** Stage 1 creates a Next.js web service, Postgres, Qdrant, Runtipi metadata, compose wiring, persistent app-data mounts, and health endpoints. It does not implement auth, chat, document indexing, or admin yet, but it reserves the right service boundaries and environment names for later stages.

**Tech Stack:** Runtipi dynamic compose, Docker, Next.js App Router, TypeScript, Tailwind CSS, Postgres 16, Qdrant, Node 22.

---

## File Structure

- `config.json`: Runtipi app metadata and form fields.
- `docker-compose.yml`: Runtipi-compatible compose with `rassy-online-web`, `rassy-online-postgres`, and `rassy-online-qdrant`.
- `metadata/description.md`: Runtipi app description.
- `metadata/logo.svg`: Source vector logo for editing.
- `metadata/logo.jpg`: Required appstore logo asset generated from the SVG.
- `apps/web/Dockerfile`: Production Next.js build image.
- `apps/web/package.json`: Next app scripts and dependencies.
- `apps/web/next.config.mjs`: standalone output config for Docker.
- `apps/web/tsconfig.json`: TypeScript config.
- `apps/web/postcss.config.mjs`: Tailwind PostCSS config.
- `apps/web/tailwind.config.ts`: Tailwind theme config.
- `apps/web/src/app/layout.tsx`: Root document metadata and shell.
- `apps/web/src/app/page.tsx`: Stage 1 visual shell and capability placeholders.
- `apps/web/src/app/api/health/route.ts`: Health endpoint used by Docker/Runtipi.
- `apps/web/src/app/globals.css`: Magical base visual system.
- `apps/web/src/lib/config.ts`: Server-side environment helpers.
- `apps/web/src/lib/runtipi-health.ts`: Health result helper.
- `README.md`: Operator notes for Stage 1.

## Task 1: Runtipi Metadata

**Files:**
- Create: `config.json`
- Create: `metadata/description.md`
- Create: `metadata/logo.svg`
- Create: `metadata/logo.jpg`

- [ ] **Step 1: Add Runtipi app metadata**

Create `config.json` with app id `web-rassyonline`, exposed port `3199`, dynamic config, and form fields for public URL, auth secret, bootstrap admin email, RassyCodex base URL, API key, registration policy, upload limits, Postgres password, and Qdrant API key.

- [ ] **Step 2: Add app description**

Create `metadata/description.md` describing Rassy Online as the Runtipi-native RassyCodex interface with public chat, accounts, documents, vectors, and admin controls.

- [ ] **Step 3: Add initial logo assets**

Create a simple magical Rassy Online logo in `metadata/logo.svg`, then generate `metadata/logo.jpg`.

- [ ] **Step 4: Commit metadata**

Run:

```bash
git add apps/web-rassyonline/config.json apps/web-rassyonline/metadata
git commit -m "feat: add rassy online runtipi metadata"
```

Expected: commit succeeds.

## Task 2: Next.js Stage 1 App Shell

**Files:**
- Create: `apps/web/package.json`
- Create: `apps/web/next.config.mjs`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/postcss.config.mjs`
- Create: `apps/web/tailwind.config.ts`
- Create: `apps/web/src/app/layout.tsx`
- Create: `apps/web/src/app/page.tsx`
- Create: `apps/web/src/app/api/health/route.ts`
- Create: `apps/web/src/app/globals.css`
- Create: `apps/web/src/lib/config.ts`
- Create: `apps/web/src/lib/runtipi-health.ts`

- [ ] **Step 1: Create package and config files**

Create a Next.js App Router project with TypeScript, Tailwind, lint, build, and test placeholders.

- [ ] **Step 2: Create health helpers**

Implement health checks that return the configured app name, RassyCodex base URL, database URL presence, Qdrant URL presence, upload root, and stage marker.

- [ ] **Step 3: Create API health route**

Implement `/api/health` with JSON response and status `200` for Stage 1 when required env vars are present.

- [ ] **Step 4: Create magical app shell**

Create the first visual workbench screen with a mode constellation preview, Runtipi readiness panel, and clearly disabled placeholders for chat, auth, vectors, and admin.

- [ ] **Step 5: Commit app shell**

Run:

```bash
git add apps/web-rassyonline/apps/web
git commit -m "feat: scaffold rassy online web shell"
```

Expected: commit succeeds.

## Task 3: Docker And Compose

**Files:**
- Create: `apps/web/Dockerfile`
- Create: `docker-compose.yml`
- Create: `.dockerignore`
- Create: `README.md`

- [ ] **Step 1: Add production Dockerfile**

Use Node 22 Alpine, install dependencies with `npm ci`, build Next standalone output, and run `node server.js` as non-root.

- [ ] **Step 2: Add Runtipi compose**

Create `docker-compose.yml` with:

- `rassy-online-web`, main service on port 3000.
- `rassy-online-postgres`, private state DB.
- `rassy-online-qdrant`, private vector DB.
- app-data volumes under `${APP_DATA_DIR}/app-data/web-rassyonline/...`.
- `extra_hosts: host.docker.internal:host-gateway` on web.
- healthchecks for all services.
- `x-runtipi.schema_version: 2`.

- [ ] **Step 3: Add README**

Document Stage 1 startup, env defaults, and verification commands.

- [ ] **Step 4: Commit Docker/Runtipi skeleton**

Run:

```bash
git add apps/web-rassyonline/.dockerignore apps/web-rassyonline/docker-compose.yml apps/web-rassyonline/apps/web/Dockerfile apps/web-rassyonline/README.md
git commit -m "feat: add rassy online runtipi compose skeleton"
```

Expected: commit succeeds.

## Task 4: Verification

**Files:**
- Modify if needed based on verification failures.

- [ ] **Step 1: Install dependencies**

Run from `apps/web-rassyonline/apps/web`:

```bash
npm install
```

Expected: `package-lock.json` is created.

- [ ] **Step 2: Run web checks**

Run:

```bash
npm run lint
npm run build
```

Expected: both pass.

- [ ] **Step 3: Run compose config**

Run from `apps/web-rassyonline`:

```bash
docker compose config --quiet
```

Expected: exits 0.

- [ ] **Step 4: Run appstore validator**

Run from appstore root:

```bash
./scripts/validate-store.sh /data/runtipi/runtipi-appstore/gpu-private-store
```

Expected: validator passes or reports only unrelated pre-existing app issues.

- [ ] **Step 5: Commit lockfile and fixes**

Run:

```bash
git add apps/web-rassyonline
git commit -m "chore: verify rassy online stage 1 skeleton"
```

Expected: commit includes lockfile and verification fixes.

## Stage 1 Completion Report

Report:

- Files created.
- Verification commands and results.
- Any Runtipi validator caveats.
- Whether Stage 1 meets the spec gate.
- Next stage: auth, roles, and admin bootstrap.

