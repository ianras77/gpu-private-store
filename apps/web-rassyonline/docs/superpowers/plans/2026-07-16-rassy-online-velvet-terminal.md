# Rassy Online Velvet Terminal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a viewport-locked desktop RassyCodex chat UI that accurately exposes current model/search/memory capabilities in a Velvet Underground-inspired visual language.

**Architecture:** Keep all gateway, search, retrieval, auth, streaming, and document behavior intact. Reshape only the server-rendered masthead and the client-side chat workbench, using CSS grid/flex sizing to lock the desktop workspace to the viewport and confine vertical scrolling to the transcript. Reuse existing chat state and API payloads so no gateway contract changes are required.

**Tech Stack:** Next.js 15, React 19, TypeScript, CSS, Vitest, Docker Compose.

---

## File structure

- Modify `apps/web/src/app/page.tsx`: replace legacy visible product language with compact RassyCodex masthead copy.
- Modify `apps/web/src/components/chat-workbench.tsx`: collapse the multi-card command deck into the routing ribbon, preserve all controls and behaviors, and use accurate capability language.
- Modify `apps/web/src/app/globals.css`: add the ink/paper poster palette and responsive viewport layout rules; retain auth/admin styles outside the main chat surface.
- Create `apps/web/src/lib/chat-presentation.ts`: provide the single source of UI lane glyphs and truthful capability hints used by the routing ribbon.
- Create `apps/web/src/lib/chat-presentation.test.ts`: lock the five user-facing lane displays to their actual RassyCodex model IDs and capability framing.
- Create no gateway, storage, auth, or Compose changes. Do not stage the pre-existing `docker-compose.yml` edit.

### Task 1: Define truthful routing-ribbon metadata

**Files:**
- Create: `apps/web/src/lib/chat-presentation.ts`
- Create: `apps/web/src/lib/chat-presentation.test.ts`

- [ ] **Step 1: Write the failing capability test**

Create `apps/web/src/lib/chat-presentation.test.ts` before its implementation:

```ts
import { describe, expect, test } from "vitest";
import { getLaneDisplay } from "./chat-presentation";

describe("RassyCodex lane display", () => {
  test("describes each selectable lane without inventing a gateway capability", () => {
    expect(getLaneDisplay("general")).toMatchObject({ glyph: "ASK", capability: "Conversation and synthesis" });
    expect(getLaneDisplay("deep-coding")).toMatchObject({ glyph: "CODE", capability: "High-context coding" });
    expect(getLaneDisplay("fast-coding")).toMatchObject({ glyph: "FAST", capability: "Focused coding loops" });
    expect(getLaneDisplay("quick")).toMatchObject({ glyph: "SNAP", capability: "Short, low-latency turns" });
    expect(getLaneDisplay("knowledge")).toMatchObject({ glyph: "KNOW", capability: "Selected document context" });
  });
});
```

- [ ] **Step 2: Run the focused test to verify its starting state**

Run: `npm test -- src/lib/chat-presentation.test.ts`

Expected: FAIL because `./chat-presentation` does not exist.

- [ ] **Step 3: Implement the minimal display metadata**

Create `apps/web/src/lib/chat-presentation.ts`:

```ts
import type { ChatModeId } from "./rassycodex";

type LaneDisplay = { glyph: string; capability: string };

const LANE_DISPLAY: Record<ChatModeId, LaneDisplay> = {
  general: { glyph: "ASK", capability: "Conversation and synthesis" },
  "deep-coding": { glyph: "CODE", capability: "High-context coding" },
  "fast-coding": { glyph: "FAST", capability: "Focused coding loops" },
  quick: { glyph: "SNAP", capability: "Short, low-latency turns" },
  knowledge: { glyph: "KNOW", capability: "Selected document context" }
};

export function getLaneDisplay(mode: ChatModeId): LaneDisplay {
  return LANE_DISPLAY[mode];
}
```

- [ ] **Step 4: Run the focused test after the metadata is explicit**

Run: `npm test -- src/lib/chat-presentation.test.ts`

Expected: Vitest reports the new lane-display test passing.

- [ ] **Step 5: Commit the capability lock**

```bash
git add apps/web/src/lib/chat-presentation.ts apps/web/src/lib/chat-presentation.test.ts
git commit -m "feat(web-rassyonline): define RassyCodex lane display"
```

### Task 2: Replace the command deck with the routing ribbon

**Files:**
- Modify: `apps/web/src/components/chat-workbench.tsx`
- Modify: `apps/web/src/app/page.tsx`

- [ ] **Step 1: Replace legacy visible RassyGPT copy with RassyCodex copy**

Use `RassyCodex` in the initial assistant seed, the `aria-label` values, composer placeholder, and masthead. Keep the word “Rassy Online” as the product name and describe search as optional web context rather than a gateway-native capability. Import and use `getLaneDisplay` in place of the local `MODE_GLYPHS` map.

```tsx
content: "RassyCodex is on the line. Pick a lane, bring your documents if you are signed in, and start the thread."
```

- [ ] **Step 2: Restructure the workbench JSX around one routing ribbon**

