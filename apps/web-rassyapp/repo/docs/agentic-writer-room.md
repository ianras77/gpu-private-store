# Agentic Writer Room

## Core idea

Rassy Launchpad should think like a small Roblox game studio made of specialist writers, not one giant chatbot.

The first thing kids want to see is a world.
That means the writer room should front-load visible worldbuilding:

1. `Pitch Writer`
2. `Terrain Writer`
3. `Landmark Writer`
4. `Scenery Writer`
5. `Quest Writer`
6. `Script Writer`
7. `Playtest Writer`

## Why world-first matters

Kids judge progress by what they can see.

If the app spends too long on abstract planning, quests, or internal structure, it will feel slow even if the logic is good.
The product should create visible Roblox progress early:

- a spawn area,
- a path,
- a hero landmark,
- cozy scenery,
- then gameplay loops.

This gives the child something exciting to react to while the deeper systems catch up.

## Writer stage responsibilities

### Pitch Writer

- turns kid language into one clear game promise
- picks the best starter template
- keeps the first version small

### Terrain Writer

- lays out the map by zones
- chooses the main path and major spaces
- keeps the world easy to read

### Landmark Writer

- adds the memorable set pieces
- creates the first "wow" moments
- anchors each zone visually

### Scenery Writer

- fills the world with props, color, atmosphere, sounds, and finishing detail
- uses approved asset shelves and repeated kits
- avoids clutter that hurts gameplay

### Quest Writer

- creates the objective loop
- places NPC jobs and reward beats
- translates scenery into reasons to explore

### Script Writer

- writes Luau only when needed
- names exact Roblox Studio placement
- keeps scripts small and remixable

### Playtest Writer

- checks clarity and fun
- proposes one simplification and one upgrade
- prepares the next handoff

## Single Cat now, many Cats later

This writer room should work in two modes:

### Shared engine mode

One Cheshire Cat install handles every writer role.
The app prompt acts like a director and moves work through the stages.

### Split engine mode

Multiple Cheshire Cat installs handle different specialties:

- `coach` for pitch and chat guidance
- `planner` for terrain, landmarks, quests
- `builder` for scenery and script-heavy build passes
- `critic` for playtest and review

The app should decide which backend to call, not the child.

## Persistence model

Each writer stage should be a durable routine with:

- `stageKey`
- `agentKey`
- `dependsOnRoutineId`
- `projectSnapshotJson`
- `handoffJson`

That lets the writer room act like a visible pipeline instead of a pile of unrelated chat messages.

## UX model

The child should be able to trigger one big action:

- `Build my world`

That single action should fan out into the world-first sequence:

1. terrain pass
2. landmark pass
3. scenery pass

After that, the app can suggest:

- `Add quests`
- `Add NPC helpers`
- `Add rewards`
- `Playtest my game`

This keeps the experience intuitive and visually rewarding.
