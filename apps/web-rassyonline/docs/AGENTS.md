# Mastra agents

The agent registry contains these callable lanes:

- `rassy` for general conversation, research, math, and visual work.
- `researcher` for server-planned web research and comparisons.
- `knowledge` for selected user documents and the shared Books library.
- `coder` for code and system design guidance.
- `utility` for short transformations and verified calculations.

Two internal lanes are also registered. `rassy-local` is selected when a turn disables web access and has no web tools. `researcher-grounded` synthesizes the server's preflight evidence without search tools, preventing repeated searches after evidence has been gathered.

`diagram-studio` is an offline artifact generator attached to the general, local-only, research, coder, and utility lanes. It returns an in-chat SVG preview, native `.drawio` XML that the browser bridge loads directly into the self-hosted `https://diagram.rasies.com` editor, and an `.excalidraw` scene file for `https://draw.rasies.com`. The browser bridge checks the editor's origin and window before passing diagram XML. Excalidraw scene data stays in the chat artifact until the user downloads it; the external Excalidraw share backend is not used. `draw.rasie.com` is not the Rasies editor hostname; use `draw.rasies.com`.

Agents use semantic RassyMind model aliases. Coder intentionally has no shell or workspace tool. The enabled tool registry and each agent's attached tools are checked together by `src/mastra/tools/tools.test.ts`.
