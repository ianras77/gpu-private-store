# Kid-Easy Flow And Assets

## The standard to hold

If a child needs to understand Roblox accounts, places, universes, API keys, asset permissions, or code editors before they can make something fun, the flow is too hard.

Kid-easy means:

- start with a feeling, not a form,
- pick from a few big visual choices,
- get something playable fast,
- keep all risky or confusing steps behind a parent gate,
- treat assets like stickers and toy pieces, not file management.

## The core product promise

The promise is not:

- "you can eventually make any Roblox game."

The promise is:

- "in ten minutes, a kid can turn an idea into a playable starter world."

That promise should drive the entire UI.

## The right first-run flow

### 1. Pick a game feeling

Do not start with a blank prompt.

Start with big choices like:

- Run and jump
- Explore and collect
- Help cute pets
- Solve a mystery
- Build and decorate

This lets the child begin with taste, not technical vocabulary.

### 2. Pick a theme

After the game feeling, offer a short theme row:

- Candy sky
- Pirate island
- Space race
- Cozy village
- Dino park
- Haunted camp

The child should feel like they are making creative choices immediately.

### 3. Pick one hero goal

Ask one simple question:

- "What does the player try to do?"

Examples:

- Reach the golden flag
- Rescue the missing pet
- Win the race
- Find the magic key

This gives the LLM a stable anchor for the build plan.

### 4. Generate a starter world

The app should then create:

- one-line pitch,
- three-scene map,
- one core loop,
- three starter mechanics,
- one NPC helper,
- one celebration ending.

This is the moment the idea becomes real.

### 5. Let the child remix with toy-like controls

The next screen should use big actions, not open-ended tooling:

- Add coins
- Add a helper pet
- Make it sillier
- Make it harder
- Add a boss room
- Change the theme
- Add music
- Add a shop

Every action should map to a safe build recipe behind the scenes.

### 6. Show a visual build board

Before Roblox Studio enters the picture, the child should see a board with:

- scenes,
- objects,
- quests,
- characters,
- rewards,
- art pack,
- sounds.

This is easier to understand than files, JSON, or scripts.

### 7. Parent connects Roblox only when the child cares

Do not ask for Roblox linking on first launch.

The right moment is after the child says some version of:

- "I like this"
- "I want to play it"
- "I want to put it in Roblox"

Only then should the parent step in to:

- sign in,
- choose the target place,
- approve assets,
- approve the apply step,
- approve publish.

## The wrong flow to avoid

- blank chat first
- account linking first
- raw Creator Store browsing
- code editor first
- file tree first
- "choose universe / place" first
- adult language like deploy, runtime, patch, repo, plugin, ingest

## Asset strategy

## Asset layers

The asset system should have three layers.

### Layer 1: Built-in Launchpad packs

These are the safest and fastest assets because we control them.

Examples:

- checkpoint signs,
- coin icons,
- reward chests,
- simple particles,
- starter music loops,
- NPC portraits,
- quest badges,
- button sets,
- scene thumbnails.

This layer should power the first magical experience.

### Layer 2: Curated public Roblox assets

These are public resources we surface inside Launchpad after we pre-filter them.

Use cases:

- official sample libraries,
- Roblox-made assets,
- hand-picked mesh or audio packs,
- whitelisted creator libraries for specific templates.

Children should never see a raw internet-like asset search as the default experience.

### Layer 3: Parent-reviewed external imports

This is the advanced lane.

Parents or coaches can import extra packs, but those assets should pass through a review queue before they become part of the child-facing library.

## Public resources we should use

### 1. Roblox Creator Store search

Use this for:

- meshes,
- models,
- audio,
- image assets,
- font discovery,
- template enrichment.

But the product should use it as a curated backend source, not a freeform child search box.

### 2. Roblox sample asset libraries and curriculum packs

These are perfect for starter templates because they are already organized around teaching and playable examples.

Use them for:

- obby starter packs,
- environmental art bundles,
- sample scenes,
- polished visual upgrades,
- tutorial-aligned build recipes.

### 3. Roblox education lesson plans and beginner projects

