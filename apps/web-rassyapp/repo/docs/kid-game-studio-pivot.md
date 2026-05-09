# Kid Game Studio Pivot

## Working brand

- Working product name: `Rassy Launchpad`
- Positioning: a kid-first AI game studio that helps families dream up, build, test, and publish simple adventure games with a parent-reviewed path into Roblox Studio.

Why this brand:

- It keeps the existing `Rassy` equity.
- It avoids making `Roblox` the product title.
- It leaves room for a companion Studio plugin, template marketplace, and classroom/family editions.

## Product goal

Turn the current Cheshire Cat wrapper into a guided game-making studio where a child can:

1. describe a game idea in plain language,
2. choose a starter template,
3. remix mechanics, NPCs, quests, and art direction with AI help,
4. preview the build plan in kid-friendly language,
5. hand the project to a parent or coach for account linking and publish.

## What we should keep from the current framework

The existing app already has the right high-level primitives:

- chat-first guidance,
- reusable Cheshire Cat plugins,
- multi-turn data collection,
- memory and ingestion,
- authenticated server-side routing,
- deployable package structure.

The pivot is not "throw it away and rebuild."
The pivot is "replace repo-operator assumptions with game-studio assumptions."

## Current framework -> new studio mapping

| Current concept | New concept |
| --- | --- |
| Workspace | Game project |
| Workspace session | Build session |
| Thread | Idea thread |
| Agent routine | Build recipe / coach automation |
| Plugin forge | Build kit / mechanic generator |
| Rabbithole ingest | Inspiration board / reference pack |
| Memory recall | Project memory / remix vault |
| Runtime status | Studio connection / publish readiness |

## Product pillars

### 1. Dream with the AI

The first surface should feel like a game coach, not an admin console.

The AI should help a child turn:

- "I want a lava parkour game"
- "make it like a pet quest"
- "add a boss room"

into:

- genre,
- core loop,
- map plan,
- quest list,
- NPC behavior,
- script tasks,
- build steps.

### 2. Template-rich creation

The app should ship with opinionated starter kits:

- Obby Rush
- Story Quest
- Speed Racer
- Pet Adventure
- Tycoon Lite
- Minigame Party

Each template should include:

- a child-friendly explanation,
- recommended age range / difficulty,
- scene map,
- mechanic modules,
- starter NPCs,
- editable quest/dialog data,
- publish checklist.

### 3. Safe family workflow

The child flow and the parent flow should be different.

Child mode:

- no secrets,
- no API keys,
- no confusing account setup,
- no public sharing by default.

Parent / coach mode:

- connect creator account,
- approve publish targets,
- manage permissions,
- review generated assets and scripts,
- confirm final publish.

### 4. Studio companion path

The web app should not try to do every edit blindly on the live experience.

Instead, the best workflow is:

1. the web app creates a structured build plan,
2. a companion Studio plugin receives the approved plan,
3. Studio applies or previews the changes,
4. a parent or coach reviews them,
5. publish happens from Studio or from a controlled publish service.

## Roblox integration architecture

### Recommended account-linking model

Use three tiers:

1. Guest ideation
   - no Roblox account required
   - safe brainstorming, templates, and local drafts only

2. Connected creator mode
   - OAuth-based connection for account identity and resource selection
   - used to choose universes / places and read authorized resources

3. Supervised publish mode
   - parent or coach approves the target place and publish action
   - optional API-key path for advanced publishing automation

### Why not lead with API keys

API keys are powerful and operationally awkward for a child-facing product.
They should be an advanced or adult-only mode.

The default connection flow should be account-based and reversible.

### Universe and place strategy

The app should assume that the user first chooses or creates a starter experience, then attaches our studio workflow to it.

That means our first publish MVP should focus on:

- selecting an existing universe,
- selecting the target place,
- generating or patching content for that place,
- publishing a reviewed version.

## Companion Studio plugin

The plugin is a major unlock and should be a first-class roadmap item.

Responsibilities:

- render a docked panel inside Studio,
- sign in with a short-lived token from the web app,
- pull project instructions and template bundles,
- preview generated scripts and objects before applying them,
- support drag/drop or one-click import for approved assets,
- send status back to the web app.

Why this matters:

- it makes the flow feel magical for kids,
- it keeps review visible,
- it reduces risk from direct live mutation,
- it meets creators where they already build.

## Cheshire Cat strategy

We should stop thinking of Cheshire Cat plugins as "technical plugins" and start treating them as "studio powers."

See also: `docs/agentic-writer-room.md` for the world-first multi-agent pipeline.

Examples:

- Template Selector Form
- Quest Designer Form
- NPC Dialogue Tool
- Luau Script Coach
- Build Checklist Tool
- Publish Readiness Reviewer
- Safety Language Checker

This is a strong fit for Cheshire Cat because:

- tools handle one-shot generators,
- forms handle structured multi-turn flows,
- hooks can reshape assistant tone and task routing,
- Rabbithole can store examples, kid-safe prompts, and template docs.

## Safety and compliance boundaries

The safest initial launch posture is:

- family-supervised,
- minimal data collection,
- no public community features,
- no open social posting,
- no child-managed secrets,
- no implication of official platform partnership.

Design implications:

- use parent gates for linking and publish,
- keep drafts private by default,
- make generated content reviewable,
- keep moderation and filtering in the pipeline,
- avoid branding that looks official.

## Data model changes we should make next

The current schema is still centered on repos and workspaces.
We should introduce a project-first model:

- `StudioProject`
  - title
  - theme
  - templateId
  - targetAudience
  - universeId
  - placeId
  - connectionStatus
  - parentModeEnabled

- `BuildPlan`
  - scenesJson
  - mechanicsJson
  - questJson
  - npcJson
  - scriptsJson
  - artDirectionJson

- `PublishTarget`
  - universeId
  - placeId
  - authMode
  - ownerType

- `TemplatePack`
  - slug
  - name
  - genre
  - ageBand
  - difficulty
  - starterPrompt

The old workspace/session/routine models can be migrated rather than deleted immediately.

## UX changes we should make next

The main IA should become:

- Game Coach
- Templates
- Build Kits
- Inspiration
- Publish
- Parent Mode

Advanced screens can remain available behind a developer toggle:

- AI Engine
- Runtime
- Admin

## Phased roadmap

### Phase 1

- Rebrand the shell and landing pages.
- Replace operator copy with kid-first game-studio copy.
- Reframe plugin forge as build kits and coach powers.
- Add a documented product architecture.

### Phase 2

- Add project-first schema and seed templates.
- Add template cards, idea flows, and build-plan generation.
- Replace repo-specific quick actions with game-specific actions.

### Phase 3

- Add creator account connection and project linking.
- Let parents pick universe and place targets.
- Store connection state and publish permissions.

### Phase 4

- Build the Roblox Studio companion plugin.
- Add preview/apply flows for scripts, folders, and config.
- Add export bundles and review steps.

### Phase 5

- Add supervised publish workflow.
- Add publish-readiness checks.
- Add optional automated testing and rollback helpers.

## Immediate build priorities for this repo

1. Rebrand the public shell and playground language.
2. Seed the current forge with Roblox-game-oriented build-kit prompts.
3. Add a clear publish architecture section to the UI.
4. Begin migrating the data model from workspace -> project.
5. Build connection scaffolding before attempting live publish.

## Supporting strategy docs

- See `docs/kid-easy-flow-and-assets.md` for the child-first creation loop, public asset strategy, and parent-gated safety model.
