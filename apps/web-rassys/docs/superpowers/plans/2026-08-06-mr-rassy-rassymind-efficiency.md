# Mr Rassy RassyMind Efficiency Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Release `web-rassys` 1.0.22 with responsive RassyMind-backed listener chat, subordinate background work, and verified Runtipi deployment.

**Architecture:** Keep the local proxy as an internal boundary, but make RassyMind variables canonical in compose and the controller. Add a reserved listener queue policy in the proxy, shed optional background work during recent chat activity, and remove duplicate recovery attempts that amplify saturation. Release through the managed Runtipi app lifecycle and verify the real public/runtime path.

**Tech Stack:** TypeScript, Fastify, Redis, RassyMind OpenAI-compatible API, Docker Compose, Next.js, Vitest, Runtipi CLI.

---

### Task 1: Add failing queue-policy tests

**Files:**
- Create: `services/cheshire-proxy/src/queue-policy.test.ts`
- Modify: `services/cheshire-proxy/package.json`

- [ ] **Step 1: Add a test script and test the queue policy contract**

Create a small pure policy module test covering: listener requests can use the reserved slot; background requests cannot consume the reserved slot; listener queue wait is bounded; optional background lanes are immediately shed during active listener traffic.

- [ ] **Step 2: Run the new test and verify it fails**

Run: `npm --prefix services/cheshire-proxy test`

Expected: FAIL because the policy module and test script do not exist yet.

### Task 2: Implement listener-reserved proxy capacity

**Files:**
- Create: `services/cheshire-proxy/src/queue-policy.ts`
- Modify: `services/cheshire-proxy/src/index.ts:15-165,220-240,810-835`
- Modify: `docker-compose.yml:266-297`

- [ ] **Step 1: Implement the pure policy**

Add typed helpers that calculate whether a lane may acquire a slot, with `listener` exempt from the reserved background capacity and low-value lanes (`notes`, `general`, `curio`, `embeddings`) shed when listener activity is active. Keep `programming` eligible only when no listener request is waiting.

- [ ] **Step 2: Wire the policy into queue acquisition**

Track listener waiting/active state, reserve one active slot for listener traffic, and make background queue waits default to zero during listener pressure. Preserve priority ordering and queue snapshots. Return the existing `cheshire_queue_busy` response when an optional background request is shed.

- [ ] **Step 3: Add bounded proxy defaults**

Set RassyMind-backed defaults in compose for a 45-second upstream timeout, zero proxy retries, and a 10-second listener queue wait. Keep all values overridable through environment variables.

- [ ] **Step 4: Run proxy tests and build**

Run: `npm --prefix services/cheshire-proxy test`

Expected: PASS.

Run: `npm --prefix services/cheshire-proxy run build`

Expected: PASS with emitted `dist` output.

### Task 3: Make RassyMind configuration canonical in the controller

**Files:**
- Modify: `services/radio-controller/src/config.ts:10-130`
- Modify: `services/radio-controller/src/dj/rassy.ts:2238-2390`
- Modify: `services/radio-controller/src/library/track-intelligence.ts:970-1060`
- Modify: `services/radio-controller/src/scheduler.ts:1600-1660,2350-2370`
- Modify: `docker-compose.yml:35-150`
- Modify: `config.json:1-35`

- [ ] **Step 1: Add RassyMind-first environment parsing**

Parse `RASSYMIND_BASE_URL`, `RASSYMIND_API_KEY`, and `RASSYMIND_MODEL` in the controller, defaulting the model to `rassy-mind`. Preserve only internal proxy URL compatibility where necessary; do not require legacy `CHESHIRE_API_KEY` for the RassyMind path.

- [ ] **Step 2: Use canonical values at all controller call sites**

Change chat, playlist, dossier, transition, and track-intelligence calls to read the canonical RassyMind config. Keep existing lane headers for proxy scheduling, but remove misleading old-provider wording from active logs and status fields.

- [ ] **Step 3: Update compose and app metadata**

Pass the canonical RassyMind variables to web, radio-controller, and the internal proxy. Update descriptions and form labels to RassyMind. Increment `config.json` from `1.0.21` to `1.0.22`.

- [ ] **Step 4: Add config-focused tests and run controller verification**

Extend the existing controller tests with canonical env/model assertions, then run:

`npm --prefix services/radio-controller test`

`npm --prefix services/radio-controller run build`

