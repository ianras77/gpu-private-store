# Gamma World DM Console Design

## Current Review

The existing `/dungeon-master` route has a serious backend foundation: account-scoped campaigns, server-authoritative turns, idempotency keys, SSE event streaming, persisted world state, quests, character patches, dice rolls, memory embeddings, pinned facts, and a compendium-aware context packet. That matches the project plan for a real LLM dungeon master better than a plain chat box would.

The UX does not match that ambition yet. The primary play loop is buried below account, campaign, world-builder, roster, inventory, and lookup panels. Chat is a textarea named "Dungeon Master Console" rather than a real terminal surface. Session information exists, but it is scattered across cards, so a table cannot quickly answer: where are we, what is happening, who is hurt, what does the DM know, and what can I type next?

The live backend also has a compendium seeding gap. The packaged `gamma-world-5.json` is large enough to provide real Gamma World grounding, but the live database currently has only four Gamma World entries. `reference-seed.ts` exits as soon as any Gamma World entry exists, so older template-only installs never receive the full extracted corpus.

## Goal

Make the DM page feel like a playable Gamma World command device: an OG handheld-style terminal with world readout, chat transcript, command entry, and supporting panels. Preserve and strengthen the existing backend instead of replacing it.

## UX Design

The first active campaign screen becomes a "Gamma Terminal" handheld console. It uses a dark green/olive monochrome LCD treatment, pixel-grid scanlines, compact command typography, a bevelled shell, and fixed information zones.

The terminal screen shows:

- A top HUD with ruleset, stream status, current location, world time, and weather.
- A world display strip with active threats, story beat, scene summary, and current objective.
- A terminal transcript that mixes player commands, DM narration, state patches, rolls, and system events in chronological play order.
- A command line at the bottom with actor selection, prompt input, send button, and quick commands.
- A small "DM packet" display that previews what the backend will send into the LLM: compendium hits, pinned facts, recent turns, and semantic memory counts.

The existing admin panels remain available but move into supporting columns and tighter modules: party, quests, inventory, dice, and rules lookup. They should support the terminal instead of competing with it.

## Backend Design

Keep the current turn pipeline:

`POST /api/dm/campaigns/:id/chat` -> `processCampaignAction()` -> `buildContextPacket()` -> Cheshire DM lane -> normalized patch -> database commit -> SSE event.

Improve the grounding path by changing reference seeding to compare existing Gamma World entry count with the expected packaged seed count. If the package contains more entries than the live database, upsert the missing/full compendium rows. Do not delete campaigns, turns, users, or existing state.

Use the existing context preview endpoint for the UI information display:

`GET /api/dm/campaigns/:id/context?actionText=...`

The UI should debounce this request and show counts plus top compendium items, not raw JSON by default.

## Testing

Add smoke coverage for:

- The DM page source includes the new terminal screen, command line, and context display anchors.
- The Gamma World seed policy refreshes when an old install has only template entries but a larger packaged corpus exists.

Then run:

- Targeted smoke tests.
- TypeScript compile for the affected app.
- Next build for the app.
- Rendered verification through Playwright because the Browser plugin is not available in this session.

## Deployment

After implementation, bump `config.json` from `1.0.13` to `1.0.14` and increment `tipi_version` from `15` to `16`. Commit only files related to this app, push the appstore repo, sync the installed Runtipi copy, recreate the existing `web-rassys_gpu-private-store` stack, and verify local/live health plus the DM route.
