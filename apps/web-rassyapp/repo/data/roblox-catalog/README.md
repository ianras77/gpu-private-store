# Roblox Catalog

This folder is the first local storage layer for Launchpad's reviewed Roblox build assets.

## Folders

- `packs/` contains manifest snapshots for reviewed asset shelves.
- `modules/` contains small reviewed Luau starter modules the LLM can reference.
- `world-recipes.json` contains shared world-profile and map-pattern snapshots for the map crew.

## Why this exists

The LLM needs concrete local references:

- bundle keys
- target Studio paths
- local module paths
- reviewed storage modes

This keeps worldbuilding grounded in actual reusable pieces instead of only natural-language shelf names.

## New world-generation layer

The catalog now stores more than simple prop shelves.

We also keep:

- biome-oriented pack manifests
- landmark and traversal manifests
- atmosphere and foliage manifests
- map recipe snapshots
- small local Luau helpers for zones, ambience, collectibles, and guide NPCs

This is the bridge between:

- the kid-facing `Map Forge`
- the multi-step terrain / landmark / scenery agents
- future Studio import and apply workers