`npm --prefix services/radio-controller run lint`

Expected: all PASS.

### Task 4: Shed duplicate and nonessential background work during chat

**Files:**
- Modify: `services/radio-controller/src/server.ts:1014-1045,2260-2325,2463-2685`
- Modify: `services/radio-controller/src/scheduler.ts:2340-2375`
- Modify: `services/radio-controller/src/dj/rassy.ts:2520-2650,2700-2735`
- Test: `services/radio-controller/src/tests/` relevant scheduler/chat tests

- [ ] **Step 1: Add a failing regression test for single-attempt saturation handling**

Cover a listener response where RassyMind returns queue saturation: the controller must produce one bounded fallback response and must not launch a second rescue call for the same turn.

- [ ] **Step 2: Gate optional enrichment on recent listener activity**

Use the existing Redis activity marker and add the same gate to booth dossier refresh, curio generation, and background track-analysis entry points. A gated job logs a deferred result and exits without holding a request lock longer than the bounded operation.

- [ ] **Step 3: Remove duplicate DJ rescue calls for capacity failures**

Classify queue-full, timeout, and circuit-open errors as capacity failures. Return the compact local fallback immediately for those errors; retain schema-recovery only for malformed successful upstream content.

- [ ] **Step 4: Bound listener context and preserve request-line behavior**

Keep only the current track, a bounded queue preview, the active request line, and recent conversation in the listener prompt. Do not alter request matching, queued status transitions, or broad-request visibility.

- [ ] **Step 5: Run focused regression tests**

Run: `npm --prefix services/radio-controller test -- --runInBand`

Expected: PASS, including request-line, chat-intent, circuit, and scheduler tests.

### Task 5: Validate the rendered chat surface

**Files:**
- Modify only if validation identifies a targeted UI timeout/status defect: `apps/web/src/components/HomeLiveLine.tsx`
- Test: `apps/web/scripts/smoke.mjs` or a temporary external Playwright probe

- [ ] **Step 1: Run the existing web checks**

Run: `npm --prefix apps/web run lint`

Run: `npm --prefix apps/web test`

Expected: PASS.

- [ ] **Step 2: Exercise the live rendered flow**

The flow under test is: `/` → open the live line → submit a short listener message → observe either an immediate DJ reply or the bounded cueing state followed by a reply, with no console/runtime error.

Use the Browser plugin if available; otherwise use the permitted Playwright fallback and record that the Browser plugin was unavailable. Keep screenshots and temporary probes outside the repository.

### Task 6: Build and perform the Runtipi version upgrade

**Files:**
- Verify: `config.json`, `docker-compose.yml`, generated compose/lifecycle state

- [ ] **Step 1: Validate the store package**

Run the repository’s applicable store validation command and compose rendering with the managed Runtipi environment. Confirm version `1.0.22` and required RassyMind fields without printing secrets.

- [ ] **Step 2: Build the updated app images**

Run the Runtipi app build/update command from the app-store workflow. Do not claim success from a source build alone.

- [ ] **Step 3: Upgrade/recreate the app through Runtipi**

Run the managed `web-rassys` update. If Docker reports the known overlapping-subnet error, stop and report the infrastructure blocker without destructive network changes.

- [ ] **Step 4: Verify runtime parity**

Confirm all `web-rassys` containers are healthy, the running image creation/start timestamps are newer than the release, and the runtime env contains canonical RassyMind names with secret values redacted.

### Task 7: Run live functional qualification

**Files:**
- No source changes; capture evidence outside the repository.

- [ ] **Step 1: Probe health and radio state**

Verify `/api/healthz`, `/api/radio/status`, and controller/proxy readiness. Confirm the site remains on-air and status is not silently stuck in fallback when RassyMind is available.

- [ ] **Step 2: Prove browser chat**

Submit one short real chat message through `/api/radio/chat`, measure elapsed time, and verify a DJ response or bounded pending-to-response transition. Confirm no repeated rescue storm in controller/proxy logs.

- [ ] **Step 3: Prove request-line behavior**

Submit one harmless recommendation/request and verify it remains visible in `requestLineItems` with the correct status and no fabricated IDs.

- [ ] **Step 4: Run final verification**

Run `git diff --check`, the controller/proxy/web test suites, and the applicable Runtipi store validator. Report exact pass/fail evidence and any remaining unproven public route.

