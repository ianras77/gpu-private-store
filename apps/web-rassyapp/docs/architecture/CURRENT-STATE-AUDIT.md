# Rassy.app Current-State Audit

Audit date: 2026-08-23 (UTC)

This Phase 0 inventory records observed state. No source, data, or deployment mutation was made.

## Executive summary

The newest application source visible locally is this package's nested `repo/` checkout. It contains the newer Studio/Launchpad/Roblox/Rojo work, including catalog data, Studio libraries, Playground tabs, export routes, and focused tests. The separate clone of `ianras77/web-rassy.app` at `/data/apps/2-Migrated/web-rassy.app` is an older, smaller snapshot and does not contain that surface. The app-store package is therefore not yet a thin packaging layer.

The live Runtipi app is a single Next.js `app` container on port 3194 with Cheshire Cat and Qdrant sidecars. Its application database is SQLite. Docker health passes, but a host request to `/api/healthz` reset the connection during this audit, so endpoint behavior is not qualified by health alone.

## Source and repository truth

| Surface | Observed state | Conclusion |
|---|---|---|
| Package checkout | `/data/runtipi/runtipi-appstore/gpu-private-store/apps/web-rassyapp` | `gpu-private-store`, branch `main`; clean for this app path. The shared worktree has unrelated dirty `web-rassyonline` changes, left untouched. |
| Application source | `repo/` | Next.js 14.2.35, Prisma 5.x, Cat integration, workspaces/routines, Studio/Launchpad/Roblox/Rojo implementation. Newest locally observed product source. |
| Package remote | `https://github.com/ianras77/gpu-private-store.git` | Packaging repository. Recent app history includes `af6021cd Add Rojo Studio handoff for Rassyapp`. |
| Candidate canonical clone | `/data/apps/2-Migrated/web-rassy.app` | Remote `https://github.com/ianras77/web-rassy.app.git`, commit `2564ea0`; older initial snapshot. No Studio/Launchpad/Rojo/Roblox implementation found. |
| Installed mirror | `/data/apps/gpu-private-store/web-rassyapp` | Root-owned managed mirror containing packaging files and nested `repo/`; top-level compose differs from source compose. |
| Installed Runtipi tree | `/data/runtipi/apps/gpu-private-store/web-rassyapp` | Root-owned installed copy; compose checksum matches the managed mirror, not source compose. |

`repo/` has product files absent from the candidate canonical clone: `lib/studio/`, `data/roblox-catalog/`, Studio API routes, Studio/World Forge/Game Sections/Asset Shelf tabs, and Rojo/game tests. These require a careful port before making `web-rassyapp` thin packaging. No port was attempted.

## Deployment and runtime

```text
web-rassyapp_gpu-private-store-app-1
  image: runtipi-local-web-rassyapp-app:latest
  status: Up, healthy
  published port: 3194 -> 3000
  created: 2026-08-15T20:28:51Z
```

The current compose makes `app` depend on `cheshire-cat-core` and defines a Qdrant sidecar. The app receives `DATABASE_URL=file:/data/dev.db`, Cat base URLs, and an `APP_SESSION_SECRET` with the inspected live fallback `change-me`. Credential values were not recorded.

Observed sidecars:

```text
web-rassyapp_gpu-private-store-cheshire-cat-core-1  healthy
web-rassyapp_gpu-private-store-cheshire-cat-vector-memory-1  running
```

The Docker health check passes by polling internal `/api/healthz`, but `curl http://127.0.0.1:3194/api/healthz` reset the connection. This needs later deployment investigation.

## Persistent state and secrets

Data root: `/data/runtipi/app-data/gpu-private-store/app-data/web-rassyapp/`

```text
named/prisma-data/dev.db       245760 bytes (SQLite)
named/cat-data/metadata.json   2233 bytes
named/qdrant-storage/          Qdrant raft and alias state present
named/cat-plugins/             compose-mounted Cat plugin state
named/cat-static/              compose-mounted Cat static state
```

The Prisma schema retains `User`, `Session`, threads/messages, personas, memory, workspaces, sessions/runs/presence, routines, and Studio project concepts. Cat and Qdrant state are separate persistence and must not be removed during migration.

Secrets are supplied through Runtipi environment layers and container environment. Values are intentionally omitted. Package metadata currently requires `RASSYMIND_API_KEY` and exposes RassyMind-oriented settings.

## Current capabilities

Evidence from source and tests:

- Next.js web UI/API; auth, threads/messages, personas, workspaces, routines, and memory concepts.
- Cheshire Cat HTTP/WebSocket integration and Cat plugin/memory routes.
- Studio/Launchpad domain work, Roblox catalog data, Rojo export, and handoff UI.
- `npm run test:ci`: **PASS**, 6 files and 26 tests.

Not present or not proven:

- Provider-neutral model contract/adapters; direct Cat-independent conversation engine.
- Postgres or verified SQLite export/import; app-owned worker, LangGraph runtime, tool runner, approvals, artifacts.
- Provider switching, Cat-disabled operation, worker crash recovery, and Roblox end-to-end build artifact proof.
- User-facing health response, because the host request reset.

## Build evidence

From `repo/`, `npm run build` compiled successfully and reached type checking, then failed during page-data collection for `/playground` because `CAT_HTTP_BASE` was unset in the local shell. The failure is environment-sensitive and must be addressed or documented before Phase 1 acceptance.

## Preservation and rollback

No destructive operation, migration, checkout, force push, or deployment was performed. SQLite, Cat data, Qdrant data, installed mirrors, and Git history remain in place. Before persistence or deployment changes, create and verify backups and restore instructions. The two source trees are not content-equivalent.

## Phase 0 decision

Treat `repo/` as the newest locally observed product source for reconciliation, while preserving `/data/apps/2-Migrated/web-rassy.app` as the intended canonical-repository candidate. The next safe action is a file-level merge plan and verified backup, not overwriting either tree.