Replace the `command-deck` descendants with a single `routing-ribbon` that contains:

```tsx
<div className="lane-switcher" aria-label="RassyCodex lane">
  {modes.map((item) => (
    <button className={item.id === mode ? "lane-button active" : "lane-button"} key={item.id} onClick={() => setMode(item.id)} type="button">
      <span>{MODE_GLYPHS[item.id]}</span>
      <strong>{item.label}</strong>
    </button>
  ))}
</div>
```

Place the existing search segmented control, model readout, existing theme controls, and existing signed-in upload/document controls inside the same ribbon. Preserve `uploadDocument`, `toggleDocument`, `activeDocuments`, `sendMessage`, `abortRef`, and every existing API request payload unchanged.

- [ ] **Step 3: Make document memory compact without removing it**

Keep document pills and upload behavior, but render the empty state as a short source-state line and place document pills in a horizontal `memory-source-tray`. It must have `overflow-x: auto` so many selected documents cannot increase page height.

- [ ] **Step 4: Make the composer the permanent bottom action**

Keep the textarea, shortcut buttons, and Send/Stop functionality. Label the composer as the thread input, use the existing slash-command semantics, and preserve user-visible notices. Do not introduce form behavior that changes message submission or streaming.

- [ ] **Step 5: Type-check the refactor**

Run: `npm run lint`

Expected: `tsc --noEmit` exits 0.

- [ ] **Step 6: Commit the component and copy refactor**

```bash
git add apps/web/src/components/chat-workbench.tsx apps/web/src/app/page.tsx
git commit -m "feat(web-rassyonline): make RassyCodex chat the interface"
```

### Task 3: Implement the viewport-locked Velvet Terminal visual system

**Files:**
- Modify: `apps/web/src/app/globals.css`

- [ ] **Step 1: Define the desktop containment rules**

For desktop-capable viewport sizes, use a fixed available-height app shell and a grid workbench:

```css
@media (min-width: 701px) and (min-height: 620px) {
  html, body { height: 100%; overflow: hidden; }
  .app-shell { height: 100dvh; min-height: 0; }
  .workspace-grid, .chat-workbench { min-height: 0; height: 100%; }
  .message-list { min-height: 0; overflow: auto; }
}
```

Ensure the grid rows reserve space for the masthead, ribbon, transcript, composer, and compact persistence line. Do not use fixed transcript pixel heights that would clip controls in short windows.

- [ ] **Step 2: Build the poster-like styling around the new component classes**

Use near-black and warm ivory as the base, with acid yellow/red only for active routing and send state. Give `.routing-ribbon`, `.lane-button`, `.transcript-shell`, `.chat-message`, and `.composer-preview` ruled, high-contrast, editorial treatments. Remove the old glass-card visual language from the main chat surface while retaining readable markdown tables, code blocks, links, and focus indicators.

- [ ] **Step 3: Add responsive fallback rules**

Below `701px` width or `620px` height, restore document scrolling, stack ribbon controls, preserve a usable composer, and let document controls wrap. Keep `.message-list` independently scrollable where practical but never clip the form.

- [ ] **Step 4: Add reduced-motion protection**

Wrap decorative transitions in:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { scroll-behavior: auto !important; transition-duration: 0.01ms !important; animation-duration: 0.01ms !important; }
}
```

- [ ] **Step 5: Run static verification**

Run: `npm run lint && npm run build`

Expected: TypeScript succeeds and Next.js emits a production build without a route/build failure.

- [ ] **Step 6: Commit the visual system**

```bash
git add apps/web/src/app/globals.css
git commit -m "style(web-rassyonline): build the velvet terminal"
```

### Task 4: Verify behavior and Runtipi packaging

**Files:**
- Modify: none unless verification identifies a defect

- [ ] **Step 1: Run all application tests**

Run: `npm test`

Expected: every Vitest suite passes with zero failed tests.

- [ ] **Step 2: Validate TypeScript and production build**

Run: `npm run lint && npm run build`

Expected: both commands exit 0.

- [ ] **Step 3: Validate the app Compose file without altering it**

Run: `docker compose config --quiet`

Expected: exit 0. Inspect `git diff -- docker-compose.yml` afterward and confirm no additional Compose change was created or staged.

- [ ] **Step 4: Exercise the primary interaction path in a browser-capable environment**

At a desktop viewport with height at least 620px, confirm the document itself has no vertical scroll, the transcript does scroll, every lane can be selected, search mode changes, a message sends and streams, Stop aborts a stream, and document source controls remain usable when signed in. At a compact viewport, confirm the page flows rather than clipping controls.

## Final acceptance checklist

- [ ] Desktop modern window: no page scroll, only transcript scrolls.
- [ ] Small/short viewport: no clipped controls; normal flow fallback works.
- [ ] All five UI lanes map to their actual RassyCodex model IDs.
- [ ] Optional search, authenticated document memory, uploads, streaming, stop, and slash commands retain their existing behavior.
- [ ] Visible main-chat language says RassyCodex, not RassyGPT.
- [ ] `docker-compose.yml` remains the user’s independent unstaged edit.
