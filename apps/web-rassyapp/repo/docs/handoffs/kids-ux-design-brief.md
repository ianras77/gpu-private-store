# Kids UX Design Brief

## Product Intent

Rassy Launchpad should feel like a friendly Roblox game-making desk for kids, not a developer console. The backend now supports a clean maker flow:

1. choose a game template,
2. shape the world,
3. choose approved asset shelves,
4. talk with the game coach,
5. export a Rojo package for Roblox Studio.

Roblox account login and publishing stay in Roblox Studio. Launchpad focuses on making the game idea, code plan, assets, and Studio handoff excellent.

## Core UX Promise

A kid should understand the app as:

> I pick the kind of game, turn a few controls, see the direction, and ask the coach to help build the next piece.

Avoid surfaces that feel like:

- admin dashboards,
- plugin managers,
- raw file browsers,
- infrastructure health panels,
- generic AI chat playgrounds.

## Primary Audience

- Kids around 7-13 who want to make Roblox games.
- Parents/coaches who help with Roblox Studio, Rojo, account login, review, and publishing.

The kid path should be visual, stable, and playful. The parent/coach path can be more explicit, but still calm and readable.

## Stable Control Model

The interface should stay predictable. Controls should not reorganize after every answer.

Recommended control families:

- **Template:** Obby Rush, Pet Quest, Speed Sprint, Story Quest.
- **World:** biome/profile, route shape, zone count.
- **Dials:** difficulty, world scale, scenery density, quest depth, hazard level, reward frequency, silliness.
- **Assets:** approved shelves only, shown as toy-like packs.
- **Build action:** build world, add quest, add NPC, add reward, playtest, export to Studio.

The backend already exports these concepts into `ProjectSpec.lua`, `BuildPlan.lua`, `AssetManifest.lua`, and the Rojo manifest. Design should make these feel like kid-facing creative controls, not technical configuration.

## Key Screens

### 1. Game Coach

The coach is the creative companion. It should feel like a helpful game designer.

Design goal:

- one main conversation,
- starter prompt chips,
- visible project context,
- short replies,
- clear next action buttons.

Avoid:

- dumping raw code first,
- huge system-status sidebars,
- developer-only terminology.

### 2. Templates

This is the first serious choice. It should feel like picking a game cartridge or starter kit.

Each template should show:

- name,
- game feeling,
- difficulty,
- 2-3 mechanics,
- tiny scene preview,
- selected state.

### 3. Map Forge

This should become the visual direction board.

It should show:

- world profile,
- route shape,
- zone order,
- hero landmarks,
- atmosphere.

The design should make the kid feel the world changing before they ever open Studio.

### 4. Asset Shelf

Assets should feel like safe toy bins or sticker packs.

Show:

- pack art/thumbnail placeholder,
- sample pieces,
- why it is safe,
- what it changes in the game.

Avoid raw search, asset IDs, and licensing text in the child path.

### 5. Studio Handoff

This is the parent/coach bridge.

Design goal:

- make it clear that Launchpad made the package,
- Roblox Studio handles login and publishing,
- download is the main action,
- readiness checks are understandable.

Suggested language:

- "Download Studio package"
- "Open with Rojo"
- "Review in Roblox Studio"
- "Publish from Studio"

Avoid:

- OAuth setup,
- API key prompts,
- "deploy" language,
- scary warnings unless something truly blocks export.

## Visual Direction

The current app is too dark and operational for kids. A designer should move it toward:

- brighter neutral background,
- playful but not babyish color,
- clear iconography,
- stable left rail or top stepper,
- bigger template and asset tiles,
- fewer tiny status cards,
- warm progress language,
- restrained animation for state changes.

Use rounded shapes intentionally, but do not make every surface a floating card. Repeated items can be cards; page sections should feel like a workspace.

## Backend-Aware Design Notes

The backend can now provide:

- current project title,
- template,
- theme,
- hero goal,
- world recipe,
- asset shelves,
- approved asset items,
- approved Luau modules,
- Rojo export filename,
- package file list,
- readiness checks.

Design should not invent fake states. Use these real states and make them legible.

## Safety And Trust

Child mode:

- no secrets,
- no Roblox account connection,
- no public sharing,
- no raw Creator Store search,
- no hidden publish action.

Parent/coach mode:

- Rojo package download,
- review checklist,
- Roblox Studio handoff,
- eventual Studio plugin path.

## Design North Star

The best version feels like:

> a game-making cockpit with a coach beside you.

The kid turns the direction controls, watches the project board update, asks for help, and sends one clean package to Studio when it is time.
