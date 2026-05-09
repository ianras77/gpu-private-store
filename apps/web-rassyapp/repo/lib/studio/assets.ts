export type AssetSourceType =
  | "Roblox sample shelf"
  | "Creator Store curated"
  | "Kenney review pack";

export type AssetStorageMode = "roblox-reference" | "inventory-library" | "launchpad-local";

export type WorldLayer =
  | "terrain"
  | "landmarks"
  | "scenery"
  | "traversal"
  | "atmosphere"
  | "rewards"
  | "ui"
  | "audio";

export type RobloxAssetKind =
  | "model"
  | "mesh"
  | "material"
  | "audio"
  | "effect"
  | "ui"
  | "module";

export type RobloxInsertTarget =
  | "Workspace"
  | "ReplicatedStorage"
  | "StarterGui"
  | "ServerScriptService"
  | "MaterialService"
  | "SoundService"
  | "Lighting";

export type ApprovedCodePackage = {
  slug: string;
  title: string;
  kind: "luau-module";
  sourceLabel: string;
  storageMode: "launchpad-local" | "inventory-library";
  localModulePath: string;
  targetContainer: RobloxInsertTarget;
  purpose: string;
  starterTemplates: string[];
  worldLayers?: WorldLayer[];
  apiShape: string[];
  buildHints: string[];
};

export type ApprovedAssetItem = {
  slug: string;
  title: string;
  kind: RobloxAssetKind;
  storageMode: AssetStorageMode;
  sourceLabel: string;
  sourceType: AssetSourceType;
  summary: string;
  localBundleKey: string;
  localManifestPath: string;
  robloxAssetId?: string | null;
  libraryName?: string | null;
  creatorStoreSearch?: string | null;
  targetContainer: RobloxInsertTarget;
  targetPath: string;
  instanceHint: string;
  placementHint: string;
  worldLayer?: WorldLayer;
  biomeTags?: string[];
  zoneRoles?: string[];
  variationHooks?: string[];
  tags: string[];
  buildHints: string[];
  safetyNote: string;
};

export type ApprovedAssetPack = {
  slug: string;
  title: string;
  shelf: string;
  sourceLabel: string;
  sourceType: AssetSourceType;
  summary: string;
  safetyNote: string;
  reviewMode: string;
  ageBand: string;
  recommendedTemplateSlugs: string[];
  sampleItems: string[];
  actions: string[];
  localCatalogStatus: "Seeded locally";
  packCategory?:
    | "biome"
    | "landmark"
    | "scenery"
    | "traversal"
    | "atmosphere"
    | "reward"
    | "audio"
    | "ui";
  worldLayer?: WorldLayer;
  biomeTags?: string[];
  styleTags?: string[];
  synergyPackSlugs?: string[];
  variationHooks?: string[];
  items: ApprovedAssetItem[];
  codePackageSlugs: string[];
};

export const APPROVED_CODE_PACKAGES: ApprovedCodePackage[] = [
  {
    slug: "launchpad-checkpoint-service",
    title: "Checkpoint Service",
    kind: "luau-module",
    sourceLabel: "Launchpad reviewed local module",
    storageMode: "launchpad-local",
    localModulePath: "data/roblox-catalog/modules/checkpoint-service.luau",
    targetContainer: "ReplicatedStorage",
    purpose: "Tracks checkpoint progress and hands restart information to obby and racing templates.",
    starterTemplates: ["obby-rush", "speed-sprint"],
    worldLayers: ["traversal", "rewards"],
    apiShape: ["CheckpointService.registerCheckpoint(part, checkpointId)", "CheckpointService.resetPlayer(player)"],
    buildHints: [
      "Reference from ServerScriptService controller scripts",
      "Pair with visible checkpoint arches or flags",
      "Keep checkpoint ids readable and ordered by zone"
    ]
  },
  {
    slug: "launchpad-quest-state",
    title: "Quest State",
    kind: "luau-module",
    sourceLabel: "Launchpad reviewed local module",
    storageMode: "launchpad-local",
    localModulePath: "data/roblox-catalog/modules/quest-state.luau",
    targetContainer: "ReplicatedStorage",
    purpose: "Stores simple quest progress, reward flags, and friendly objective text for story and pet templates.",
    starterTemplates: ["pet-quest", "story-quest"],
    worldLayers: ["rewards", "ui"],
    apiShape: [
      "QuestState.beginQuest(player, questId)",
      "QuestState.completeStep(player, questId, stepId)",
      "QuestState.getQuestSummary(player)"
    ],
    buildHints: [
      "Use for short multi-step objectives only",
      "Pair with quest markers and simple reward props",
      "Keep quest ids stable so NPC dialogue can refer to them"
    ]
  },
  {
    slug: "launchpad-reward-pop",
    title: "Reward Pop UI",
    kind: "luau-module",
    sourceLabel: "Launchpad reviewed local module",
    storageMode: "launchpad-local",
    localModulePath: "data/roblox-catalog/modules/reward-pop-ui.luau",
    targetContainer: "StarterGui",
    purpose: "Shows short reward banners, coin pops, and celebration moments without heavy UI complexity.",
    starterTemplates: ["obby-rush", "pet-quest", "speed-sprint", "story-quest"],
    worldLayers: ["ui", "rewards"],
    apiShape: ["RewardPop.show(player, title, subtitle)", "RewardPop.preview(message)"],
    buildHints: [
      "Use with short text only",
      "Keep celebration timing under two seconds",
      "Pair with sound bites or FX from approved shelves"
    ]
  },
  {
    slug: "launchpad-zone-graph",
    title: "Zone Graph",
    kind: "luau-module",
    sourceLabel: "Launchpad reviewed local module",
    storageMode: "launchpad-local",
    localModulePath: "data/roblox-catalog/modules/zone-graph.luau",
    targetContainer: "ReplicatedStorage",
    purpose: "Defines simple zone adjacency, spawn links, and route checkpoints for multi-pass world building.",
    starterTemplates: ["obby-rush", "pet-quest", "speed-sprint", "story-quest"],
    worldLayers: ["terrain", "traversal"],
    apiShape: [
      "ZoneGraph.new(zoneDefinitions)",
      "ZoneGraph.getNextZones(zoneId)",
      "ZoneGraph.getSpawnZone()"
    ],
    buildHints: [
      "Use to keep a multi-zone map readable",
      "Map one player-facing goal to each zone",
      "Keep graph branches shallow for younger players"
    ]
  },
  {
    slug: "launchpad-ambient-loop",
    title: "Ambient Loop",
    kind: "luau-module",
    sourceLabel: "Launchpad reviewed local module",
    storageMode: "launchpad-local",
    localModulePath: "data/roblox-catalog/modules/ambient-loop.luau",
    targetContainer: "SoundService",
    purpose: "Switches simple ambience, weather, and celebration sound loops by zone family or world state.",
    starterTemplates: ["pet-quest", "speed-sprint", "story-quest", "obby-rush"],
    worldLayers: ["audio", "atmosphere"],
    apiShape: [
      "AmbientLoop.playZone(zoneId, soundKey)",
      "AmbientLoop.stopZone(zoneId)",
      "AmbientLoop.fadeTo(soundKey)"
    ],
    buildHints: [
      "Use one base ambience loop per biome family",
      "Reserve louder stingers for wins and unlocks",
      "Fade between moods instead of hard cuts"
    ]
  },
  {
    slug: "launchpad-collectible-spawner",
    title: "Collectible Spawner",
    kind: "luau-module",
    sourceLabel: "Launchpad reviewed local module",
    storageMode: "launchpad-local",
    localModulePath: "data/roblox-catalog/modules/collectible-spawner.luau",
    targetContainer: "ServerScriptService",
    purpose: "Places simple coins, stars, shells, or gems in readable routes without heavy logic.",
    starterTemplates: ["obby-rush", "pet-quest", "speed-sprint"],
    worldLayers: ["rewards", "traversal"],
    apiShape: [
      "CollectibleSpawner.seedRoute(folder, collectibleKey)",
      "CollectibleSpawner.seedCluster(folder, collectibleKey, count)",
      "CollectibleSpawner.clear(folder)"
    ],
    buildHints: [
      "Use collectibles to guide movement, not overwhelm it",
      "Place clusters near optional detours or scenic bends",
      "Keep one collectible family per zone for clarity"
    ]
  },
  {
    slug: "launchpad-guide-npc",
    title: "Guide NPC",
    kind: "luau-module",
    sourceLabel: "Launchpad reviewed local module",
    storageMode: "launchpad-local",
    localModulePath: "data/roblox-catalog/modules/guide-npc.luau",
    targetContainer: "ReplicatedStorage",
    purpose: "Creates friendly helper prompts that point kids toward the next route or quest beat.",
    starterTemplates: ["pet-quest", "story-quest", "obby-rush"],
    worldLayers: ["ui", "landmarks"],
    apiShape: [
      "GuideNpc.attachPrompt(model, lines)",
      "GuideNpc.pointTo(part, label)",
      "GuideNpc.hidePrompt(model)"
    ],
    buildHints: [
      "Place only a few helper NPCs at route transitions",
      "Keep lines short and upbeat",
      "Use landmark references kids can actually see"
    ]
  }
];

const CODE_PACKAGE_BY_SLUG = new Map(
  APPROVED_CODE_PACKAGES.map((packageSeed) => [packageSeed.slug, packageSeed])
);

function assetItem(seed: ApprovedAssetItem): ApprovedAssetItem {
  return seed;
}

