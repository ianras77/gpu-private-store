# Rojo Studio Handoff Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the existing Launchpad studio into a working Rojo-first game maker handoff path where one active kid project can export a Roblox Studio package without Launchpad owning Roblox account auth.

**Architecture:** Launchpad remains the game-making source of truth. The backend compiles the saved `StudioProjectSummary` into a canonical project spec, reviewed Luau modules, Rojo project files, review docs, and a zip download. Roblox Studio and Rojo own local sync and publishing.

**Tech Stack:** Next.js App Router, TypeScript, Vitest, existing Prisma studio summary, existing local zip helper, Rojo v7 project format, Luau files generated from approved Launchpad modules.

---

### Task 1: Rojo Export Compiler

**Files:**

- Create: `repo/lib/studio/rojo-export.ts`
- Test: `repo/tests/rojo-export.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, it } from "vitest";
import { buildRojoExportPackage } from "@/lib/studio/rojo-export";

it("builds a Rojo project package from the saved studio project", () => {
  const pkg = buildRojoExportPackage(sampleProject);
  expect(pkg.filename).toBe("sky-hopper-adventure-rojo.zip");
  expect(pkg.entries.map((entry) => entry.name)).toContain("default.project.json");
  expect(pkg.entries.map((entry) => entry.name)).toContain(
    "src/ReplicatedStorage/Launchpad/ProjectSpec.lua"
  );
});
```

- [ ] **Step 2: Verify red**

Run: `npm test -- tests/rojo-export.test.ts`

Expected: fail because `@/lib/studio/rojo-export` does not exist.

- [ ] **Step 3: Implement compiler**

Create a focused compiler that:

- sanitizes project names for zip filenames,
- emits `default.project.json`,
- emits `launchpad.manifest.json`,
- emits `README.md`,
- emits `review/build-plan.md`,
- emits Luau modules under `src/ReplicatedStorage/Launchpad`,
- emits small server/client bootstrap scripts,
- includes project checks for missing template/world/assets.

- [ ] **Step 4: Verify green**

Run: `npm test -- tests/rojo-export.test.ts`

Expected: test file passes.

### Task 2: Authenticated Export API

**Files:**

- Create: `repo/app/api/studio/rojo-export/route.ts`
- Modify: `repo/tests/routes.test.ts`

- [ ] **Step 1: Write failing route auth test**

Import `GET` from the route and assert unauthenticated requests return `401`.

- [ ] **Step 2: Verify red**

Run: `npm test -- tests/routes.test.ts`

Expected: fail because route file does not exist.

- [ ] **Step 3: Implement route**

The route loads the current workspace and studio summary, builds the package, and returns:

- `?format=json` as a preview payload,
- default zip response with `application/zip` and attachment filename.

- [ ] **Step 4: Verify green**

Run: `npm test -- tests/routes.test.ts`

Expected: route tests pass.

### Task 3: Studio Handoff UI

**Files:**

- Create: `repo/components/playground/studio-handoff-tab.tsx`
- Modify: `repo/components/playground/playground-shell.tsx`

- [ ] **Step 1: Add the tab**

Add a core `handoff` tab labeled `Studio Handoff`.

- [ ] **Step 2: Build the UI**

The tab should show the current project, template, world recipe, asset shelves, Rojo package expectations, and a download button pointing to `/api/studio/rojo-export`.

- [ ] **Step 3: Keep advanced Roblox auth out**

Copy should tell users Studio handles Roblox login/publish. Do not add OAuth or API-key forms.

### Task 4: Designer Handoff

**Files:**

- Create: `repo/docs/handoffs/kids-ux-design-brief.md`

- [ ] **Step 1: Write the UX brief**

Create a designer-facing brief that explains the kid-app visual direction, stable controls, templates, previews, safety posture, and what the backend handoff now enables.

### Task 5: Version, Validation, Deploy

**Files:**

- Modify: `config.json`
- Possibly sync installed copy under `/data/runtipi/apps/gpu-private-store/web-rassyapp`

- [ ] **Step 1: Bump `version` and `tipi_version`**

Runtime-facing feature changes require a real app version bump.

- [ ] **Step 2: Run verification**

Run:

- `npm test`
- `npm run build`
- `jq . config.json`
- `docker compose config` with representative Tipi env

- [ ] **Step 3: Commit and push intended files only**

Commit the web-rassyapp files, avoiding unrelated dirty app changes.

- [ ] **Step 4: Update live Runtipi app**

Sync installed copy if stale, rebuild/update the live app, then verify container health and `/api/healthz`.
