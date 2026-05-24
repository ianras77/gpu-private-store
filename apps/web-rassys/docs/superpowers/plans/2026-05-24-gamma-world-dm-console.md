# Gamma World DM Console Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Promote the Gamma World DM module from a buried dashboard into a playable terminal-first experience and repair reference seeding so the LLM can use the packaged Gamma World corpus.

**Architecture:** Keep the existing Next.js route, API routes, Postgres-backed DM service, SSE stream, and Cheshire lane. Add a focused terminal UI layer in `/dungeon-master`, use the existing context preview endpoint for the DM information display, and adjust compendium seeding to refresh old template-only installs.

**Tech Stack:** Next.js 15, React 19, TypeScript, Tailwind CSS, Postgres, Cheshire/RassyGPT gateway, Node smoke tests.

---

### Task 1: Add Failing Smoke Tests

**Files:**
- Create: `apps/web/scripts/dm-console-smoke.mjs`
- Create: `apps/web/src/lib/dm/reference-seed.test.ts`
- Modify: `apps/web/package.json`

- [ ] **Step 1: Write the DM console source smoke**

Create a script that reads `apps/web/src/app/dungeon-master/page.tsx` and fails until the route contains stable terminal anchors:

```js
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const page = fs.readFileSync(path.resolve(__dirname, "../src/app/dungeon-master/page.tsx"), "utf8");
const required = [
  "data-testid=\"gamma-terminal-screen\"",
  "data-testid=\"dm-command-line\"",
  "data-testid=\"dm-context-display\"",
  "Gamma Terminal"
];

for (const token of required) {
  if (!page.includes(token)) {
    console.error(`DM console smoke failed: missing ${token}`);
    process.exit(1);
  }
}

console.log("DM console smoke ok");
```

- [ ] **Step 2: Write the reference seed policy test**

Create a small TypeScript test for a pure `shouldRefreshGammaCompendium()` helper:

```ts
import assert from "node:assert/strict";
import { shouldRefreshGammaCompendium } from "./reference-seed";

assert.equal(shouldRefreshGammaCompendium({ existingCount: 0, expectedCount: 4 }), true);
assert.equal(shouldRefreshGammaCompendium({ existingCount: 4, expectedCount: 4 }), false);
assert.equal(shouldRefreshGammaCompendium({ existingCount: 4, expectedCount: 128 }), true);
assert.equal(shouldRefreshGammaCompendium({ existingCount: 200, expectedCount: 128 }), false);

console.log("DM reference seed policy ok");
```

- [ ] **Step 3: Wire tests into `npm test`**

Update `apps/web/package.json` so `npm test` runs the existing smoke test and `dm-console-smoke.mjs`.

- [ ] **Step 4: Verify RED**

Run:

```bash
cd apps/web
npm test
npx tsc --module commonjs --moduleResolution node --target ES2022 --esModuleInterop --skipLibCheck --types node --outDir /tmp/web-rassys-dm-tests --rootDir src src/lib/dm/reference-seed.ts src/lib/dm/reference-seed.test.ts
```

Expected: `npm test` fails because the terminal anchors do not exist, and `tsc` fails because `shouldRefreshGammaCompendium` is not exported.

### Task 2: Repair Gamma World Reference Seeding

**Files:**
- Modify: `apps/web/src/lib/dm/reference-seed.ts`

- [ ] **Step 1: Export the refresh helper**

Add:

```ts
export const shouldRefreshGammaCompendium = ({
  existingCount,
  expectedCount
}: {
  existingCount: number;
  expectedCount: number;
}) => expectedCount > existingCount;
```

- [ ] **Step 2: Replace the early return**

Build the packaged rows first, count existing `gamma-world` rows, and skip only when `existingCount >= rows.length`. Otherwise upsert all rows.

- [ ] **Step 3: Verify GREEN for seed policy**

Compile the test and run:

```bash
node /tmp/web-rassys-dm-tests/lib/dm/reference-seed.test.js
```

Expected: `DM reference seed policy ok`.

### Task 3: Build the Gamma Terminal UI

**Files:**
- Modify: `apps/web/src/app/dungeon-master/page.tsx`
- Modify: `apps/web/src/app/globals.css`

- [ ] **Step 1: Add terminal state and context preview loading**

Track selected actor, context preview payload, loading/error state, and a debounced request to `/api/dm/campaigns/:id/context`.

- [ ] **Step 2: Convert log entries into a terminal feed**

Render latest events in play order inside a fixed-height scrollable handheld screen. Preserve roll, system, and story tones.

- [ ] **Step 3: Add command line**

Place actor selection, prompt input, quick actions, and send button directly under the transcript. Pressing Enter submits and Shift+Enter inserts a newline.

- [ ] **Step 4: Add information display**

Inside the same terminal shell, show world state, current objective, compendium hit count, recent turn count, pinned fact count, semantic memory count, and top compendium names when available.

- [ ] **Step 5: Demote old panels**

Keep party, quests, inventory, dice, and rules lookup as support modules beneath or beside the terminal. Remove duplicate "Prompt the world" card from the old lower layout.

- [ ] **Step 6: Add handheld CSS**

Add `.dm-handheld`, `.dm-lcd`, `.dm-terminal-line`, `.dm-context-grid`, and related classes with responsive constraints, no text overlap, and a restrained green/amber palette distinct from the wider rave site theme.

- [ ] **Step 7: Verify GREEN for UI smoke**

Run:

```bash
cd apps/web
npm test
```

Expected: existing smoke and DM console smoke pass.

### Task 4: Full Verification and Rollout

**Files:**
- Modify: `config.json`

- [ ] **Step 1: Run static/build checks**

Run:

```bash
cd apps/web
npm run lint
npm run build
```

- [ ] **Step 2: Rendered Playwright QA**

Use Playwright against `http://127.0.0.1:3187/dungeon-master` or a local dev server. Capture desktop and mobile screenshots and check no framework overlay, no console errors, and visible terminal anchors.

- [ ] **Step 3: Bump version**

Set `config.json` to `version: 1.0.14` and `tipi_version: 16`.

- [ ] **Step 4: Commit and push**

Stage only `web-rassys` files and commit:

```bash
git add apps/web/src/app/dungeon-master/page.tsx apps/web/src/app/globals.css apps/web/src/lib/dm/reference-seed.ts apps/web/src/lib/dm/reference-seed.test.ts apps/web/scripts/dm-console-smoke.mjs apps/web/package.json config.json docs/superpowers/specs/2026-05-24-gamma-world-dm-console-design.md docs/superpowers/plans/2026-05-24-gamma-world-dm-console.md
git commit -m "Improve Gamma World DM terminal"
git push
```

- [ ] **Step 5: Sync and redeploy Runtipi**

Sync the updated appstore package to `/data/runtipi/apps/gpu-private-store/web-rassys`, recreate the existing `web-rassys_gpu-private-store` compose project, and verify `http://127.0.0.1:3187/api/healthz` plus `/dungeon-master`.