export const CURATED_ASSET_PACKS: ApprovedAssetPack[] = [
  {
    slug: "happy-obby-pieces",
    title: "Happy Obby Pieces",
    shelf: "Run and jump",
    sourceLabel: "Launchpad reviewed Roblox starter shelf",
    sourceType: "Roblox sample shelf",
    summary:
      "Bright platforms, checkpoint signs, coin props, and finish-celebration pieces for easy obstacle courses.",
    safetyNote: "Decor and play pieces only. No code-bearing community models in the child shelf.",
    reviewMode: "Kid-safe shelf",
    ageBand: "7-10",
    recommendedTemplateSlugs: ["obby-rush", "speed-sprint"],
    sampleItems: ["Checkpoint arch", "Coin ring", "Moving platform art", "Winner podium confetti"],
    actions: ["Add to challenge lane", "Swap current style", "Use in all scenes"],
    localCatalogStatus: "Seeded locally",
    codePackageSlugs: ["launchpad-checkpoint-service", "launchpad-reward-pop"],
    items: [
      assetItem({
        slug: "obby-checkpoint-arch",
        title: "Checkpoint Arch",
        kind: "model",
        storageMode: "inventory-library",
        sourceLabel: "Launchpad reviewed Roblox sample library reference",
        sourceType: "Roblox sample shelf",
        summary: "Friendly checkpoint arch for zone starts and restart anchors.",
        localBundleKey: "obby/checkpoint-arch",
        localManifestPath: "data/roblox-catalog/packs/happy-obby-pieces.json",
        libraryName: "Launchpad Obby Starter Library",
        creatorStoreSearch: "obby checkpoint arch roblox",
        targetContainer: "Workspace",
        targetPath: "Workspace/Map/Checkpoints",
        instanceHint: "Model",
        placementHint: "Place at the end of each challenge segment and pair with a checkpoint trigger part.",
        tags: ["checkpoint", "obby", "progression", "spawn"],
        buildHints: [
          "Anchor to flat terrain or platform tops",
          "Add one per zone, not one per jump",
          "Pair with checkpoint script trigger"
        ],
        safetyNote: "Visual landmark only. No embedded public scripts."
      }),
      assetItem({
        slug: "obby-coin-ring",
        title: "Coin Ring",
        kind: "model",
        storageMode: "inventory-library",
        sourceLabel: "Launchpad reviewed Roblox sample library reference",
        sourceType: "Roblox sample shelf",
        summary: "Curved collectible trail that helps kids read the best jump path.",
        localBundleKey: "obby/coin-ring",
        localManifestPath: "data/roblox-catalog/packs/happy-obby-pieces.json",
        libraryName: "Launchpad Obby Starter Library",
        creatorStoreSearch: "coin ring obby roblox",
        targetContainer: "Workspace",
        targetPath: "Workspace/Map/Collectibles",
        instanceHint: "Model",
        placementHint: "Suspend above safe jump arcs to guide players toward the next platform.",
        tags: ["coin", "collectible", "pathing", "reward"],
        buildHints: [
          "Use to indicate the safest route",
          "Keep collectible clusters readable from spawn",
          "Avoid placing coins inside hazards"
        ],
        safetyNote: "Collectible path art only."
      }),
      assetItem({
        slug: "obby-platform-skin",
        title: "Toy Platform Skin",
        kind: "mesh",
        storageMode: "inventory-library",
        sourceLabel: "Launchpad reviewed Roblox sample library reference",
        sourceType: "Roblox sample shelf",
        summary: "Bright platform topper for obby lanes and floating islands.",
        localBundleKey: "obby/platform-skin",
        localManifestPath: "data/roblox-catalog/packs/happy-obby-pieces.json",
        libraryName: "Core Curriculum Library",
        creatorStoreSearch: "platform island jump roblox",
        targetContainer: "Workspace",
        targetPath: "Workspace/Map/Platforms",
        instanceHint: "MeshPart",
        placementHint: "Use as the visible top layer on larger obstacle platforms and checkpoint islands.",
        tags: ["platform", "island", "meshpart", "floating"],
        buildHints: [
          "Use with anchored support parts underneath",
          "Scale carefully so jumps stay fair",
          "Recolor by zone to communicate difficulty"
        ],
        safetyNote: "Reviewed visual mesh only."
      }),
      assetItem({
        slug: "obby-finish-confetti",
        title: "Finish Confetti Burst",
        kind: "effect",
        storageMode: "launchpad-local",
        sourceLabel: "Launchpad reviewed local FX bundle",
        sourceType: "Roblox sample shelf",
        summary: "Short confetti pop for winner podium moments.",
        localBundleKey: "obby/finish-confetti",
        localManifestPath: "data/roblox-catalog/packs/happy-obby-pieces.json",
        targetContainer: "Workspace",
        targetPath: "Workspace/Map/CelebrationFX",
        instanceHint: "ParticleEmitter",
        placementHint: "Attach to finish podium anchors and trigger on course completion.",
        tags: ["fx", "celebration", "finish", "particle"],
        buildHints: [
          "Keep emission short and bright",
          "Trigger once per completion event",
          "Pair with reward pop UI"
        ],
        safetyNote: "Local particle-only bundle."
      })
    ]
  },
  {
    slug: "cozy-village-props",
    title: "Cozy Village Props",
    shelf: "Explore and collect",
    sourceLabel: "Launchpad reviewed Creator Store picks",
    sourceType: "Creator Store curated",
    summary:
      "Lanterns, market stands, trees, fences, and cottage props that make friendly adventure spaces feel alive fast.",
    safetyNote: "Approved visual props only, curated for family-friendly worlds and soft reading load.",
    reviewMode: "Kid-safe shelf",
    ageBand: "8-12",
    recommendedTemplateSlugs: ["pet-quest", "story-quest"],
    sampleItems: ["Lantern path", "Village stall", "Garden fence", "Cottage doorway"],
    actions: ["Decorate my hub", "Use in all scenes", "Make it cozier"],
    localCatalogStatus: "Seeded locally",
    codePackageSlugs: ["launchpad-quest-state"],
    items: [
      assetItem({
        slug: "village-lantern-path",
        title: "Lantern Path Set",
        kind: "model",
        storageMode: "roblox-reference",
        sourceLabel: "Launchpad reviewed Creator Store reference",
        sourceType: "Creator Store curated",
        summary: "Repeating lantern posts for cozy paths and clue trails.",
        localBundleKey: "village/lantern-path",
        localManifestPath: "data/roblox-catalog/packs/cozy-village-props.json",
        creatorStoreSearch: "cozy lantern path roblox village",
        targetContainer: "Workspace",
        targetPath: "Workspace/Map/Paths",
        instanceHint: "Model",
        placementHint: "Place along curves and entrances to make routes readable at a glance.",
        tags: ["lantern", "path", "navigation", "cozy"],
        buildHints: [
          "Use at zone edges and crossroads",
          "Keep spacing even for a calm rhythm",
          "Pair with fence or foliage kits"
        ],
        safetyNote: "Reviewed prop model only."
      }),
      assetItem({
        slug: "village-market-stall",
        title: "Market Stall",
        kind: "model",
        storageMode: "roblox-reference",
        sourceLabel: "Launchpad reviewed Creator Store reference",
        sourceType: "Creator Store curated",
        summary: "Friendly stall prefab for pet villages and quest hubs.",
        localBundleKey: "village/market-stall",
        localManifestPath: "data/roblox-catalog/packs/cozy-village-props.json",
        creatorStoreSearch: "market stall cozy village roblox",
        targetContainer: "Workspace",
        targetPath: "Workspace/Map/HubProps",
        instanceHint: "Model",
        placementHint: "Use one or two in the spawn hub to anchor NPCs and reward counters.",
        tags: ["hub", "market", "npc", "quest"],
        buildHints: [
          "Place near NPC interaction spots",
          "Leave walk space around the front edge",
          "Use as visual anchor for the main hub"
        ],
        safetyNote: "Reviewed hub prop only."
      }),
      assetItem({
        slug: "village-garden-fence",
        title: "Garden Fence Run",
        kind: "model",
        storageMode: "launchpad-local",
        sourceLabel: "Launchpad reviewed local prop bundle",
        sourceType: "Creator Store curated",
        summary: "Simple fence segments to define cozy play boundaries and quest areas.",
        localBundleKey: "village/garden-fence",
        localManifestPath: "data/roblox-catalog/packs/cozy-village-props.json",
        targetContainer: "Workspace",
        targetPath: "Workspace/Map/Boundaries",
        instanceHint: "Model",
        placementHint: "Use to frame gardens, pet yards, and non-playable edges without feeling harsh.",
        tags: ["fence", "boundary", "garden", "cozy"],
        buildHints: [
          "Guide movement softly instead of walling the player in",
          "Repeat in short runs around key spaces",
          "Use color variations per zone"
        ],
        safetyNote: "Local decorative boundary kit."
      }),
      assetItem({
        slug: "village-cottage-door",
        title: "Cottage Doorway",
        kind: "model",
        storageMode: "roblox-reference",
        sourceLabel: "Launchpad reviewed Creator Store reference",
        sourceType: "Creator Store curated",
        summary: "Readable quest entry landmark for homes, shops, and mystery cabins.",
        localBundleKey: "village/cottage-door",
        localManifestPath: "data/roblox-catalog/packs/cozy-village-props.json",
        creatorStoreSearch: "cottage doorway stylized roblox",
        targetContainer: "Workspace",
        targetPath: "Workspace/Map/Landmarks",
        instanceHint: "Model",
        placementHint: "Use as a focal entry for a story scene, quest home, or pet rescue cabin.",
        tags: ["door", "landmark", "house", "story"],
        buildHints: [
          "Use one per major building",
          "Frame with lanterns or signs for readability",
          "Keep approach paths uncluttered"
        ],
        safetyNote: "Reviewed visual entry prop only."
      })
    ]
  },
  {
    slug: "pet-quest-rewards",
    title: "Pet Quest Rewards",
    shelf: "Help cute pets",
    sourceLabel: "Launchpad reviewed Roblox starter shelf",
    sourceType: "Roblox sample shelf",
    summary:
      "Reward chests, badge icons, pet food props, and friendly quest markers for cozy collection games.",
    safetyNote: "Reward props and icons are reviewed for simple readable gameplay and low confusion.",
    reviewMode: "Kid-safe shelf",
    ageBand: "8-12",
    recommendedTemplateSlugs: ["pet-quest"],
    sampleItems: ["Treat chest", "Quest star marker", "Pet bed", "Friendly reward badge"],
    actions: ["Add quest rewards", "Upgrade my pet zone", "Use in celebration scene"],
    localCatalogStatus: "Seeded locally",
    codePackageSlugs: ["launchpad-quest-state", "launchpad-reward-pop"],
    items: [
      assetItem({
        slug: "pet-treat-chest",
        title: "Treat Chest",
        kind: "model",
        storageMode: "launchpad-local",
        sourceLabel: "Launchpad reviewed local reward bundle",
        sourceType: "Roblox sample shelf",
        summary: "Simple reward chest for completed pet quests and unlock scenes.",
        localBundleKey: "pet/treat-chest",
        localManifestPath: "data/roblox-catalog/packs/pet-quest-rewards.json",
        targetContainer: "Workspace",
        targetPath: "Workspace/Map/Rewards",
        instanceHint: "Model",
        placementHint: "Place at the end of a rescue path or beside the pet mayor NPC.",
        tags: ["reward", "chest", "pet", "quest"],
        buildHints: [
          "Pair with reward pop UI and short sound cues",
          "Open only after quest completion",
          "Keep the interaction area obvious"
        ],
        safetyNote: "Local reward prop only."
      }),
      assetItem({
        slug: "pet-quest-star-marker",
        title: "Quest Star Marker",
        kind: "ui",
        storageMode: "launchpad-local",
        sourceLabel: "Launchpad reviewed local icon bundle",
        sourceType: "Roblox sample shelf",
        summary: "Floating quest indicator for objective hotspots and NPC heads.",
        localBundleKey: "pet/quest-star-marker",
        localManifestPath: "data/roblox-catalog/packs/pet-quest-rewards.json",
        targetContainer: "Workspace",
        targetPath: "Workspace/Map/QuestMarkers",
        instanceHint: "BillboardGui",
        placementHint: "Attach above pets, chests, or drop-off points to show the next objective.",
        tags: ["quest", "marker", "ui", "objective"],
        buildHints: [
          "Use only for current objectives",
          "Keep the icon high contrast",
          "Hide once the step is complete"
        ],
        safetyNote: "Local UI marker only."
      }),
      assetItem({
        slug: "pet-bed-prop",
        title: "Pet Bed Prop",
        kind: "model",
        storageMode: "roblox-reference",
        sourceLabel: "Launchpad reviewed Creator Store reference",
        sourceType: "Roblox sample shelf",
        summary: "Friendly resting prop that makes pet zones feel lived in.",
        localBundleKey: "pet/pet-bed",
        localManifestPath: "data/roblox-catalog/packs/pet-quest-rewards.json",
        creatorStoreSearch: "cute pet bed roblox model",
        targetContainer: "Workspace",
        targetPath: "Workspace/Map/PetZone",
        instanceHint: "Model",
        placementHint: "Use near pet homes, rescue areas, or reward corners to communicate comfort.",
        tags: ["pet", "bed", "decor", "cozy"],
        buildHints: [
          "Group in twos or threes for a nursery feel",
          "Keep enough floor space for players to move around",
          "Use soft colors to match village props"
        ],
        safetyNote: "Reviewed decorative prop only."
      }),
      assetItem({
        slug: "pet-reward-badge",
        title: "Reward Badge Icon",
        kind: "ui",
        storageMode: "launchpad-local",
        sourceLabel: "Launchpad reviewed local icon bundle",
        sourceType: "Roblox sample shelf",
        summary: "Badge-style icon for quest complete moments and pet rank screens.",
        localBundleKey: "pet/reward-badge",
        localManifestPath: "data/roblox-catalog/packs/pet-quest-rewards.json",
        targetContainer: "StarterGui",
        targetPath: "StarterGui/RewardHud",
        instanceHint: "ImageLabel",
        placementHint: "Show in a small reward panel after completion, then dismiss quickly.",
        tags: ["badge", "reward", "ui", "pet"],
        buildHints: [
          "Keep icon count low",
          "Use in popups rather than permanent clutter",
          "Pair with a single clear reward sentence"
        ],
        safetyNote: "Local UI asset only."
      })
    ]
  },
  {
    slug: "storybook-camp-decor",
    title: "Storybook Camp Decor",
    shelf: "Solve a mystery",
    sourceLabel: "Launchpad reviewed Creator Store picks",
    sourceType: "Creator Store curated",
    summary:
      "Camp signs, clue props, tables, lanterns, and reveal-stage pieces for scene-based story adventures.",
    safetyNote: "Focused on environmental storytelling props instead of open-ended model browsing.",
    reviewMode: "Kid-safe shelf",
    ageBand: "9-13",
    recommendedTemplateSlugs: ["story-quest"],
    sampleItems: ["Clue board", "Camp lantern", "Cabin puzzle table", "Reveal stage banner"],
    actions: ["Add mystery props", "Build a clue trail", "Decorate my final scene"],
    localCatalogStatus: "Seeded locally",
    codePackageSlugs: ["launchpad-quest-state"],
    items: [
      assetItem({
        slug: "camp-clue-board",
        title: "Clue Board",
        kind: "model",
        storageMode: "launchpad-local",
        sourceLabel: "Launchpad reviewed local story prop bundle",
        sourceType: "Creator Store curated",
        summary: "Visual clue board for mystery hubs and recap scenes.",
        localBundleKey: "camp/clue-board",
        localManifestPath: "data/roblox-catalog/packs/storybook-camp-decor.json",
        targetContainer: "Workspace",
        targetPath: "Workspace/Map/StoryProps",
        instanceHint: "Model",
        placementHint: "Place near spawn or ranger cabin so players understand the mystery premise quickly.",
        tags: ["clue", "story", "mystery", "hub"],
        buildHints: [
          "Use as the first story beat anchor",
          "Reference active clues with nearby quest markers",
          "Keep text short and visual"
        ],
        safetyNote: "Local story prop only."
      }),
      assetItem({
        slug: "camp-lantern",
        title: "Camp Lantern",
        kind: "model",
        storageMode: "roblox-reference",
        sourceLabel: "Launchpad reviewed Creator Store reference",
        sourceType: "Creator Store curated",
        summary: "Warm camp lantern for trails, cabins, and reveal stages.",
        localBundleKey: "camp/lantern",
        localManifestPath: "data/roblox-catalog/packs/storybook-camp-decor.json",
        creatorStoreSearch: "camp lantern stylized roblox",
        targetContainer: "Workspace",
        targetPath: "Workspace/Map/LightingProps",
        instanceHint: "Model",
        placementHint: "Use to light story paths and focus attention on clue interactions.",
        tags: ["lantern", "light", "story", "path"],
        buildHints: [
          "Place on corners and scene transitions",
          "Pair with cabins or clue tables",
          "Use warm light values for a calm mystery tone"
        ],
        safetyNote: "Reviewed visual light prop only."
      }),
      assetItem({
        slug: "camp-puzzle-table",
        title: "Cabin Puzzle Table",
        kind: "model",
        storageMode: "roblox-reference",
        sourceLabel: "Launchpad reviewed Creator Store reference",
        sourceType: "Creator Store curated",
        summary: "Table set piece for a contained puzzle or clue combination moment.",
        localBundleKey: "camp/puzzle-table",
        localManifestPath: "data/roblox-catalog/packs/storybook-camp-decor.json",
        creatorStoreSearch: "wooden puzzle table cabin roblox",
        targetContainer: "Workspace",
        targetPath: "Workspace/Map/PuzzleProps",
        instanceHint: "Model",
        placementHint: "Place inside the cabin or reveal tent with room around it for players to gather.",
        tags: ["puzzle", "table", "cabin", "interaction"],
        buildHints: [
          "Use one key table per story scene",
          "Keep puzzle interaction surfaces uncluttered",
          "Pair with clue props, not combat"
        ],
        safetyNote: "Reviewed interaction set piece only."
      }),
      assetItem({
        slug: "camp-reveal-banner",
        title: "Reveal Stage Banner",
        kind: "ui",
        storageMode: "launchpad-local",
        sourceLabel: "Launchpad reviewed local stage bundle",
        sourceType: "Creator Store curated",
        summary: "Final reveal banner for the end of a mystery scene.",
        localBundleKey: "camp/reveal-banner",
        localManifestPath: "data/roblox-catalog/packs/storybook-camp-decor.json",
        targetContainer: "Workspace",
        targetPath: "Workspace/Map/RevealStage",
        instanceHint: "SurfaceGui",
        placementHint: "Attach to the final reveal wall or stage arch for a strong ending frame.",
        tags: ["banner", "ending", "story", "stage"],
        buildHints: [
          "Use once at the final reveal",
          "Keep text celebratory and short",
          "Pair with lanterns and celebration FX"
        ],
        safetyNote: "Local stage decoration only."
      })
    ]
  },
  {
    slug: "celebration-fx",
    title: "Celebration Effects",
    shelf: "Big finish moments",
    sourceLabel: "Launchpad reviewed mixed starter pack",
    sourceType: "Creator Store curated",
    summary:
      "Simple victory particles, bright signs, and finish-line flare for happy endings and level clears.",
    safetyNote: "Only lightweight effect bundles approved for child projects and reviewable by parents.",
    reviewMode: "Kid-safe shelf",
    ageBand: "7-13",
    recommendedTemplateSlugs: ["obby-rush", "pet-quest", "speed-sprint", "story-quest"],
    sampleItems: ["Confetti burst", "Victory sparkle", "Finish banner", "Reward glow"],
    actions: ["Add a win moment", "Upgrade my ending", "Make it more exciting"],
    localCatalogStatus: "Seeded locally",
    codePackageSlugs: ["launchpad-reward-pop"],
    items: [
      assetItem({
        slug: "celebration-confetti",
        title: "Confetti Burst",
        kind: "effect",
        storageMode: "launchpad-local",
        sourceLabel: "Launchpad reviewed local FX bundle",
        sourceType: "Creator Store curated",
        summary: "Short confetti emitter for goals, wins, and podium reveals.",
        localBundleKey: "celebration/confetti-burst",
        localManifestPath: "data/roblox-catalog/packs/celebration-fx.json",
        targetContainer: "Workspace",
        targetPath: "Workspace/Map/CelebrationFX",
        instanceHint: "ParticleEmitter",
        placementHint: "Parent under an invisible attachment at the reward point or podium.",
        tags: ["confetti", "fx", "win", "podium"],
        buildHints: [
          "Keep particle count low for performance",
          "Trigger only on milestone completion",
          "Use with one strong sound cue"
        ],
        safetyNote: "Local particle effect only."
      }),
      assetItem({
        slug: "celebration-reward-glow",
        title: "Reward Glow",
        kind: "effect",
        storageMode: "launchpad-local",
        sourceLabel: "Launchpad reviewed local FX bundle",
        sourceType: "Creator Store curated",
        summary: "Glow ring for reward pads, quest dropoffs, and finish flags.",
        localBundleKey: "celebration/reward-glow",
        localManifestPath: "data/roblox-catalog/packs/celebration-fx.json",
        targetContainer: "Workspace",
        targetPath: "Workspace/Map/RewardMarkers",
        instanceHint: "ParticleEmitter",
        placementHint: "Place beneath reward parts or at the feet of an NPC giving the reward.",
        tags: ["glow", "reward", "fx", "marker"],
        buildHints: [
          "Use as a waypoint for key rewards",
          "Make it visible but not noisy",
          "Pair with objective markers for younger players"
        ],
        safetyNote: "Local effect bundle only."
      }),
      assetItem({
        slug: "celebration-finish-banner",
        title: "Finish Banner",
        kind: "ui",
        storageMode: "launchpad-local",
        sourceLabel: "Launchpad reviewed local stage bundle",
        sourceType: "Creator Store curated",
        summary: "Simple finish-line banner for obbies, races, and story endings.",
        localBundleKey: "celebration/finish-banner",
        localManifestPath: "data/roblox-catalog/packs/celebration-fx.json",
        targetContainer: "Workspace",
        targetPath: "Workspace/Map/GoalMarkers",
        instanceHint: "SurfaceGui",
        placementHint: "Attach to an arch or wall visible from the last stretch of the path.",
        tags: ["finish", "banner", "goal", "race"],
        buildHints: [
          "Use at the final goal only",
          "Keep banner text large and simple",
          "Frame with FX or lanterns"
        ],
        safetyNote: "Local goal marker only."
      }),
      assetItem({
        slug: "celebration-victory-sparkle",
        title: "Victory Sparkle",
        kind: "effect",
        storageMode: "launchpad-local",
        sourceLabel: "Launchpad reviewed local FX bundle",
        sourceType: "Creator Store curated",
        summary: "Small sparkle emitter for rewards, pets, and unlockables.",
        localBundleKey: "celebration/victory-sparkle",
        localManifestPath: "data/roblox-catalog/packs/celebration-fx.json",
        targetContainer: "Workspace",
        targetPath: "Workspace/Map/HighlightFX",
        instanceHint: "ParticleEmitter",
        placementHint: "Attach to treasure chests, pet beds, or reveal props to signal importance.",
        tags: ["sparkle", "highlight", "reward", "pet"],
        buildHints: [
          "Use to pull focus to one important prop",
          "Avoid adding to every decorative item",
          "Best for rewards and reveals"
        ],
        safetyNote: "Local effect bundle only."
      })
    ]
  },
  {
    slug: "funny-sound-bites",
    title: "Funny Sound Bites",
    shelf: "Silly polish",
    sourceLabel: "Launchpad reviewed Kenney-style pack",
    sourceType: "Kenney review pack",
    summary:
      "Goofy pops, reward pings, button clicks, and light celebration sounds that make playtests feel alive.",
    safetyNote: "Reviewed audio cues only. No raw public upload browsing in kid mode.",
    reviewMode: "Kid-safe shelf",
    ageBand: "7-13",
    recommendedTemplateSlugs: ["obby-rush", "pet-quest", "speed-sprint", "story-quest"],
    sampleItems: ["Button pop", "Coin ping", "Quest complete chime", "Funny success honk"],
    actions: ["Add sounds", "Try sillier feedback", "Use on rewards"],
    localCatalogStatus: "Seeded locally",
    codePackageSlugs: ["launchpad-reward-pop"],
    items: [
      assetItem({
        slug: "sound-button-pop",
        title: "Button Pop",
        kind: "audio",
        storageMode: "launchpad-local",
        sourceLabel: "Launchpad reviewed local audio bundle",
        sourceType: "Kenney review pack",
        summary: "Quick UI pop for buttons and taps.",
        localBundleKey: "sound/button-pop",
        localManifestPath: "data/roblox-catalog/packs/funny-sound-bites.json",
        targetContainer: "SoundService",
        targetPath: "SoundService/UI",
        instanceHint: "Sound",
        placementHint: "Use for big action buttons like Build My World or reward confirmation.",
        tags: ["audio", "ui", "pop", "button"],
        buildHints: [
          "Keep volume light and friendly",
          "Use on confirmed actions only",
          "Avoid repeating too quickly"
        ],
        safetyNote: "Local audio cue only."
      }),
      assetItem({
        slug: "sound-coin-ping",
        title: "Coin Ping",
        kind: "audio",
        storageMode: "launchpad-local",
        sourceLabel: "Launchpad reviewed local audio bundle",
        sourceType: "Kenney review pack",
        summary: "Reward ping for coins, stars, and small collectibles.",
        localBundleKey: "sound/coin-ping",
        localManifestPath: "data/roblox-catalog/packs/funny-sound-bites.json",
        targetContainer: "SoundService",
        targetPath: "SoundService/Rewards",
        instanceHint: "Sound",
        placementHint: "Play on collectible touch or reward banner reveal.",
        tags: ["audio", "coin", "reward", "collectible"],
        buildHints: [
          "Use on every 1-3 second collectible event",
          "Keep pitch consistent for readability",
          "Pair with small sparkle FX"
        ],
        safetyNote: "Local audio cue only."
      }),
      assetItem({
        slug: "sound-quest-chime",
        title: "Quest Complete Chime",
        kind: "audio",
        storageMode: "launchpad-local",
        sourceLabel: "Launchpad reviewed local audio bundle",
        sourceType: "Kenney review pack",
        summary: "Warm chime for quest completion and unlock beats.",
        localBundleKey: "sound/quest-chime",
        localManifestPath: "data/roblox-catalog/packs/funny-sound-bites.json",
        targetContainer: "SoundService",
        targetPath: "SoundService/Rewards",
        instanceHint: "Sound",
        placementHint: "Use on quest completion and new-area unlock moments.",
        tags: ["audio", "quest", "reward", "unlock"],
        buildHints: [
          "Trigger only on meaningful milestones",
          "Keep one clear chime per event",
          "Pair with reward pop UI or banner"
        ],
        safetyNote: "Local audio cue only."
      }),
      assetItem({
        slug: "sound-success-honk",
        title: "Funny Success Honk",
        kind: "audio",
        storageMode: "launchpad-local",
        sourceLabel: "Launchpad reviewed local audio bundle",
        sourceType: "Kenney review pack",
        summary: "Silly win cue for kid-friendly celebration moments.",
        localBundleKey: "sound/success-honk",
        localManifestPath: "data/roblox-catalog/packs/funny-sound-bites.json",
        targetContainer: "SoundService",
        targetPath: "SoundService/Celebration",
        instanceHint: "Sound",
        placementHint: "Use sparingly for big wins or playful NPC moments.",
        tags: ["audio", "celebration", "funny", "win"],
        buildHints: [
          "Use for big moments, not every click",
          "Pair with confetti or victory banners",
          "Keep silliness opt-in for older kids"
        ],
        safetyNote: "Local audio cue only."
      })
    ]
  },
  {
    slug: "sky-island-terrain",
    title: "Sky Island Terrain",
    shelf: "Build floating worlds",
    sourceLabel: "Launchpad reviewed mixed starter pack",
    sourceType: "Roblox sample shelf",
    summary: "Floating island bases, cloud ramps, and balloon docks for kid-readable sky maps.",
    safetyNote: "Terrain and pathing pieces only, curated for bright readable worlds.",
    reviewMode: "Kid-safe shelf",
    ageBand: "7-12",
    recommendedTemplateSlugs: ["obby-rush", "pet-quest"],
    sampleItems: ["Floating grass shelf", "Cloud ramp", "Balloon dock"],
    actions: ["Start my sky map", "Add floating islands", "Make the world feel bigger"],
    localCatalogStatus: "Seeded locally",
    packCategory: "biome",
    worldLayer: "terrain",
    biomeTags: ["sky", "cloud", "floating"],
    styleTags: ["bright", "toy-box", "playful"],
    synergyPackSlugs: ["cloud-backdrop-fx", "happy-obby-pieces", "celebration-fx"],
    variationHooks: [
      "Swap bridge types between islands to avoid repetition",
      "Change island heights gradually so the route feels like progression",
      "Use one extra-wide rest island between harder challenge chains"
    ],
    codePackageSlugs: ["launchpad-zone-graph", "launchpad-checkpoint-service"],
    items: [
      assetItem({
        slug: "sky-floating-grass-shelf",
        title: "Floating Grass Shelf",
        kind: "model",
        storageMode: "launchpad-local",
        sourceLabel: "Launchpad reviewed local terrain bundle",
        sourceType: "Roblox sample shelf",
        summary: "Chunky floating island base for spawn plazas and safe rest zones.",
        localBundleKey: "sky/floating-grass-shelf",
        localManifestPath: "data/roblox-catalog/packs/world-biomes.json",
        targetContainer: "Workspace",
        targetPath: "Workspace/Map/Terrain",
        instanceHint: "Model",
        placementHint: "Use as a broad safe platform at spawn, checkpoint islands, or reveal overlooks.",
        worldLayer: "terrain",
        biomeTags: ["sky", "floating"],
        zoneRoles: ["hub", "rest zone", "reveal platform"],
        variationHooks: ["Rotate or scale the shelf silhouette between zones"],
        tags: ["terrain", "island", "floating", "platform"],
        buildHints: [
          "Anchor the visual island to invisible collision parts if needed",
          "Keep the first shelf larger than later challenge pads",
          "Use bright edge trims to improve jump readability"
        ],
        safetyNote: "Local terrain bundle only."
      }),
      assetItem({
        slug: "sky-cloud-ramp",
        title: "Cloud Ramp",
        kind: "model",
        storageMode: "launchpad-local",
        sourceLabel: "Launchpad reviewed local terrain bundle",
        sourceType: "Roblox sample shelf",
        summary: "Soft cloud incline that helps kids move between islands without every beat being a jump.",
        localBundleKey: "sky/cloud-ramp",
        localManifestPath: "data/roblox-catalog/packs/world-biomes.json",
        targetContainer: "Workspace",
        targetPath: "Workspace/Map/Paths",
        instanceHint: "Model",
        placementHint: "Use for recovery routes, gentle vertical climbs, or scenic transitions between harder jumps.",
        worldLayer: "traversal",
        biomeTags: ["sky", "cloud"],
        zoneRoles: ["transition", "safe path"],
        variationHooks: ["Alternate left-curving and right-curving ramps"],
        tags: ["cloud", "ramp", "path", "traversal"],
        buildHints: [
          "Use between high-energy challenge pockets",
          "Keep the cloud body wide enough for beginners",
          "Frame with cloud puffs or coins"
        ],
        safetyNote: "Local traversal prop only."
      }),
      assetItem({
        slug: "sky-balloon-dock",
        title: "Balloon Dock",
        kind: "model",
        storageMode: "roblox-reference",
        sourceLabel: "Launchpad reviewed Creator Store reference",
        sourceType: "Roblox sample shelf",
        summary: "Arrival landmark that sells the floating-world fantasy immediately.",
        localBundleKey: "sky/balloon-dock",
        localManifestPath: "data/roblox-catalog/packs/world-biomes.json",
        creatorStoreSearch: "balloon dock floating island roblox",
        targetContainer: "Workspace",
        targetPath: "Workspace/Map/Landmarks",
        instanceHint: "Model",
        placementHint: "Place at spawn or at the entry to a big reveal island as a route anchor.",
        worldLayer: "landmarks",
        biomeTags: ["sky", "floating"],
        zoneRoles: ["spawn landmark", "reveal landmark"],
        variationHooks: ["Change balloon colors by district"],
        tags: ["balloon", "dock", "landmark", "spawn"],
        buildHints: [
          "Keep visible from the first camera angle",
          "Use flags or signs to connect it to the route",
          "Pair with clouds or podium FX for big reveals"
        ],
        safetyNote: "Reviewed landmark reference only."
      })
    ]
  },
  {
    slug: "candy-kingdom-scenery",
    title: "Candy Kingdom Scenery",
    shelf: "Make it sweeter",
    sourceLabel: "Launchpad reviewed local style pack",
    sourceType: "Kenney review pack",
    summary: "Oversized sweets, candy fences, and toy-like decorations that stop bright worlds from feeling flat.",
    safetyNote: "Decorative candy props only, with no hidden scripts or mystery logic.",
    reviewMode: "Kid-safe shelf",
    ageBand: "7-12",
    recommendedTemplateSlugs: ["obby-rush", "story-quest"],
    sampleItems: ["Lollipop grove", "Gumdrop fence", "Frosting arch"],
    actions: ["Sweeten my world", "Add candy scenery", "Make the path sillier"],
    localCatalogStatus: "Seeded locally",
    packCategory: "scenery",
    worldLayer: "scenery",
    biomeTags: ["candy", "bright", "toy"],
    styleTags: ["cartoon", "playful", "sweet"],
    synergyPackSlugs: ["cloud-backdrop-fx", "happy-obby-pieces", "funny-sound-bites"],
    variationHooks: [
      "Swap treat families by zone so every district has a new flavor",
      "Use giant props near landmarks and tiny sweets near paths",
      "Keep the finish space the brightest and most decorated"
    ],
    codePackageSlugs: ["launchpad-collectible-spawner", "launchpad-reward-pop"],
    items: [
      assetItem({
        slug: "candy-lollipop-grove",
        title: "Lollipop Grove",
        kind: "model",
        storageMode: "launchpad-local",
        sourceLabel: "Launchpad reviewed local prop bundle",
        sourceType: "Kenney review pack",
        summary: "Tree-like candy cluster for plazas and path borders.",
        localBundleKey: "candy/lollipop-grove",
        localManifestPath: "data/roblox-catalog/packs/world-biomes.json",
        targetContainer: "Workspace",
        targetPath: "Workspace/Map/Scenery",
        instanceHint: "Model",
        placementHint: "Group beside plaza edges or behind low fences so the route stays clear.",
        worldLayer: "scenery",
        biomeTags: ["candy"],
        zoneRoles: ["hub decor", "path border"],
        variationHooks: ["Swap candy colors in repeating clusters"],
        tags: ["candy", "tree", "decor", "bright"],
        buildHints: [
          "Repeat in small groves instead of even spacing",
          "Use the tallest candy trees near landmarks",
          "Keep candy colors aligned with the zone palette"
        ],
        safetyNote: "Local decorative prop only."
      }),
      assetItem({
        slug: "candy-gumdrop-fence",
        title: "Gumdrop Fence",
        kind: "model",
        storageMode: "launchpad-local",
        sourceLabel: "Launchpad reviewed local prop bundle",
        sourceType: "Kenney review pack",
        summary: "Soft-looking boundary kit that frames safe paths without feeling harsh.",
        localBundleKey: "candy/gumdrop-fence",
        localManifestPath: "data/roblox-catalog/packs/world-biomes.json",
        targetContainer: "Workspace",
        targetPath: "Workspace/Map/Boundaries",
        instanceHint: "Model",
        placementHint: "Use around play lawns, candy plazas, or route edges that need soft guidance.",
        worldLayer: "scenery",
        biomeTags: ["candy"],
        zoneRoles: ["boundary", "hub frame"],
        variationHooks: ["Change gumdrop size or color every few segments"],
        tags: ["fence", "boundary", "candy", "path"],
        buildHints: [
          "Use short runs to guide rather than wall off players",
          "Pair with lollipop groves or frosting arches",
          "Keep gates obvious at path transitions"
        ],
        safetyNote: "Local boundary kit only."
      }),
      assetItem({
        slug: "candy-frosting-arch",
        title: "Frosting Arch",
        kind: "model",
        storageMode: "launchpad-local",
        sourceLabel: "Launchpad reviewed local prop bundle",
        sourceType: "Kenney review pack",
        summary: "Big readable arch for checkpoints, district entries, or finish moments.",
        localBundleKey: "candy/frosting-arch",
        localManifestPath: "data/roblox-catalog/packs/world-biomes.json",
        targetContainer: "Workspace",
        targetPath: "Workspace/Map/Landmarks",
        instanceHint: "Model",
        placementHint: "Use as a district gate, a route milestone, or the final candy-crown reveal.",
        worldLayer: "landmarks",
        biomeTags: ["candy"],
        zoneRoles: ["checkpoint", "district gate", "finish landmark"],
        variationHooks: ["Top each arch with a different candy crown or treat"],
        tags: ["arch", "landmark", "checkpoint", "candy"],
        buildHints: [
          "Keep the frosting silhouette clear from distance",
          "Pair with confetti or reward glows at big milestones",
          "Use only a few major arches so each one matters"
        ],
        safetyNote: "Local landmark prop only."
      })
    ]
  },
  {
    slug: "pirate-harbor-landmarks",
    title: "Pirate Harbor Landmarks",
    shelf: "Treasure coast",
    sourceLabel: "Launchpad reviewed Creator Store picks",
    sourceType: "Creator Store curated",
    summary: "Dock landmarks, lookout towers, and ship silhouettes that instantly sell a harbor map.",
    safetyNote: "Reviewed visual harbor props only, with no code-bearing ships or kits.",
    reviewMode: "Kid-safe shelf",
    ageBand: "8-12",
    recommendedTemplateSlugs: ["pet-quest", "story-quest", "obby-rush"],
    sampleItems: ["Harbor dock set", "Shipwreck arch", "Lookout tower"],
    actions: ["Build my harbor", "Add treasure landmarks", "Make the bay feel alive"],
    localCatalogStatus: "Seeded locally",
    packCategory: "landmark",
    worldLayer: "landmarks",
    biomeTags: ["pirate", "coastal", "water"],
    styleTags: ["adventure", "wood", "treasure"],
    synergyPackSlugs: ["weather-and-lighting", "funny-sound-bites", "celebration-fx"],
    variationHooks: [
      "Use one ship silhouette per district, not everywhere",
      "Mix open dock plazas with tighter cave or fort spaces",
      "Let treasure markers pull players toward optional corners"
    ],
    codePackageSlugs: ["launchpad-zone-graph", "launchpad-guide-npc"],
    items: [
      assetItem({
        slug: "pirate-harbor-dock-set",
        title: "Harbor Dock Set",
        kind: "model",
        storageMode: "roblox-reference",
        sourceLabel: "Launchpad reviewed Creator Store reference",
        sourceType: "Creator Store curated",
        summary: "Layered dock pieces for spawn coves, quest harbors, or treasure hubs.",
        localBundleKey: "pirate/harbor-dock-set",
        localManifestPath: "data/roblox-catalog/packs/world-landmarks.json",
        creatorStoreSearch: "stylized pirate dock harbor roblox",
        targetContainer: "Workspace",
        targetPath: "Workspace/Map/Landmarks",
        instanceHint: "Model",
        placementHint: "Use at spawn or at a treasure harbor where kids should stop and understand the next route.",
        worldLayer: "landmarks",
        biomeTags: ["pirate", "coastal"],
        zoneRoles: ["spawn landmark", "hub landmark"],
        variationHooks: ["Swap props like nets, crates, and posts between docks"],
        tags: ["dock", "harbor", "pirate", "spawn"],
        buildHints: [
          "Keep enough open floor around the dock for NPCs and players",
          "Angle the dock toward the next route or treasure vista",
          "Use one dock family per district for consistency"
        ],
        safetyNote: "Reviewed dock reference only."
      }),
      assetItem({
        slug: "pirate-shipwreck-arch",
        title: "Shipwreck Arch",
        kind: "model",
        storageMode: "roblox-reference",
        sourceLabel: "Launchpad reviewed Creator Store reference",
        sourceType: "Creator Store curated",
        summary: "Broken ship silhouette that doubles as a route gate or reward frame.",
        localBundleKey: "pirate/shipwreck-arch",
        localManifestPath: "data/roblox-catalog/packs/world-landmarks.json",
        creatorStoreSearch: "shipwreck arch stylized roblox",
        targetContainer: "Workspace",
        targetPath: "Workspace/Map/RouteLandmarks",
        instanceHint: "Model",
        placementHint: "Place at a route squeeze point or treasure reveal so the silhouette frames the next beat.",
        worldLayer: "landmarks",
        biomeTags: ["pirate", "coastal"],
        zoneRoles: ["route gate", "reward frame"],
        variationHooks: ["Use broken mast angle or sail scraps to differentiate districts"],
        tags: ["shipwreck", "arch", "treasure", "landmark"],
        buildHints: [
          "Leave wide walk space through the arch",
          "Pair with coin trails or reward glow markers",
          "Use sparingly so the shape keeps its wow factor"
        ],
        safetyNote: "Reviewed shipwreck reference only."
      }),
      assetItem({
        slug: "pirate-lookout-tower",
        title: "Lookout Tower",
        kind: "model",
        storageMode: "roblox-reference",
        sourceLabel: "Launchpad reviewed Creator Store reference",
        sourceType: "Creator Store curated",
        summary: "Tall coastal landmark that helps orientation across a wide pirate map.",
        localBundleKey: "pirate/lookout-tower",
        localManifestPath: "data/roblox-catalog/packs/world-landmarks.json",
        creatorStoreSearch: "pirate lookout tower roblox stylized",
        targetContainer: "Workspace",
        targetPath: "Workspace/Map/Skyline",
        instanceHint: "Model",
        placementHint: "Place on a cliff edge or fort corner so it reads from multiple route angles.",
        worldLayer: "landmarks",
        biomeTags: ["pirate", "coastal"],
        zoneRoles: ["skyline anchor", "orientation landmark"],
        variationHooks: ["Change banner or lantern color by district"],
        tags: ["tower", "lookout", "skyline", "pirate"],
        buildHints: [
          "Use one or two max in a beginner map",
          "Keep the tower higher than nearby cliffs or roofs",
          "Use as a sightline anchor for returning to the hub"
        ],
        safetyNote: "Reviewed skyline reference only."
      })
    ]
  },
  {
    slug: "jungle-ruins-explorer",
    title: "Jungle Ruins Explorer",
    shelf: "Lush adventure",
    sourceLabel: "Launchpad reviewed mixed starter pack",
    sourceType: "Creator Store curated",
    summary: "Ruins, vine gates, and waterfall props for exploration-heavy worlds.",
    safetyNote: "Exploration props only, curated to stay adventurous without combat or hidden scripts.",
    reviewMode: "Kid-safe shelf",
    ageBand: "8-13",
    recommendedTemplateSlugs: ["story-quest", "pet-quest"],
    sampleItems: ["Vine gate", "Stone ruin arch", "Waterfall cave mouth"],
    actions: ["Grow the jungle", "Add ruins", "Make my map more adventurous"],
    localCatalogStatus: "Seeded locally",
    packCategory: "landmark",
    worldLayer: "landmarks",
    biomeTags: ["jungle", "ruins", "waterfall"],
    styleTags: ["lush", "exploration", "mystery"],
    synergyPackSlugs: ["forest-trail-foliage", "weather-and-lighting", "celebration-fx"],
    variationHooks: [
      "Use one ruin piece as the anchor and let foliage change around it",
      "Make water or vines carry the eye between spaces",
      "Alternate bright clearings with denser ruin pockets"
    ],
    codePackageSlugs: ["launchpad-zone-graph", "launchpad-guide-npc"],
    items: [
      assetItem({
        slug: "jungle-vine-gate",
        title: "Vine Gate",
        kind: "model",
        storageMode: "launchpad-local",
        sourceLabel: "Launchpad reviewed local landmark bundle",
        sourceType: "Creator Store curated",
        summary: "Softly overgrown gate for route reveals and clue transitions.",
        localBundleKey: "jungle/vine-gate",
        localManifestPath: "data/roblox-catalog/packs/world-landmarks.json",
        targetContainer: "Workspace",
        targetPath: "Workspace/Map/RouteLandmarks",
        instanceHint: "Model",
        placementHint: "Use at path transitions, clue sites, or entrances to scenic ruins.",
        worldLayer: "landmarks",
        biomeTags: ["jungle", "ruins"],
        zoneRoles: ["route gate", "story beat"],
        variationHooks: ["Change vine thickness or flower accent colors between zones"],
        tags: ["gate", "vines", "jungle", "story"],
        buildHints: [
          "Frame the next route or clue clearly beyond the gate",
          "Keep interaction zones in front of the gate uncluttered",
          "Pair with lanterns or reward markers if it gates progress"
        ],
        safetyNote: "Local landmark bundle only."
      }),
      assetItem({
        slug: "jungle-stone-arch",
        title: "Stone Ruin Arch",
        kind: "model",
        storageMode: "roblox-reference",
        sourceLabel: "Launchpad reviewed Creator Store reference",
        sourceType: "Creator Store curated",
        summary: "Classic ruin silhouette that instantly sells an old jungle civilization.",
        localBundleKey: "jungle/stone-arch",
        localManifestPath: "data/roblox-catalog/packs/world-landmarks.json",
        creatorStoreSearch: "stylized jungle ruin arch roblox",
        targetContainer: "Workspace",
        targetPath: "Workspace/Map/Landmarks",
        instanceHint: "Model",
        placementHint: "Use as the signature landmark for a ruin court, waterfall ledge, or story puzzle site.",
        worldLayer: "landmarks",
        biomeTags: ["jungle", "ruins"],
        zoneRoles: ["hero landmark", "puzzle site"],
        variationHooks: ["Use moss, banners, or nearby props to customize each ruin"],
        tags: ["arch", "ruin", "landmark", "jungle"],
        buildHints: [
          "Make the arch visible from at least one earlier path bend",
          "Give it breathing room so the silhouette stays clear",
          "Use only one big hero arch per district"
        ],
        safetyNote: "Reviewed ruin reference only."
      }),
      assetItem({
        slug: "jungle-waterfall-cave",
        title: "Waterfall Cave Mouth",
        kind: "model",
        storageMode: "launchpad-local",
        sourceLabel: "Launchpad reviewed local landmark bundle",
        sourceType: "Creator Store curated",
        summary: "Scenic waterfall entrance that feels like a secret without hiding the path too much.",
        localBundleKey: "jungle/waterfall-cave",
        localManifestPath: "data/roblox-catalog/packs/world-landmarks.json",
        targetContainer: "Workspace",
        targetPath: "Workspace/Map/RevealSpots",
        instanceHint: "Model",
        placementHint: "Use for a reward pocket, optional shortcut, or story reveal bend.",
        worldLayer: "landmarks",
        biomeTags: ["jungle", "waterfall"],
        zoneRoles: ["secret reveal", "reward pocket"],
        variationHooks: ["Change the cave width or side plants between zones"],
        tags: ["waterfall", "cave", "reveal", "reward"],
        buildHints: [
          "Keep the cave mouth bright enough to read",
          "Use reward glow or lanterns if it hides a quest beat",
          "Pair with flowing water sound, not combat"
        ],
        safetyNote: "Local reveal prop only."
      })
    ]
  },
  {
    slug: "frost-peak-trails",
    title: "Frost Peak Trails",
    shelf: "Snowy climbs",
    sourceLabel: "Launchpad reviewed mixed starter pack",
    sourceType: "Creator Store curated",
    summary: "Icy ledges, snowy path props, and summit gates for vertical mountain maps.",
    safetyNote: "Terrain and navigation pieces only, curated for clear readable climbing routes.",
    reviewMode: "Kid-safe shelf",
    ageBand: "8-13",
    recommendedTemplateSlugs: ["obby-rush", "story-quest"],
    sampleItems: ["Ice ledge path", "Snow pine cluster", "Summit gate"],
    actions: ["Start my mountain", "Add icy climbs", "Build a summit reveal"],
    localCatalogStatus: "Seeded locally",
    packCategory: "traversal",
    worldLayer: "traversal",
    biomeTags: ["snow", "ice", "mountain"],
    styleTags: ["heroic", "cold", "vertical"],
    synergyPackSlugs: ["weather-and-lighting", "forest-trail-foliage", "celebration-fx"],
    variationHooks: [
      "Swap open ridges with sheltered cabin pockets",
      "Use color temperature to signal altitude changes",
      "Give each climb band one unique landmark silhouette"
    ],
    codePackageSlugs: ["launchpad-zone-graph", "launchpad-checkpoint-service"],
    items: [
      assetItem({
        slug: "frost-ice-ledge-path",
        title: "Ice Ledge Path",
        kind: "model",
        storageMode: "launchpad-local",
        sourceLabel: "Launchpad reviewed local terrain bundle",
        sourceType: "Creator Store curated",
        summary: "Chunky mountain ledge kit that makes upward routes readable even in a tall map.",
        localBundleKey: "frost/ice-ledge-path",
        localManifestPath: "data/roblox-catalog/packs/world-traversal.json",
        targetContainer: "Workspace",
        targetPath: "Workspace/Map/Paths",
        instanceHint: "Model",
        placementHint: "Use to build mid-height traversals, lookout bends, and safe rest ledges on a climb.",
        worldLayer: "traversal",
        biomeTags: ["snow", "ice"],
        zoneRoles: ["mid-climb", "rest path"],
        variationHooks: ["Mix straight ledges with a few slight curves"],
        tags: ["ledge", "path", "mountain", "ice"],
        buildHints: [
          "Add a visible safe edge or guide rail if drops are severe",
          "Use broader ledges right after difficult jumps",
          "Keep the camera sightline open toward the summit"
        ],
        safetyNote: "Local traversal bundle only."
      }),
      assetItem({
        slug: "frost-snow-pine-cluster",
        title: "Snow Pine Cluster",
        kind: "model",
        storageMode: "launchpad-local",
        sourceLabel: "Launchpad reviewed local scenery bundle",
        sourceType: "Creator Store curated",
        summary: "Evergreen cluster that stops mountain maps from feeling empty without blocking the route.",
        localBundleKey: "frost/snow-pine-cluster",
        localManifestPath: "data/roblox-catalog/packs/world-foliage.json",
        targetContainer: "Workspace",
        targetPath: "Workspace/Map/Scenery",
        instanceHint: "Model",
        placementHint: "Place on ridge edges, cabin corners, or lower slopes outside the main path.",
        worldLayer: "scenery",
        biomeTags: ["snow", "forest"],
        zoneRoles: ["scenery fill", "edge dressing"],
        variationHooks: ["Mix tall and short pines by altitude band"],
        tags: ["pine", "snow", "foliage", "mountain"],
        buildHints: [
          "Keep trees off the exact jump line",
          "Use denser clusters in calmer lower zones",
          "Use fewer trees near exposed high ridges"
        ],
        safetyNote: "Local scenery bundle only."
      }),
      assetItem({
        slug: "frost-summit-gate",
        title: "Summit Gate",
        kind: "model",
        storageMode: "roblox-reference",
        sourceLabel: "Launchpad reviewed Creator Store reference",
        sourceType: "Creator Store curated",
        summary: "Big summit marker that makes the final climb feel worth it.",
        localBundleKey: "frost/summit-gate",
        localManifestPath: "data/roblox-catalog/packs/world-traversal.json",
        creatorStoreSearch: "snow summit gate roblox stylized",
        targetContainer: "Workspace",
        targetPath: "Workspace/Map/Finale",
        instanceHint: "Model",
        placementHint: "Place on the last ridge or celebration platform to frame the finish and skyline.",
        worldLayer: "landmarks",
        biomeTags: ["snow", "mountain"],
        zoneRoles: ["summit landmark", "finish frame"],
        variationHooks: ["Change banner or glow color for each mountain theme"],
        tags: ["summit", "gate", "finish", "snow"],
        buildHints: [
          "Show the summit gate from at least one lower ridge",
          "Pair with celebration FX and a rest platform",
          "Keep the summit area wider than the approach"
        ],
        safetyNote: "Reviewed final landmark only."
      })
    ]
  },
  {
    slug: "desert-dune-paths",
    title: "Desert Dune Paths",
    shelf: "Wide-open adventure",
    sourceLabel: "Launchpad reviewed Creator Store picks",
    sourceType: "Creator Store curated",
    summary: "Sandstone bridges, dune paths, and oasis anchors that keep desert maps from feeling empty.",
    safetyNote: "Reviewed pathing and landmark props only, focused on readable routes and safe scenery.",
    reviewMode: "Kid-safe shelf",
    ageBand: "8-13",
    recommendedTemplateSlugs: ["speed-sprint", "story-quest", "obby-rush"],
    sampleItems: ["Dune ridge path", "Sandstone bridge", "Oasis checkpoint"],
    actions: ["Shape my desert", "Add travel routes", "Give the map a cool oasis"],
    localCatalogStatus: "Seeded locally",
    packCategory: "traversal",
    worldLayer: "traversal",
    biomeTags: ["desert", "sand", "sun"],
    styleTags: ["open", "adventure", "warm"],
    synergyPackSlugs: ["weather-and-lighting", "funny-sound-bites", "castle-courtyard-builder"],
    variationHooks: [
      "Use banners, ruins, or palms to break up big open spaces",
      "Let the oasis be the visual reset after brighter dune paths",
      "Curve routes so every new arch or bridge reveals gradually"
    ],
    codePackageSlugs: ["launchpad-zone-graph", "launchpad-collectible-spawner"],
    items: [
      assetItem({
        slug: "desert-dune-ridge-path",
        title: "Dune Ridge Path",
        kind: "model",
        storageMode: "launchpad-local",
        sourceLabel: "Launchpad reviewed local terrain bundle",
        sourceType: "Creator Store curated",
        summary: "Rolling sand ridge that gives long routes better direction than flat open dunes.",
        localBundleKey: "desert/dune-ridge-path",
        localManifestPath: "data/roblox-catalog/packs/world-traversal.json",
        targetContainer: "Workspace",
        targetPath: "Workspace/Map/Paths",
        instanceHint: "Model",
        placementHint: "Use as the main route spine or as side ridges that frame a race line or clue trail.",
        worldLayer: "terrain",
        biomeTags: ["desert", "sand"],
        zoneRoles: ["route spine", "world frame"],
        variationHooks: ["Change ridge height and curve per district"],
        tags: ["dune", "ridge", "path", "desert"],
        buildHints: [
          "Keep one side of the dune path lower for easy sightlines",
          "Use palms or banners as wayfinding anchors",
          "Add occasional cool-color pockets like shade tents or water"
        ],
        safetyNote: "Local terrain bundle only."
      }),
      assetItem({
        slug: "desert-sandstone-bridge",
        title: "Sandstone Bridge",
        kind: "model",
        storageMode: "roblox-reference",
        sourceLabel: "Launchpad reviewed Creator Store reference",
        sourceType: "Creator Store curated",
        summary: "Natural-looking arch bridge that makes canyons and dry riverbeds easier to route.",
        localBundleKey: "desert/sandstone-bridge",
        localManifestPath: "data/roblox-catalog/packs/world-traversal.json",
        creatorStoreSearch: "sandstone bridge stylized roblox",
        targetContainer: "Workspace",
        targetPath: "Workspace/Map/Bridges",
        instanceHint: "Model",
        placementHint: "Use over dry channels, race hazards, or shortcut reveals to keep the map readable.",
        worldLayer: "traversal",
        biomeTags: ["desert", "stone"],
        zoneRoles: ["bridge", "shortcut"],
        variationHooks: ["Alternate high arch bridges with flatter spans"],
        tags: ["bridge", "sandstone", "desert", "route"],
        buildHints: [
          "Give the bridge a visible entry and exit landmark",
          "Use one big bridge per zone for memorable silhouette",
          "Keep collectible trails aligned with the bridge arc"
        ],
        safetyNote: "Reviewed pathing reference only."
      }),
      assetItem({
        slug: "desert-oasis-checkpoint",
        title: "Oasis Checkpoint",
        kind: "model",
        storageMode: "launchpad-local",
        sourceLabel: "Launchpad reviewed local landmark bundle",
        sourceType: "Creator Store curated",
        summary: "Cooling landmark and checkpoint rest stop that breaks up long sunny routes.",
        localBundleKey: "desert/oasis-checkpoint",
        localManifestPath: "data/roblox-catalog/packs/world-landmarks.json",
        targetContainer: "Workspace",
        targetPath: "Workspace/Map/Checkpoints",
        instanceHint: "Model",
        placementHint: "Use between longer desert segments or before a tougher challenge area as a visual reset.",
        worldLayer: "landmarks",
        biomeTags: ["desert", "oasis"],
        zoneRoles: ["checkpoint", "rest zone"],
        variationHooks: ["Change palm, banner, or pool color slightly by zone"],
        tags: ["oasis", "checkpoint", "rest", "desert"],
        buildHints: [
          "Use a broader footprint than ordinary checkpoints",
          "Pair with sound, shade, or reward beats for contrast",
          "Keep the checkpoint visible from earlier dunes"
        ],
        safetyNote: "Local landmark bundle only."
      })
    ]
  },
  {
    slug: "volcano-challenge-lane",
    title: "Volcano Challenge Lane",
    shelf: "Big dramatic climbs",
    sourceLabel: "Launchpad reviewed mixed starter pack",
    sourceType: "Roblox sample shelf",
    summary: "Lava lanes, obsidian bridges, and smoke vents that make danger feel exciting but readable.",
    safetyNote: "Challenge art only. All hazards still need Launchpad-owned logic and fair spacing.",
    reviewMode: "Kid-safe shelf",
    ageBand: "8-13",
    recommendedTemplateSlugs: ["obby-rush", "story-quest"],
    sampleItems: ["Lava stepping stones", "Obsidian bridge", "Smoke vent marker"],
    actions: ["Make it dramatic", "Add a volcano lane", "Upgrade my climb"],
    localCatalogStatus: "Seeded locally",
    packCategory: "traversal",
    worldLayer: "traversal",
    biomeTags: ["volcano", "lava", "fire"],
    styleTags: ["dramatic", "high-contrast", "challenge"],
    synergyPackSlugs: ["weather-and-lighting", "happy-obby-pieces", "celebration-fx"],
    variationHooks: [
      "Mix safe black-rock islands into glowing hazard sections",
      "Use smoke or glow to focus the player, not confuse them",
      "Break up red-orange zones with cooler obsidian rest platforms"
    ],
    codePackageSlugs: ["launchpad-checkpoint-service", "launchpad-zone-graph"],
    items: [
      assetItem({
        slug: "volcano-lava-stepping-stones",
        title: "Lava Stepping Stones",
        kind: "model",
        storageMode: "launchpad-local",
        sourceLabel: "Launchpad reviewed local challenge bundle",
        sourceType: "Roblox sample shelf",
        summary: "Clear stepping-stone set for lava crossings and kid-readable challenge runs.",
        localBundleKey: "volcano/lava-stepping-stones",
        localManifestPath: "data/roblox-catalog/packs/world-traversal.json",
        targetContainer: "Workspace",
        targetPath: "Workspace/Map/Hazards",
        instanceHint: "Model",
        placementHint: "Use for short crossing sequences or as accent beats inside a longer climb.",
        worldLayer: "traversal",
        biomeTags: ["volcano", "lava"],
        zoneRoles: ["hazard lane", "mid-climb"],
        variationHooks: ["Alternate stone size and spacing to ramp difficulty gently"],
        tags: ["lava", "stepping", "hazard", "obby"],
        buildHints: [
          "Keep the first few stones forgiving",
          "Use checkpoint islands before and after harder sections",
          "Leave space between hazards and landmarks"
        ],
        safetyNote: "Local challenge prop only."
      }),
      assetItem({
        slug: "volcano-obsidian-bridge",
        title: "Obsidian Bridge",
        kind: "model",
        storageMode: "launchpad-local",
        sourceLabel: "Launchpad reviewed local challenge bundle",
        sourceType: "Roblox sample shelf",
        summary: "Dark bridge span that makes a lava route feel dramatic without adding too much logic.",
        localBundleKey: "volcano/obsidian-bridge",
        localManifestPath: "data/roblox-catalog/packs/world-traversal.json",
        targetContainer: "Workspace",
        targetPath: "Workspace/Map/Bridges",
        instanceHint: "Model",
        placementHint: "Use as a visible bridge between lava islands or as a route marker above lower hazards.",
        worldLayer: "traversal",
        biomeTags: ["volcano", "obsidian"],
        zoneRoles: ["bridge", "route marker"],
        variationHooks: ["Use cracked or clean bridge versions by zone mood"],
        tags: ["bridge", "obsidian", "volcano", "path"],
        buildHints: [
          "Add glow or smoke only at the ends, not the whole span",
          "Keep bridge silhouettes straight and readable for kids",
          "Use the bridge to frame a future checkpoint or summit view"
        ],
        safetyNote: "Local bridge bundle only."
      }),
      assetItem({
        slug: "volcano-smoke-vent-marker",
        title: "Smoke Vent Marker",
        kind: "effect",
        storageMode: "launchpad-local",
        sourceLabel: "Launchpad reviewed local FX bundle",
        sourceType: "Roblox sample shelf",
        summary: "Low smoke marker that makes a volcanic route feel alive and gives the eye a path cue.",
        localBundleKey: "volcano/smoke-vent-marker",
        localManifestPath: "data/roblox-catalog/packs/world-atmosphere.json",
        targetContainer: "Workspace",
        targetPath: "Workspace/Map/Atmosphere",
        instanceHint: "ParticleEmitter",
        placementHint: "Use near lava bends, summit approaches, or hazard edges to hint at dramatic zones ahead.",
        worldLayer: "atmosphere",
        biomeTags: ["volcano", "lava"],
        zoneRoles: ["route cue", "mood beat"],
        variationHooks: ["Change smoke density by hazard intensity"],
        tags: ["smoke", "fx", "volcano", "route"],
        buildHints: [
          "Keep the smoke low-opacity so players can still see the path",
          "Use in clusters near landmarks, not across every route",
          "Pair with deeper red lighting only in finales"
        ],
        safetyNote: "Local atmosphere FX only."
      })
    ]
  },
  {
    slug: "space-station-raceway",
    title: "Space Station Raceway",
    shelf: "Fast sci-fi worlds",
    sourceLabel: "Launchpad reviewed mixed starter pack",
    sourceType: "Roblox sample shelf",
    summary: "Neon tunnels, launch pads, and ring gates for racing or futuristic obby worlds.",
    safetyNote: "Reviewed visual raceway parts only. Movement logic stays in Launchpad code paths.",
    reviewMode: "Kid-safe shelf",
    ageBand: "8-13",
    recommendedTemplateSlugs: ["speed-sprint", "obby-rush"],
    sampleItems: ["Neon tunnel", "Launch pad", "Ring gate"],
    actions: ["Build my raceway", "Make it feel futuristic", "Add a big sci-fi wow moment"],
    localCatalogStatus: "Seeded locally",
    packCategory: "traversal",
    worldLayer: "traversal",
    biomeTags: ["space", "neon", "sci-fi"],
    styleTags: ["arcade", "fast", "clean"],
    synergyPackSlugs: ["race-track-modules", "cloud-backdrop-fx", "funny-sound-bites"],
    variationHooks: [
      "Change lane glow color every district",
      "Use one enclosed tunnel after each open vista section",
      "Keep one giant ring gate visible ahead on the route"
    ],
    codePackageSlugs: ["launchpad-zone-graph", "launchpad-checkpoint-service", "launchpad-ambient-loop"],
    items: [
      assetItem({
        slug: "space-neon-tunnel",
        title: "Neon Tunnel",
        kind: "model",
        storageMode: "launchpad-local",
        sourceLabel: "Launchpad reviewed local race bundle",
        sourceType: "Roblox sample shelf",
        summary: "Enclosed fast-feeling tunnel that sells speed and focus.",
        localBundleKey: "space/neon-tunnel",
        localManifestPath: "data/roblox-catalog/packs/world-traversal.json",
        targetContainer: "Workspace",
        targetPath: "Workspace/Map/RouteLandmarks",
        instanceHint: "Model",
        placementHint: "Use before a big curve, boost run, or final approach so the route feels dramatic and obvious.",
        worldLayer: "traversal",
        biomeTags: ["space", "neon"],
        zoneRoles: ["speed lane", "focus tunnel"],
        variationHooks: ["Shift light color or window pattern between districts"],
        tags: ["tunnel", "neon", "race", "route"],
        buildHints: [
          "Keep entry and exit lines clean for a fast camera read",
          "Use as a route compressor before an open vista",
          "Avoid cluttering the tunnel with extra props"
        ],
        safetyNote: "Local raceway bundle only."
      }),
      assetItem({
        slug: "space-launch-pad",
        title: "Launch Pad",
        kind: "model",
        storageMode: "launchpad-local",
        sourceLabel: "Launchpad reviewed local race bundle",
        sourceType: "Roblox sample shelf",
        summary: "Big start-pad landmark that immediately sells a sci-fi race fantasy.",
        localBundleKey: "space/launch-pad",
        localManifestPath: "data/roblox-catalog/packs/world-landmarks.json",
        targetContainer: "Workspace",
        targetPath: "Workspace/Map/Spawn",
        instanceHint: "Model",
        placementHint: "Use under spawn, as a mid-map teleport story beat, or as the base of a finale route.",
        worldLayer: "landmarks",
        biomeTags: ["space", "sci-fi"],
        zoneRoles: ["spawn landmark", "launch reveal"],
        variationHooks: ["Change pad edge lighting by district"],
        tags: ["launch", "spawn", "space", "landmark"],
        buildHints: [
          "Keep the pad wide and flat for players spawning together",
          "Orient the pad toward the first route beat",
          "Pair with guide signs or a ring gate"
        ],
        safetyNote: "Local landmark bundle only."
      }),
      assetItem({
        slug: "space-ring-gate",
        title: "Ring Gate",
        kind: "model",
        storageMode: "roblox-reference",
        sourceLabel: "Launchpad reviewed Creator Store reference",
        sourceType: "Roblox sample shelf",
        summary: "Large gate ring that makes race lines, jump arcs, and reward routes obvious.",
        localBundleKey: "space/ring-gate",
        localManifestPath: "data/roblox-catalog/packs/world-landmarks.json",
        creatorStoreSearch: "sci fi ring gate roblox",
        targetContainer: "Workspace",
        targetPath: "Workspace/Map/Rings",
        instanceHint: "Model",
        placementHint: "Use above boosts, between floating platforms, or at big direction changes to aim the player.",
        worldLayer: "landmarks",
        biomeTags: ["space", "neon"],
        zoneRoles: ["route marker", "reward gate"],
        variationHooks: ["Change ring glow or trim color between sections"],
        tags: ["ring", "gate", "race", "route"],
        buildHints: [
          "Use rings to point where kids should go next",
          "Keep ring size generous for beginners",
          "Reserve the biggest ring for the final approach"
        ],
        safetyNote: "Reviewed ring reference only."
      })
    ]
  },
  {
    slug: "underwater-reef-decor",
    title: "Underwater Reef Decor",
    shelf: "Calm sea worlds",
    sourceLabel: "Launchpad reviewed mixed starter pack",
    sourceType: "Creator Store curated",
    summary: "Coral arches, bubble vents, and seaweed clusters that make underwater worlds feel magical fast.",
    safetyNote: "Decor and light FX only, curated for calm, family-friendly underwater scenes.",
    reviewMode: "Kid-safe shelf",
    ageBand: "7-13",
    recommendedTemplateSlugs: ["pet-quest", "story-quest"],
    sampleItems: ["Coral arch", "Bubble vent", "Seaweed cluster"],
    actions: ["Make it underwater", "Add reef scenery", "Soften the route"],
    localCatalogStatus: "Seeded locally",
    packCategory: "scenery",
    worldLayer: "scenery",
    biomeTags: ["underwater", "reef", "coral"],
    styleTags: ["calm", "magical", "soft"],
    synergyPackSlugs: ["weather-and-lighting", "celebration-fx", "funny-sound-bites"],
    variationHooks: [
      "Use one glow color per reef district",
      "Alternate open coral plazas with tighter arch tunnels",
      "Keep bubble lifts and coral tunnels easy to read from distance"
    ],
    codePackageSlugs: ["launchpad-ambient-loop", "launchpad-collectible-spawner"],
    items: [
      assetItem({
        slug: "reef-coral-arch",
        title: "Coral Arch",
        kind: "model",
        storageMode: "launchpad-local",
        sourceLabel: "Launchpad reviewed local scenery bundle",
        sourceType: "Creator Store curated",
        summary: "Curved reef silhouette that marks route transitions and scenic reveal points.",
        localBundleKey: "reef/coral-arch",
        localManifestPath: "data/roblox-catalog/packs/world-biomes.json",
        targetContainer: "Workspace",
        targetPath: "Workspace/Map/Landmarks",
        instanceHint: "Model",
        placementHint: "Use as a route gate between reef districts or as the frame to a bubble garden reward space.",
        worldLayer: "landmarks",
        biomeTags: ["underwater", "reef"],
        zoneRoles: ["route gate", "reveal frame"],
        variationHooks: ["Change coral color families by district"],
        tags: ["coral", "arch", "reef", "route"],
        buildHints: [
          "Use one main coral arch per district",
          "Keep the route visible through the arch opening",
          "Pair with bubble or shell rewards near optional pockets"
        ],
        safetyNote: "Local reef landmark only."
      }),
      assetItem({
        slug: "reef-bubble-vent",
        title: "Bubble Vent",
        kind: "effect",
        storageMode: "launchpad-local",
        sourceLabel: "Launchpad reviewed local FX bundle",
        sourceType: "Creator Store curated",
        summary: "Soft bubble column that adds vertical motion and can hint at lifts or reward spots.",
        localBundleKey: "reef/bubble-vent",
        localManifestPath: "data/roblox-catalog/packs/world-atmosphere.json",
        targetContainer: "Workspace",
        targetPath: "Workspace/Map/Atmosphere",
        instanceHint: "ParticleEmitter",
        placementHint: "Use in bubble gardens, above reward spots, or beside vertical route changes.",
        worldLayer: "atmosphere",
        biomeTags: ["underwater", "reef"],
        zoneRoles: ["mood beat", "vertical cue"],
        variationHooks: ["Use taller bubble columns near climactic spaces"],
        tags: ["bubble", "reef", "fx", "vertical"],
        buildHints: [
          "Use to guide the eye upward or toward a secret",
          "Keep bubble density light enough for visibility",
          "Combine with blue-green lighting, not hard spotlights"
        ],
        safetyNote: "Local atmosphere FX only."
      }),
      assetItem({
        slug: "reef-seaweed-cluster",
        title: "Seaweed Cluster",
        kind: "model",
        storageMode: "launchpad-local",
        sourceLabel: "Launchpad reviewed local scenery bundle",
        sourceType: "Creator Store curated",
        summary: "Soft plant cluster that fills edges and adds motion without cluttering the path.",
        localBundleKey: "reef/seaweed-cluster",
        localManifestPath: "data/roblox-catalog/packs/world-foliage.json",
        targetContainer: "Workspace",
        targetPath: "Workspace/Map/Scenery",
        instanceHint: "Model",
        placementHint: "Use on reef borders, around shell tunnels, or behind coral landmarks.",
        worldLayer: "scenery",
        biomeTags: ["underwater", "reef"],
        zoneRoles: ["edge dressing", "scenery fill"],
        variationHooks: ["Mix short and tall fronds between zones"],
        tags: ["seaweed", "reef", "scenery", "underwater"],
        buildHints: [
          "Keep route openings free of dense seaweed",
          "Use more clusters near calm reveal areas than speed lanes",
          "Blend with coral or shell props for texture variety"
        ],
        safetyNote: "Local scenery bundle only."
      })
    ]
  },
  {
    slug: "castle-courtyard-builder",
    title: "Castle Courtyard Builder",
    shelf: "Royal adventure",
    sourceLabel: "Launchpad reviewed mixed starter pack",
    sourceType: "Creator Store curated",
    summary: "Gatehouses, banner towers, and courtyard props that turn simple routes into heroic castle maps.",
    safetyNote: "Reviewed family-friendly castle props only. No combat-heavy or script-bearing kits.",
    reviewMode: "Kid-safe shelf",
    ageBand: "8-13",
    recommendedTemplateSlugs: ["pet-quest", "story-quest", "obby-rush"],
    sampleItems: ["Courtyard gate", "Banner tower", "Training yard set"],
    actions: ["Build my castle", "Add heroic landmarks", "Make it feel grand"],
    localCatalogStatus: "Seeded locally",
    packCategory: "landmark",
    worldLayer: "landmarks",
    biomeTags: ["castle", "stone", "royal"],
    styleTags: ["heroic", "clean", "layered"],
    synergyPackSlugs: ["forest-trail-foliage", "celebration-fx", "funny-sound-bites"],
    variationHooks: [
      "Assign a banner color family to each district",
      "Mix open yards with tighter stair or gate funnels",
      "Use one statue, fountain, or tower per plaza as the center"
    ],
    codePackageSlugs: ["launchpad-guide-npc", "launchpad-zone-graph"],
    items: [
      assetItem({
        slug: "castle-courtyard-gate",
        title: "Courtyard Gate",
        kind: "model",
        storageMode: "roblox-reference",
        sourceLabel: "Launchpad reviewed Creator Store reference",
        sourceType: "Creator Store curated",
        summary: "Main gate silhouette for castle entrances, district transitions, and finale reveals.",
        localBundleKey: "castle/courtyard-gate",
        localManifestPath: "data/roblox-catalog/packs/world-landmarks.json",
        creatorStoreSearch: "stylized castle gate roblox",
        targetContainer: "Workspace",
        targetPath: "Workspace/Map/Gates",
        instanceHint: "Model",
        placementHint: "Use at the main entry, between castle terraces, or to frame the royal keep route.",
        worldLayer: "landmarks",
        biomeTags: ["castle", "stone"],
        zoneRoles: ["main gate", "district gate"],
        variationHooks: ["Change banner colors or crest motifs per zone"],
        tags: ["gate", "castle", "stone", "route"],
        buildHints: [
          "Make the gate visible from the plaza before it",
          "Keep openings wide enough for multiple players",
          "Pair with signs, banners, or simple helper NPC prompts"
        ],
        safetyNote: "Reviewed castle gate reference only."
      }),
      assetItem({
        slug: "castle-banner-tower",
        title: "Banner Tower",
        kind: "model",
        storageMode: "launchpad-local",
        sourceLabel: "Launchpad reviewed local landmark bundle",
        sourceType: "Creator Store curated",
        summary: "Tall skyline tower that gives a castle map instant structure and orientation.",
        localBundleKey: "castle/banner-tower",
        localManifestPath: "data/roblox-catalog/packs/world-landmarks.json",
        targetContainer: "Workspace",
        targetPath: "Workspace/Map/Skyline",
        instanceHint: "Model",
        placementHint: "Place on district corners, at the royal keep, or beside wide courtyards to orient the player.",
        worldLayer: "landmarks",
        biomeTags: ["castle", "royal"],
        zoneRoles: ["skyline anchor", "orientation landmark"],
        variationHooks: ["Change banner color or top ornament to mark district identity"],
        tags: ["tower", "castle", "banner", "skyline"],
        buildHints: [
          "Use one tower family across the whole castle for cohesion",
          "Keep the hero tower taller than nearby gates",
          "Use banners to color-code districts or quest paths"
        ],
        safetyNote: "Local skyline landmark only."
      }),
      assetItem({
        slug: "castle-training-yard",
        title: "Training Yard Set",
        kind: "model",
        storageMode: "launchpad-local",
        sourceLabel: "Launchpad reviewed local scenery bundle",
        sourceType: "Creator Store curated",
        summary: "Practice props that give middle courtyards more purpose and life.",
        localBundleKey: "castle/training-yard",
        localManifestPath: "data/roblox-catalog/packs/world-foliage.json",
        targetContainer: "Workspace",
        targetPath: "Workspace/Map/Scenery",
        instanceHint: "Model",
        placementHint: "Use in side courtyards, quest training zones, or before the big keep staircase.",
        worldLayer: "scenery",
        biomeTags: ["castle", "royal"],
        zoneRoles: ["mid-plaza decor", "quest space"],
        variationHooks: ["Mix dummies, racks, and benches differently by zone"],
        tags: ["yard", "training", "scenery", "castle"],
        buildHints: [
          "Keep walk space clear around the center",
          "Use only a few prop clusters so the yard feels organized",
          "Pair with helper NPCs or reward markers for quests"
        ],
        safetyNote: "Local scenery bundle only."
      })
    ]
  },
  {
    slug: "forest-trail-foliage",
    title: "Forest Trail Foliage",
    shelf: "Cozy path dressing",
    sourceLabel: "Launchpad reviewed local style pack",
    sourceType: "Roblox sample shelf",
    summary: "Pines, flower patches, and signs that make outdoor worlds feel full without overcomplicating them.",
    safetyNote: "Soft scenery filler only, curated to support route readability.",
    reviewMode: "Kid-safe shelf",
    ageBand: "7-13",
    recommendedTemplateSlugs: ["pet-quest", "story-quest", "obby-rush"],
    sampleItems: ["Pine cluster", "Flower patch", "Trail signpost"],
    actions: ["Fill my paths", "Add more nature", "Make the world feel alive"],
    localCatalogStatus: "Seeded locally",
    packCategory: "scenery",
    worldLayer: "scenery",
    biomeTags: ["forest", "outdoor", "cozy"],
    styleTags: ["soft", "natural", "friendly"],
    synergyPackSlugs: ["cozy-village-props", "storybook-camp-decor", "weather-and-lighting"],
    variationHooks: [
      "Vary density based on play intensity so challenge spaces stay readable",
      "Use signs to reinforce route direction at soft bends",
      "Give every zone one signature flower or leaf color"
    ],
    codePackageSlugs: ["launchpad-guide-npc", "launchpad-ambient-loop"],
    items: [
      assetItem({
        slug: "forest-pine-cluster",
        title: "Pine Cluster",
        kind: "model",
        storageMode: "launchpad-local",
        sourceLabel: "Launchpad reviewed local foliage bundle",
        sourceType: "Roblox sample shelf",
        summary: "Simple evergreen cluster for path edges, clearings, and skyline softness.",
        localBundleKey: "forest/pine-cluster",
        localManifestPath: "data/roblox-catalog/packs/world-foliage.json",
        targetContainer: "Workspace",
        targetPath: "Workspace/Map/Scenery",
        instanceHint: "Model",
        placementHint: "Use outside the main route, around hub edges, or to frame cabins and landmarks.",
        worldLayer: "scenery",
        biomeTags: ["forest"],
        zoneRoles: ["edge dressing", "path frame"],
        variationHooks: ["Mix short and tall pines in loose triangles"],
        tags: ["trees", "pine", "forest", "scenery"],
        buildHints: [
          "Keep the main path and camera corridor clear",
          "Use larger clusters behind landmarks, not in front",
          "Thin out tree count near interactive props"
        ],
        safetyNote: "Local foliage bundle only."
      }),
      assetItem({
        slug: "forest-flower-patch",
        title: "Flower Patch",
        kind: "model",
        storageMode: "launchpad-local",
        sourceLabel: "Launchpad reviewed local foliage bundle",
        sourceType: "Roblox sample shelf",
        summary: "Low-color pop that helps outdoor maps feel designed instead of empty.",
        localBundleKey: "forest/flower-patch",
        localManifestPath: "data/roblox-catalog/packs/world-foliage.json",
        targetContainer: "Workspace",
        targetPath: "Workspace/Map/Scenery",
        instanceHint: "Model",
        placementHint: "Use in hubs, safe corners, around cottages, or as soft framing near rewards.",
        worldLayer: "scenery",
        biomeTags: ["forest", "garden"],
        zoneRoles: ["hub decor", "reward frame"],
        variationHooks: ["Assign one flower color family to each district"],
        tags: ["flowers", "forest", "garden", "decor"],
        buildHints: [
          "Use denser flower patches in calm areas",
          "Avoid placing them on the exact route line",
          "Pair with fences, lanterns, or signs for cozy clusters"
        ],
        safetyNote: "Local scenery bundle only."
      }),
      assetItem({
        slug: "forest-trail-signpost",
        title: "Trail Signpost",
        kind: "model",
        storageMode: "launchpad-local",
        sourceLabel: "Launchpad reviewed local path bundle",
        sourceType: "Roblox sample shelf",
        summary: "Small but powerful wayfinding prop for kids who need route clarity.",
        localBundleKey: "forest/trail-signpost",
        localManifestPath: "data/roblox-catalog/packs/world-foliage.json",
        targetContainer: "Workspace",
        targetPath: "Workspace/Map/Wayfinding",
        instanceHint: "Model",
        placementHint: "Use at forks, branch entrances, or right before scenic bends where route clarity might drop.",
        worldLayer: "landmarks",
        biomeTags: ["forest", "camp"],
        zoneRoles: ["wayfinding", "branch marker"],
        variationHooks: ["Change sign shape or icon by district"],
        tags: ["sign", "route", "path", "wayfinding"],
        buildHints: [
          "Keep sign text or icons very short",
          "Point sign direction toward a visible landmark if possible",
          "Use signs sparingly and only where the route is not obvious"
        ],
        safetyNote: "Local wayfinding prop only."
      })
    ]
  },
  {
    slug: "weather-and-lighting",
    title: "Weather and Lighting",
    shelf: "Mood and atmosphere",
    sourceLabel: "Launchpad reviewed local polish pack",
    sourceType: "Kenney review pack",
    summary: "Lighting moods, mist, and sky polish that give each biome a stronger identity with simple changes.",
    safetyNote: "Lightweight local atmosphere only, no dynamic post-process complexity for kid mode.",
    reviewMode: "Kid-safe shelf",
    ageBand: "7-13",
    recommendedTemplateSlugs: ["obby-rush", "pet-quest", "speed-sprint", "story-quest"],
    sampleItems: ["Sunrise sky mood", "Rain mist band", "Sunset rim light"],
    actions: ["Polish my world", "Change the mood", "Make the finale feel special"],
    localCatalogStatus: "Seeded locally",
    packCategory: "atmosphere",
    worldLayer: "atmosphere",
    biomeTags: ["sky", "forest", "desert", "snow", "volcano", "reef"],
    styleTags: ["mood", "polish", "zone identity"],
    synergyPackSlugs: ["cloud-backdrop-fx", "funny-sound-bites", "celebration-fx"],
    variationHooks: [
      "Use one base lighting mood per biome family",
      "Reserve the strongest mood shift for the finale or reward stage",
      "Let weather support landmarks instead of hiding them"
    ],
    codePackageSlugs: ["launchpad-ambient-loop"],
    items: [
      assetItem({
        slug: "weather-sunrise-sky-mood",
        title: "Sunrise Sky Mood",
        kind: "effect",
        storageMode: "launchpad-local",
        sourceLabel: "Launchpad reviewed local atmosphere bundle",
        sourceType: "Kenney review pack",
        summary: "Warm sky and light tuning for hopeful, beginner-friendly worlds.",
        localBundleKey: "weather/sunrise-sky",
        localManifestPath: "data/roblox-catalog/packs/world-atmosphere.json",
        targetContainer: "Lighting",
        targetPath: "Lighting",
        instanceHint: "Lighting preset",
        placementHint: "Use for hubs, first-playable versions, or victory spaces that should feel optimistic and easy to read.",
        worldLayer: "atmosphere",
        biomeTags: ["sky", "forest", "castle"],
        zoneRoles: ["hub mood", "victory mood"],
        variationHooks: ["Shift the accent glow color to match the biome"],
        tags: ["lighting", "sunrise", "mood", "warm"],
        buildHints: [
          "Keep the first zone brighter than later challenge areas",
          "Use sunrise moods when clarity matters more than drama",
          "Pair with gentle ambience or bell cues"
        ],
        safetyNote: "Local lighting preset only."
      }),
      assetItem({
        slug: "weather-rain-mist-band",
        title: "Rain Mist Band",
        kind: "effect",
        storageMode: "launchpad-local",
        sourceLabel: "Launchpad reviewed local atmosphere bundle",
        sourceType: "Kenney review pack",
        summary: "Soft mist strip for forests, harbors, and mystery scenes.",
        localBundleKey: "weather/rain-mist-band",
        localManifestPath: "data/roblox-catalog/packs/world-atmosphere.json",
        targetContainer: "Workspace",
        targetPath: "Workspace/Map/Atmosphere",
        instanceHint: "ParticleEmitter",
        placementHint: "Use at forest bends, harbor overlooks, or reveal clearings to add depth and story mood.",
        worldLayer: "atmosphere",
        biomeTags: ["forest", "pirate", "camp"],
        zoneRoles: ["mood beat", "depth cue"],
        variationHooks: ["Increase density slightly near story or clue spaces"],
        tags: ["mist", "rain", "weather", "mood"],
        buildHints: [
          "Use on edges and backgrounds, not the whole route",
          "Keep visibility high enough for younger players",
          "Combine with lanterns or guide landmarks for readability"
        ],
        safetyNote: "Local atmosphere FX only."
      }),
      assetItem({
        slug: "weather-sunset-rim-light",
        title: "Sunset Rim Light",
        kind: "effect",
        storageMode: "launchpad-local",
        sourceLabel: "Launchpad reviewed local atmosphere bundle",
        sourceType: "Kenney review pack",
        summary: "Warm rim-light treatment for finales, reveal stages, and skyline-heavy maps.",
        localBundleKey: "weather/sunset-rim-light",
        localManifestPath: "data/roblox-catalog/packs/world-atmosphere.json",
        targetContainer: "Lighting",
        targetPath: "Lighting",
        instanceHint: "Lighting preset",
        placementHint: "Use in finale yards, summits, or reward plazas to make the payoff space feel special.",
        worldLayer: "atmosphere",
        biomeTags: ["desert", "castle", "sky"],
        zoneRoles: ["finale mood", "reward mood"],
        variationHooks: ["Blend with a different accent color depending on the biome"],
        tags: ["lighting", "sunset", "finale", "mood"],
        buildHints: [
          "Save for later zones so the contrast feels meaningful",
          "Keep silhouettes readable against the warmer background",
          "Pair with confetti or reward banners, not every checkpoint"
        ],
        safetyNote: "Local lighting preset only."
      })
    ]
  },
  {
    slug: "race-track-modules",
    title: "Race Track Modules",
    shelf: "Fast readable routes",
    sourceLabel: "Launchpad reviewed local race pack",
    sourceType: "Roblox sample shelf",
    summary: "Boost gates, guardrails, and finish trusses that make race lines or fast obbies clearer.",
    safetyNote: "Route modules only. Speed or lap logic still stays in local reviewed code.",
    reviewMode: "Kid-safe shelf",
    ageBand: "8-13",
    recommendedTemplateSlugs: ["speed-sprint", "obby-rush"],
    sampleItems: ["Boost gate", "Hairpin guardrail", "Finish truss"],
    actions: ["Sharpen the route", "Add race clarity", "Make the finish feel real"],
    localCatalogStatus: "Seeded locally",
    packCategory: "traversal",
    worldLayer: "traversal",
    biomeTags: ["race", "space", "desert"],
    styleTags: ["fast", "arcade", "clean"],
    synergyPackSlugs: ["space-station-raceway", "funny-sound-bites", "celebration-fx"],
    variationHooks: [
      "Use different guardrail colors by district",
      "Keep boosts on obvious straightaways, not cluttered corners",
      "Give the finish truss the strongest signage and FX"
    ],
    codePackageSlugs: ["launchpad-checkpoint-service", "launchpad-collectible-spawner"],
    items: [
      assetItem({
        slug: "race-boost-gate",
        title: "Boost Gate",
        kind: "model",
        storageMode: "launchpad-local",
        sourceLabel: "Launchpad reviewed local track bundle",
        sourceType: "Roblox sample shelf",
        summary: "Visual boost marker that makes fast lanes easy to read before logic is applied.",
        localBundleKey: "race/boost-gate",
        localManifestPath: "data/roblox-catalog/packs/world-traversal.json",
        targetContainer: "Workspace",
        targetPath: "Workspace/Map/Boosts",
        instanceHint: "Model",
        placementHint: "Place on straightaways or before a rewardable speed burst, not before confusing turns.",
        worldLayer: "traversal",
        biomeTags: ["race"],
        zoneRoles: ["speed beat", "route cue"],
        variationHooks: ["Use bigger gates later in the course"],
        tags: ["boost", "race", "speed", "route"],
        buildHints: [
          "Make the gate visible from farther away than the boost part itself",
          "Leave a clean run-up area in front of the gate",
          "Use matching sound or particle cues only on active boosts"
        ],
        safetyNote: "Local track module only."
      }),
      assetItem({
        slug: "race-hairpin-guardrail",
        title: "Hairpin Guardrail",
        kind: "model",
        storageMode: "launchpad-local",
        sourceLabel: "Launchpad reviewed local track bundle",
        sourceType: "Roblox sample shelf",
        summary: "Curved guardrail that keeps fast turns readable and less frustrating.",
        localBundleKey: "race/hairpin-guardrail",
        localManifestPath: "data/roblox-catalog/packs/world-traversal.json",
        targetContainer: "Workspace",
        targetPath: "Workspace/Map/Barriers",
        instanceHint: "Model",
        placementHint: "Use on sharper bends, cliff-side turns, or around hub plazas that border the track.",
        worldLayer: "traversal",
        biomeTags: ["race"],
        zoneRoles: ["turn safety", "route frame"],
        variationHooks: ["Switch stripe colors between districts"],
        tags: ["guardrail", "turn", "race", "barrier"],
        buildHints: [
          "Keep the inside of the turn open enough to see through",
          "Use matching lane paint or lights to reinforce direction",
          "Use longer rails on later faster sections"
        ],
        safetyNote: "Local track module only."
      }),
      assetItem({
        slug: "race-finish-truss",
        title: "Finish Truss",
        kind: "model",
        storageMode: "launchpad-local",
        sourceLabel: "Launchpad reviewed local track bundle",
        sourceType: "Roblox sample shelf",
        summary: "Big readable finish-line frame for races, sprints, or challenge finales.",
        localBundleKey: "race/finish-truss",
        localManifestPath: "data/roblox-catalog/packs/world-landmarks.json",
        targetContainer: "Workspace",
        targetPath: "Workspace/Map/Finale",
        instanceHint: "Model",
        placementHint: "Use in the last straightaway or final challenge lane where the player should feel the payoff coming.",
        worldLayer: "landmarks",
        biomeTags: ["race"],
        zoneRoles: ["finish landmark", "finale frame"],
        variationHooks: ["Change sponsor colors or icon family by map theme"],
        tags: ["finish", "race", "finale", "landmark"],
        buildHints: [
          "Show the truss from one earlier course segment",
          "Keep the approach lane wide and uncluttered",
          "Pair with reward pop UI and confetti for payoff"
        ],
        safetyNote: "Local finish landmark only."
      })
    ]
  },
  {
    slug: "cloud-backdrop-fx",
    title: "Cloud Backdrop FX",
    shelf: "Skyline polish",
    sourceLabel: "Launchpad reviewed local atmosphere pack",
    sourceType: "Kenney review pack",
    summary: "Backdrops, drifting clouds, and rainbow arcs that widen a world without much extra complexity.",
    safetyNote: "Background polish only, curated to support a clear route silhouette.",
    reviewMode: "Kid-safe shelf",
    ageBand: "7-13",
    recommendedTemplateSlugs: ["obby-rush", "speed-sprint", "story-quest"],
    sampleItems: ["Drifting cloud plane", "Rainbow arc", "Skyline stars"],
    actions: ["Make it feel bigger", "Polish my skyline", "Add a big reveal backdrop"],
    localCatalogStatus: "Seeded locally",
    packCategory: "atmosphere",
    worldLayer: "atmosphere",
    biomeTags: ["sky", "space", "candy"],
    styleTags: ["big", "bright", "backdrop"],
    synergyPackSlugs: ["sky-island-terrain", "candy-kingdom-scenery", "space-station-raceway"],
    variationHooks: [
      "Use one hero backdrop effect per district, not all at once",
      "Let the backdrop support the landmark silhouette instead of replacing it",
      "Scale the backdrop with the route intensity so finales feel biggest"
    ],
    codePackageSlugs: ["launchpad-ambient-loop"],
    items: [
      assetItem({
        slug: "cloud-drifting-plane",
        title: "Drifting Cloud Plane",
        kind: "effect",
        storageMode: "launchpad-local",
        sourceLabel: "Launchpad reviewed local atmosphere bundle",
        sourceType: "Kenney review pack",
        summary: "Slow cloud layer that makes sky maps feel wide and alive.",
        localBundleKey: "cloud/drifting-plane",
        localManifestPath: "data/roblox-catalog/packs/world-atmosphere.json",
        targetContainer: "Workspace",
        targetPath: "Workspace/Map/Backdrop",
        instanceHint: "Model",
        placementHint: "Place far behind floating islands or skyline landmarks to add depth without changing play space.",
        worldLayer: "atmosphere",
        biomeTags: ["sky"],
        zoneRoles: ["backdrop", "depth cue"],
        variationHooks: ["Use denser cloud layers only in later or higher zones"],
        tags: ["cloud", "backdrop", "sky", "depth"],
        buildHints: [
          "Keep backdrop layers outside the playable camera corridor",
          "Use one or two depth bands, not many noisy layers",
          "Match cloud tint to the lighting mood"
        ],
        safetyNote: "Local backdrop only."
      }),
      assetItem({
        slug: "cloud-rainbow-arc",
        title: "Rainbow Arc",
        kind: "model",
        storageMode: "launchpad-local",
        sourceLabel: "Launchpad reviewed local atmosphere bundle",
        sourceType: "Kenney review pack",
        summary: "Big cheerful arc that frames a zone transition or finish skyline.",
        localBundleKey: "cloud/rainbow-arc",
        localManifestPath: "data/roblox-catalog/packs/world-atmosphere.json",
        targetContainer: "Workspace",
        targetPath: "Workspace/Map/Backdrop",
        instanceHint: "Model",
        placementHint: "Use behind a finish podium, a candy skyline, or a heroic floating-island reveal.",
        worldLayer: "atmosphere",
        biomeTags: ["sky", "candy"],
        zoneRoles: ["finale backdrop", "zone frame"],
        variationHooks: ["Change arc width or cloud base by zone size"],
        tags: ["rainbow", "backdrop", "finish", "sky"],
        buildHints: [
          "Use only one main rainbow in a beginner map",
          "Keep the arc behind the landmark, not blocking it",
          "Pair with confetti or finish banners for payoff"
        ],
        safetyNote: "Local backdrop only."
      }),
      assetItem({
        slug: "cloud-skyline-stars",
        title: "Skyline Stars",
        kind: "effect",
        storageMode: "launchpad-local",
        sourceLabel: "Launchpad reviewed local atmosphere bundle",
        sourceType: "Kenney review pack",
        summary: "Gentle star field that helps futuristic or dreamy worlds feel larger.",
        localBundleKey: "cloud/skyline-stars",
        localManifestPath: "data/roblox-catalog/packs/world-atmosphere.json",
        targetContainer: "Workspace",
        targetPath: "Workspace/Map/Backdrop",
        instanceHint: "ParticleEmitter",
        placementHint: "Use behind space lanes, high summits, or quiet night scenes where extra depth helps.",
        worldLayer: "atmosphere",
        biomeTags: ["space", "sky"],
        zoneRoles: ["backdrop", "finale mood"],
        variationHooks: ["Increase brightness only in the final third of the map"],
        tags: ["stars", "space", "backdrop", "mood"],
        buildHints: [
          "Use sparingly so the stars feel special",
          "Pair with cool rim lights for sci-fi worlds",
          "Keep particle density low for readability"
        ],
        safetyNote: "Local backdrop FX only."
      })
    ]
  }
];

