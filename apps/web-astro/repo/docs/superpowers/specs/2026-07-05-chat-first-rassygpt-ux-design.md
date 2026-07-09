# Chat-First RassyGPT UX Design

User direction: no visual mockup; proceed directly as a UX/code implementation. This spec replaces the traditional first screen with a live chat-led interface that makes RassyGPT/RassyCodex the site itself.

## Product Shape

- The home screen is a conversation cockpit, not a landing page.
- The chart, report, account, lore, compatibility, and grimoire paths remain available, but they sit around the dialogue as capabilities the chat can invoke or suggest.
- The assistant returns both prose and a small UI state: mood, palette, motion, density, and active capability. The page reflects the conversation without hiding the input.
- The header is compact, dynamic, and operational: brand identity, live model status, and quick routes.

## Interaction Rules

- Keep the input visible and dominant at all times.
- Use progressive disclosure for advanced features: show the full RassyCodex capability set, but give the current exchange one primary next action.
- Make AI state legible: show provider/model when known, show when fallback language is used, and never pretend tool calls happened when they did not.
- Blend magical atmosphere with practical controls: glow, tempo, and symbols can shift, but reading order, contrast, and mobile usability stay stable.
- Treat astrology as an internal map: chart calculation, source-grounded Human Guide, and esoterica memory are surfaced as lenses in conversation.

## Implementation Plan

1. Add a shared `RassyChatHome` React component in `@astro/ui`.
2. Replace each branded app home page with the shared chat home.
3. Add `/v1/rassy-chat` to the API using the existing OpenAI-compatible RassyGPT route.
4. Extend CSS with a responsive chat cockpit, adaptive atmosphere variables, capability rail, message stream, and dynamic header treatment.
5. Verify with tests/build plus rendered screenshots after deploy.
