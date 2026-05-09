# World Generation Engine

## Goal

Make world-building the first visible win.

Kids should feel like the game is becoming real before deeper scripting is finished, so the app needs a structured world recipe that terrain, landmark, and scenery agents can all share.

## Core layers

1. `World profile`

- chooses the biome fantasy
- defines skyline, zone themes, scenery hooks, and mood

2. `Map pattern`

- chooses the route shape
- defines zone order, traversal beats, and landmark rules

3. `Asset mix`

- merges approved shelves with the world recipe
- gives the LLM local bundle keys, target paths, and safe pack combinations

4. `World crew`

- map architect
- biome mixer
- hero landmark artist
- set dresser
- mood mixer

## Why this matters

The asset catalog is not just a list of props now.

It is a combinatorial layer that helps the LLM avoid cookie-cutter output by varying:

- biome family
- route shape
- landmark rhythm
- scenery density
- atmosphere treatment
- pack synergy

## Current outputs

The world engine now feeds:

- the shared `Map Forge` tab
- build-plan art direction
- live coach prompts
- writer-room promotion context
- terrain / landmarks / scenery agent handoffs

## Next phase

Add an ingestion worker that can:

1. review more public Roblox assets into these local pack families,
2. attach thumbnails and verified asset ids,
3. output Studio-ready import manifests,
4. let world agents apply map passes zone by zone.