const PACK_BY_SLUG = new Map(CURATED_ASSET_PACKS.map((pack) => [pack.slug, pack]));
const ITEM_BY_SLUG = new Map(
  CURATED_ASSET_PACKS.flatMap((pack) => pack.items.map((item) => [item.slug, item] as const))
);

export function getAssetPackBySlug(slug?: string | null) {
  return slug ? PACK_BY_SLUG.get(slug) ?? null : null;
}

export function getAssetPacksBySlugs(slugs?: string[] | null) {
  return Array.from(new Set(slugs ?? []))
    .map((slug) => PACK_BY_SLUG.get(slug) ?? null)
    .filter((pack): pack is ApprovedAssetPack => Boolean(pack));
}

export function getAssetItemBySlug(slug?: string | null) {
  return slug ? ITEM_BY_SLUG.get(slug) ?? null : null;
}

export function listAssetItemsForPacks(slugs?: string[] | null) {
  return getAssetPacksBySlugs(slugs).flatMap((pack) => pack.items);
}

export function listApprovedCodePackagesForPacks(slugs?: string[] | null) {
  const packageSlugs = Array.from(
    new Set(getAssetPacksBySlugs(slugs).flatMap((pack) => pack.codePackageSlugs))
  );

  return packageSlugs
    .map((slug) => CODE_PACKAGE_BY_SLUG.get(slug) ?? null)
    .filter((pkg): pkg is ApprovedCodePackage => Boolean(pkg));
}