These are useful not just as reading material, but as product design input.

They show the kinds of first projects Roblox already uses to teach beginners:

- obstacle courses,
- adventure collection loops,
- simple scripting tasks,
- playtest-first iteration.

We should mirror that learning curve inside Launchpad.

### 4. Kenney CC0 assets

Kenney is a great external source for simple kid-friendly starter art because the assets are CC0 and easy to remix.

Use Kenney mainly for:

- app-side UI kits,
- placeholder icons,
- concept boards,
- moodboards,
- imported decals,
- simple audio or effect placeholders if needed.

These should be imported by us into reviewed packs, not fetched live in child mode.

### 5. OpenGameArt as an adult-only source

This can be useful, but the licensing mix is more complex.

That means it should not be part of the default child flow.

If we use it at all, it should be:

- filtered to safe licenses,
- reviewed by an adult,
- stored with attribution metadata,
- converted into Launchpad-approved packs.

## Safe asset policy

### Child mode

Allowed:

- Launchpad starter packs
- curated template bundles
- approved Roblox sample libraries
- approved Roblox public assets from our allowlist

Not allowed:

- raw public model browsing
- arbitrary plugin installs
- direct import of outside files
- asset IDs pasted from the internet

### Parent mode

Allowed:

- approve reviewed assets,
- connect place and universe,
- import extra packs,
- manage attribution notes,
- decide which assets become reusable family packs.

## Product rules for asset safety

- Prefer images, meshes, audio, and decorative models over code-bearing community models.
- Convert approved assets into Launchpad-managed bundles before showing them to kids.
- Store source, creator, and approval metadata for every public asset we use.
- Keep a "why this is safe" note on every curated pack.
- Make "replace asset" easier than "browse everything."

## The asset UX we actually need

The child should not browse thousands of assets.

The child should see shelves like:

- Happy obby pieces
- Cozy village props
- Pet quest rewards
- Funny sound effects
- Celebration effects
- Boss room decorations

Each shelf should have large preview cards and one-tap actions:

- Add to my world
- Swap current style
- Try a different color
- Use in all scenes

## The Studio handoff

The web app should output a project bundle, not just chat text.

That bundle should include:

- chosen template,
- selected scenes,
- approved assets,
- generated quest data,
- generated NPC data,
- generated script tasks,
- parent approval state.

The Studio plugin should then:

- open the linked project,
- show the bundle as a docked panel,
- preview changes,
- apply approved assets,
- create folders and scripts in predictable places,
- report back status.

## What the child sees vs what the adult sees

### Child view

- Pick a vibe
- Pick a theme
- Pick a goal
- Press build
- Add fun stuff
- Playtest
- Ask an adult to publish

### Adult view

- Review asset sources
- Review generated scripts
- Connect account
- Pick universe and place
- Approve import/apply
- Approve publish

## Product implications for this repo

### Near-term UX

- Add a real `Templates` lane instead of hiding template choice inside chat.
- Add an `Asset Shelf` lane that shows curated packs, not raw uploads.
- Rename `Inspiration` to split `My Inspiration` from `Approved Art Packs`.
- Add a `Parent Gate` action wherever Roblox linking or publish appears.

### Near-term data model

Add:

- `ApprovedAssetPack`
- `ApprovedAssetItem`
- `ApprovedCodePackage`
- `ProjectScene`
- `ProjectCharacter`
- `ProjectQuest`
- `ParentApprovalStep`

See also: `docs/local-roblox-asset-catalog.md` for the local manifest-first catalog approach.

### Near-term orchestration

The coach should generate structured steps like:

- plan,
- choose,
- decorate,
- script,
- test,
- publish.

Each step should have one big recommended action and two small alternatives.

## A simple north-star test

If an eight-year-old can sit down, click:

1. `Run and jump`
2. `Candy sky`
3. `Reach the golden flag`
4. `Build my game`

and within minutes get:

- a named world,
- a simple map,
- collectible rewards,
- one helper NPC,
- one playtest goal,

then the product is on the right track.

If not, it is still too much like a tool and not enough like a toy.
