# Local Roblox Asset Catalog

## Goal

Give the LLM concrete Roblox building blocks it can reason about without exposing kids to raw public search.

## What we store locally

The catalog should store reviewed manifests, not just shelf names.

Each asset item includes:

- title
- kind
- storage mode
- world layer
- biome tags
- zone roles
- local bundle key
- local manifest path
- source label
- optional Roblox asset reference
- optional library name or Creator Store search seed
- target Studio container
- target path
- placement hint
- build hints
- safety note

This makes the catalog useful for:

- chat prompts
- writer-room routines
- world-recipe generation
- future Studio plugin import
- future review and sync tooling

## Storage modes

### `launchpad-local`

Use for assets and FX we fully review and keep as local bundles or local manifests.

Best for:

- UI markers
- small FX
- sound cues
- simple props

### `inventory-library`

Use for Roblox sample libraries or reviewed library assets that should be added to the creator inventory and reused.

Best for:

- starter kits
- checkpoint props
- reusable world pieces

### `roblox-reference`

Use when the reviewed item should stay as a cloud reference until a creator imports or snapshots it.

Best for:

- Creator Store props
- landmark sets
- larger environment pieces

## Why manifests matter more than raw IDs

The LLM needs:

- where the asset belongs
- what role it plays
- what safe bundle it maps to
- what script or module it pairs with

An asset id alone is not enough.

## Approved Luau package layer

The asset catalog also carries a tiny reviewed module registry.

This keeps generated Luau grounded in reusable building blocks instead of inventing every mechanic from scratch.

Starter modules:

- checkpoint service
- quest state
- reward pop UI
- zone graph
- ambient loop
- collectible spawner
- guide NPC

## World recipe layer

The catalog now supports a second layer above shelves:

- world profiles
- map patterns
- world crew roles

This lets the LLM combine:

- a biome family
- a route shape
- a landmark rhythm
- a scenery density
- a mood package

That combination is what keeps world generation broad instead of cookie-cutter.

## Next phase

Add a review worker that can:

1. query reviewed Creator Store results,
2. attach or confirm Roblox asset ids,
3. optionally snapshot assets into a local bundle store,
4. emit Studio-import manifests for the plugin bridge.