export function listAssetPacksForWorldLayer(layer: WorldLayer) {
  return CURATED_ASSET_PACKS.filter((pack) => (pack.worldLayer ?? "scenery") === layer);
}

export function listAssetPacksForBiomeTags(tags?: string[] | null) {
  if (!tags?.length) return [] as ApprovedAssetPack[];
  const wanted = new Set(tags);
  return CURATED_ASSET_PACKS.filter((pack) => (pack.biomeTags ?? []).some((tag) => wanted.has(tag)));
}

export function summarizeAssetPacksForPrompt(
  packs: Array<{
    title: string;
    worldLayer?: string | null;
    packCategory?: string | null;
    biomeTags?: string[] | null;
  }>,
  maxItems = 6
) {
  return packs.slice(0, maxItems).map((pack) => {
    const layer = pack.worldLayer ? `layer:${pack.worldLayer}` : "layer:scenery";
    const category = pack.packCategory ? `category:${pack.packCategory}` : null;
    const biome = pack.biomeTags?.length ? `biomes:${pack.biomeTags.join("/")}` : null;
    return [pack.title, layer, category, biome].filter(Boolean).join(" ");
  });
}

export function summarizeAssetItemsForPrompt(
  items: Array<{
    title: string;
    targetPath: string;
    kind: string;
    localBundleKey: string;
    robloxAssetId?: string | null;
    libraryName?: string | null;
    creatorStoreSearch?: string | null;
  }>,
  maxItems = 6
) {
  return items.slice(0, maxItems).map((item) => {
    const reference =
      item.robloxAssetId
        ? `rbxassetid://${item.robloxAssetId}`
        : item.libraryName
          ? `library:${item.libraryName}`
          : item.creatorStoreSearch
            ? `search:${item.creatorStoreSearch}`
            : item.localBundleKey;
    return `${item.title} -> ${item.targetPath} (${item.kind}; ${reference})`;
  });
}

export function summarizeCodePackagesForPrompt(
  packages: Array<{
    title: string;
    targetContainer: string;
    localModulePath: string;
  }>,
  maxItems = 4
) {
  return packages.slice(0, maxItems).map((pkg) => {
    return `${pkg.title} -> ${pkg.targetContainer} (${pkg.localModulePath})`;
  });
}
