# Music Symlink Mount Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make symlinked music under `/data/runtipi/media/data/music` visible to the radio controller and Liquidsoap containers.

**Architecture:** Keep the existing `/media/music` mount and scanner unchanged. Add an explicit read-only bind mount from host `/mnt/cannonball` to container `/mnt/cannonball` in `radio-controller` and `liquidsoap`, so the existing absolute symlinks resolve inside both containers.

**Tech Stack:** Docker Compose, TypeScript, Vitest, Docker runtime verification.

---

### Task 1: Add the failing Compose mount regression test

**Files:**
- Create: `services/radio-controller/src/tests/music-mount.test.ts`

- [ ] **Step 1: Write the failing test**

Create a test that reads the repository `docker-compose.yml`, extracts the `radio-controller` and `liquidsoap` service blocks, and asserts that each contains the literal read-only mount `- /mnt/cannonball:/mnt/cannonball:ro`.

```ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const compose = readFileSync(path.resolve(__dirname, "../../../../docker-compose.yml"), "utf8");

const serviceBlock = (service: string) => {
  const match = compose.match(new RegExp(`\\n  ${service}:\\n([\\s\\S]*?)(?=\\n  [a-zA-Z0-9_-]+:|$)`));
  if (!match) throw new Error(`Missing ${service} service in docker-compose.yml`);
  return match[1];
};

describe("music symlink mounts", () => {
  it.each(["radio-controller", "liquidsoap"])(
    "%s exposes the absolute symlink target read-only",
    (service) => {
      expect(serviceBlock(service)).toContain("- /mnt/cannonball:/mnt/cannonball:ro");
    }
  );
});
```

- [ ] **Step 2: Run the test and verify it fails for the intended reason**

Run from `services/radio-controller`:

```bash
npm test -- --run src/tests/music-mount.test.ts
```

Expected: both assertions fail because the Compose service blocks do not yet contain the `/mnt/cannonball` mount.

### Task 2: Add the read-only mounts

**Files:**
- Modify: `docker-compose.yml:214-224`
- Modify: `docker-compose.yml:304-313`

- [ ] **Step 1: Add the minimal Compose change**

Add this exact line to each service's `volumes` list, adjacent to the existing music mount:

```yaml
- /mnt/cannonball:/mnt/cannonball:ro
```

Do not remove the existing `/media/music` or `/data/runtipi/media/data` mounts, and do not change the scanner.

- [ ] **Step 2: Run the focused test and existing controller tests**

Run:

```bash
npm test -- --run src/tests/music-mount.test.ts
npm test
```

Expected: the focused test passes and the existing controller suite passes.

### Task 3: Redeploy and prove live library visibility

**Files:**
- No source files.

- [ ] **Step 1: Validate the Compose file**

Run the repository's normal Runtipi/app deployment path for `web-rassys`, then inspect the resulting container mounts. Do not claim deployment success unless the app update/recreate completes successfully.

- [ ] **Step 2: Verify the target path in both containers**

Run:

```bash
docker exec web-rassys_gpu-private-store-radio-controller-1 sh -lc 'readlink -f /media/music/Unsorted && find -L /media/music -type f | head -1'
docker exec web-rassys_gpu-private-store-liquidsoap-1 sh -lc 'readlink -f /media/music/Unsorted && find -L /media/music -type f | head -1'
```

Expected: both commands resolve the symlink into `/mnt/cannonball/music/Unsorted` and print an audio file.

- [ ] **Step 3: Verify the controller scan result**

Inspect controller logs after restart or trigger the existing library refresh endpoint. Expected evidence is a `Library quick scan complete` or full scan message with `tracks` greater than zero, plus a healthy controller.

- [ ] **Step 4: Commit the source change**

```bash
git add docker-compose.yml services/radio-controller/src/tests/music-mount.test.ts docs/superpowers/specs/2026-08-04-music-symlink-mount-design.md docs/superpowers/plans/2026-08-04-music-symlink-mount.md
git commit -m "fix(web-rassys): mount music symlink targets"
```
