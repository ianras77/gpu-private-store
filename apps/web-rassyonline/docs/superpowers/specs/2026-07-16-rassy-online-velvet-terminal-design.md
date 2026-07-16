# Rassy Online Velvet Terminal Design

## Goal

Recast Rassy Online as a single-screen, desktop-first RassyCodex chat instrument. On a modern desktop viewport the document itself does not scroll: the browser window is the workspace and only the transcript scrolls. The UI should feel like an underground music poster and an intimate studio console, not a dashboard.

## Capability alignment

The interface exposes existing, real capabilities without inventing new gateway features:

- **Talk** routes to `rassy-general` for broad conversation and synthesis.
- **Deep Codex** routes to `rassy-codex` for high-context coding and systems work.
- **Fast Codex** routes to `rassy-codex-lite` for focused implementation loops.
- **Spark** routes to `rassy-fast` for short, low-latency transforms.
- **Memory** routes to `rassy-general` and makes the selected, authenticated user's documents available through existing Qdrant retrieval.
- Search remains intentionally separate from RassyCodex retrieval: `auto`, `search`, and `local` control the existing optional `search.rasies.com` context route.
- Existing slash commands, streaming, stop control, persisted threads, document uploads, and theme intent handling remain functional.

Visible copy uses **RassyCodex** rather than the older RassyGPT name. Search and document memory are described accurately: search is on-demand web context; memory is durable only for authenticated users with selected ready documents.

## Information architecture

The desktop surface is a three-part vertical instrument:

1. A thin masthead: wordmark, a compact product statement, and account actions.
2. A routing ribbon: lane selector, actual model route, web-search state, and a compact memory-source tray. The memory tray can scroll horizontally or collapse its empty state so it never grows the page.
3. The conversation well: a fixed-height transcript region with its own overflow, followed by a fixed bottom composer.

The routing ribbon intentionally replaces the current independently boxed route card, five-card lane deck, tool panel, and separate memory strip. Controls stay reachable but cease to dominate the conversation.

## Visual system

- Near-black ink field with warm paper/ivory type; acid yellow and blood-red are small active-state accents.
- Typography is assertive and editorial: wide display treatment for the product line, utilitarian mono/sans labels for route data.
- Use grain, poster rules, imperfect framing, offset shadows, and limited high-contrast blocks. Avoid generic glassmorphism, glowing “sci-fi” chrome, excessive pills, and decorative empty cards.
- Chat messages remain highly legible. User and assistant messages get distinct poster-like labels and rules rather than bulky cards.
- Motion is limited to subtle route/state shifts and respects reduced-motion preferences.

## Responsive behavior

- At desktop and modern laptop sizes, `html`, `body`, and the primary app shell lock to the available viewport height. The main conversation region is the only vertical scroll container.
- At small heights or narrow widths where a fixed composition would clip input or controls, the layout changes to regular vertical flow and permits document scrolling. This is a usability fallback, not the default desktop design.
- Controls retain accessible labels, keyboard operation, focus styles, and readable text at all breakpoints.

## Error and state behavior

- Streaming preserves the existing assistant placeholder and stop action.
- A failed gateway request remains visible as an assistant error in the transcript.
- Search unavailable continues to fall back to the existing system instruction, not a false claim that web context was used.
- Document upload/indexing and document-enable state retain the current notices and optimistic rollback behavior.

## Verification

- Unit coverage continues to prove route-to-model mappings, SSE extraction, search policy, and intent parsing.
- Add a focused test for any new pure route-display/model metadata introduced by the redesign before implementation.
- Run the existing test suite, TypeScript check, production build, and compose validation.
- Verify the real UI at a desktop viewport and one compact viewport: no page scroll on desktop, transcript scroll works, every lane can be selected, search mode changes, composer sends/stops, and small-screen fallback stays usable.

## Scope boundaries

This is a presentation and interface-clarity change. It does not alter RassyCodex model routing, gateway configuration, Qdrant storage, authentication policy, or the user-owned document-data model. The pre-existing `docker-compose.yml` modification is outside this work and must remain untouched.
