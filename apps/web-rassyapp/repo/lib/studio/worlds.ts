import { getAssetPacksBySlugs, type WorldLayer } from "@/lib/studio/assets";

export type WorldProfile = {
  slug: string;
  title: string;
  summary: string;
  mood: string;
  kidHook: string;
  starterTemplates: string[];
  biomeTags: string[];
  skyline: string;
  traversalStyle: string;
  zoneThemes: string[];
  landmarkIdeas: string[];
  sceneryHooks: string[];
  atmosphereHooks: string[];
  recommendedAssetPackSlugs: string[];
  recommendedMapPatternSlugs: string[];
  variationHooks: string[];
};

export type MapPattern = {
  slug: string;
  title: string;
  summary: string;
  starterTemplates: string[];
  worldProfileSlugs: string[];
  zoneFrames: string[];
  traversalBeats: string[];
  landmarkRules: string[];
  spawnDescription: string;
  finaleDescription: string;
  recommendedAssetPackSlugs: string[];
  worldLayers: WorldLayer[];
  variationHooks: string[];
};

export type WorldCrewRole = {
  slug: string;
  title: string;
  stageKey: "terrain" | "landmarks" | "scenery";
  mission: string;
  ownedLayers: WorldLayer[];
  dependsOnRoleSlug?: string;
  buildHints: string[];
};

export type WorldRecipe = {
  worldProfile: WorldProfile;
  mapPattern: MapPattern;
  headline: string;
  zoneSequence: string[];
  landmarkQueue: string[];
  traversalMoments: string[];
  sceneryClusters: string[];
  atmosphereBeats: string[];
  recommendedAssetPackSlugs: string[];
  recommendedAssetPackTitles: string[];
  promptLines: string[];
  crewLines: string[];
};

function unique(values: Array<string | null | undefined>, maxItems = 12) {
  return Array.from(
    new Set(values.filter((value): value is string => typeof value === "string" && value.trim().length > 0))
  ).slice(0, maxItems);
}

export const WORLD_PROFILES: WorldProfile[] = [
  {
    slug: "sky-islands",
    title: "Sky Islands",
    summary: "Floating toy-box islands, rainbow bridges, and puffy cloud landmarks built for quick wow moments.",
    mood: "Bright, breezy, and playful.",
    kidHook: "Jump from island to island like a cartoon hero.",
    starterTemplates: ["obby-rush", "pet-quest"],
    biomeTags: ["sky", "cloud", "floating", "bright"],
    skyline: "Layered cloud decks, balloon docks, and windmills on the horizon.",
    traversalStyle: "Short hops, spring pads, and clear bridges between islands.",
    zoneThemes: ["Cloud Dock", "Rainbow Stepway", "Balloon Meadow", "Star Podium"],
    landmarkIdeas: ["Balloon harbor tower", "Rainbow checkpoint arch", "Windmill island", "Winner cloud castle"],
    sceneryHooks: ["Cloud puffs under bridges", "Pastel shrubs", "Kite flags", "Toy crates at spawn"],
    atmosphereHooks: ["Soft sunrise rim light", "Bell chimes", "Slow drifting cloud layers"],
    recommendedAssetPackSlugs: [
      "sky-island-terrain",
      "cloud-backdrop-fx",
      "happy-obby-pieces",
      "celebration-fx"
    ],
    recommendedMapPatternSlugs: ["island-hop-chain", "climb-to-crown", "hub-and-spokes"],
    variationHooks: [
      "Change bridge types from wood to cloud to rainbow across zones",
      "Use one hero color per island so the route reads clearly",
      "Alternate wide rest islands with short challenge islands"
    ]
  },
  {
    slug: "candy-kingdom",
    title: "Candy Kingdom",
    summary: "Sugary landscapes with frosting cliffs, gumdrop fences, and oversized treats as landmarks.",
    mood: "Silly, colorful, and high-energy.",
    kidHook: "Everything looks edible and exciting.",
    starterTemplates: ["obby-rush", "story-quest"],
    biomeTags: ["candy", "sweet", "bright", "toy"],
    skyline: "Lollipop trees, frosting walls, and candy-cane towers.",
    traversalStyle: "Bouncy pads, wafer bridges, and frosting ramps.",
    zoneThemes: ["Taffy Plaza", "Cupcake Lane", "Frosting Ramparts", "Candy Crown Stage"],
    landmarkIdeas: ["Chocolate gate", "Gumdrop fountain", "Frosting arch", "Candy crown castle"],
    sceneryHooks: ["Lollipop forests", "Sprinkle trails", "Marshmallow stools", "Caramel puddles"],
    atmosphereHooks: ["Sparkly sweet dust", "Toy piano pings", "Sunset candy glow"],
    recommendedAssetPackSlugs: [
      "candy-kingdom-scenery",
      "cloud-backdrop-fx",
      "happy-obby-pieces",
      "funny-sound-bites"
    ],
    recommendedMapPatternSlugs: ["layered-kingdom", "island-hop-chain", "hub-and-spokes"],
    variationHooks: [
      "Shift the candy type by zone so each area feels new",
      "Mix giant treats with tiny prop clusters to vary scale",
      "Use one surprise dessert landmark per zone"
    ]
  },
  {
    slug: "pirate-bay",
    title: "Pirate Bay",
    summary: "A kid-friendly harbor with docks, lookout towers, shipwrecks, and treasure routes.",
    mood: "Adventurous, splashy, and treasure-hunty.",
    kidHook: "Sail between docks and find the hidden loot.",
    starterTemplates: ["pet-quest", "story-quest", "obby-rush"],
    biomeTags: ["coastal", "pirate", "water", "wood"],
    skyline: "Dock cranes, ship masts, lookout towers, and cliff caves.",
    traversalStyle: "Boardwalks, rope bridges, dock jumps, and little boat rides.",
    zoneThemes: ["Captain's Dock", "Treasure Cove", "Shipwreck Steps", "Lookout Fort"],
    landmarkIdeas: ["Pirate mast tower", "Shipwreck arch", "Treasure gate", "Fort cannon perch"],
    sceneryHooks: ["Barrels and ropes", "Seagull posts", "Crates and nets", "Treasure markers in sand"],
    atmosphereHooks: ["Ocean breeze loops", "Distant gull calls", "Golden afternoon light"],
    recommendedAssetPackSlugs: [
      "pirate-harbor-landmarks",
      "weather-and-lighting",
      "celebration-fx",
      "funny-sound-bites"
    ],
    recommendedMapPatternSlugs: ["treasure-rings", "river-run", "hub-and-spokes"],
    variationHooks: [
      "Swap open harbor views with enclosed cave pockets",
      "Use one shipwreck or mast silhouette as the hero shape in each zone",
      "Hide treasure rewards off the main path but keep them readable"
    ]
  },
  {
    slug: "jungle-ruins",
    title: "Jungle Ruins",
    summary: "Vines, stone arches, waterfalls, and old ruins that make exploration feel magical quickly.",
    mood: "Curious, lush, and lightly mysterious.",
    kidHook: "Explore lost ruins without making the world scary.",
    starterTemplates: ["story-quest", "pet-quest"],
    biomeTags: ["jungle", "ruins", "waterfall", "green"],
    skyline: "Stone towers, hanging vines, and cliffside waterfalls.",
    traversalStyle: "Stepping stones, hanging bridges, and cave entrances.",
    zoneThemes: ["Fern Gate", "Waterfall Pass", "Ruin Terrace", "Sun Idol Court"],
    landmarkIdeas: ["Vine gate", "Stone ruin arch", "Waterfall cave mouth", "Sun idol stage"],
    sceneryHooks: ["Broad-leaf clusters", "Mossy stones", "Firefly pockets", "Broken columns"],
    atmosphereHooks: ["Birdsong loops", "Waterfall mist", "Warm green bounce light"],
    recommendedAssetPackSlugs: [
      "jungle-ruins-explorer",
      "forest-trail-foliage",
      "weather-and-lighting",
      "celebration-fx"
    ],
    recommendedMapPatternSlugs: ["story-loop", "river-run", "climb-to-crown"],
    variationHooks: [
      "Alternate tight vine tunnels with open ruin courtyards",
      "Use water to lead the eye between zones",
      "Make each ruin piece look reclaimed by plants in a different way"
    ]
  },
  {
    slug: "frost-peaks",
    title: "Frost Peaks",
    summary: "Snowy ridges, icy bridges, and warm summit landmarks that turn vertical maps into big reveals.",
    mood: "Crisp, heroic, and cozy-cold.",
    kidHook: "Climb to the snowy summit and make it to the top.",
    starterTemplates: ["obby-rush", "story-quest"],
    biomeTags: ["snow", "ice", "mountain", "cold"],
    skyline: "Icy peaks, rope bridges, and glowing summit towers.",
    traversalStyle: "Careful ledges, short slides, and checkpoint cabins.",
    zoneThemes: ["Snow Base", "Ice Shelf Run", "Aurora Ridge", "Summit Beacon"],
    landmarkIdeas: ["Checkpoint cabin", "Frozen arch", "Aurora lookout", "Summit beacon tower"],
    sceneryHooks: ["Snow pine clusters", "Icicle edges", "Warm lantern pockets", "Crate caches"],
    atmosphereHooks: ["Soft wind loop", "Aurora sky tint", "Blue-white fog bands"],
    recommendedAssetPackSlugs: [
      "frost-peak-trails",
      "weather-and-lighting",
      "forest-trail-foliage",
      "celebration-fx"
    ],
    recommendedMapPatternSlugs: ["climb-to-crown", "island-hop-chain", "story-loop"],
    variationHooks: [
      "Mix warm safe huts with exposed icy stretches",
      "Use color temperature to mark safer versus harder zones",
      "Reveal the summit landmark from every major bend"
    ]
  },
  {
    slug: "desert-dunes",
    title: "Desert Dunes",
    summary: "Rolling sand, sandstone bridges, and oasis breaks that keep long routes readable.",
    mood: "Sunny, adventurous, and wide-open.",
    kidHook: "Cross the dunes and find the cool hidden oasis.",
    starterTemplates: ["speed-sprint", "story-quest", "obby-rush"],
    biomeTags: ["desert", "sand", "ruins", "sun"],
    skyline: "Sandstone arches, far dunes, and bright oasis towers.",
    traversalStyle: "Long sightlines, ridge hops, and bridge crossings.",
    zoneThemes: ["Oasis Camp", "Dune Drift", "Sandstone Span", "Treasure Court"],
    landmarkIdeas: ["Oasis fountain", "Sandstone bridge", "Sun dial gate", "Treasure court dais"],
    sceneryHooks: ["Palm pockets", "Sand flags", "Buried jars", "Shade tents"],
    atmosphereHooks: ["Heat shimmer", "Warm wind loop", "Late-afternoon gold light"],
    recommendedAssetPackSlugs: [
      "desert-dune-paths",
      "weather-and-lighting",
      "castle-courtyard-builder",
      "funny-sound-bites"
    ],
    recommendedMapPatternSlugs: ["race-circuit", "treasure-rings", "hub-and-spokes"],
    variationHooks: [
      "Break open dunes with one cool oasis or ruin zone",
      "Use banners and rocks to stop the world from feeling empty",
      "Curve the route so new landmarks reveal one at a time"
    ]
  },
  {
    slug: "volcano-quest",
    title: "Volcano Quest",
    summary: "Cartoon lava, smoke vents, and risky-looking paths that still stay kid-readable and fair.",
    mood: "Exciting, dramatic, and high-contrast.",
    kidHook: "Climb the volcano before the lava gets too close.",
    starterTemplates: ["obby-rush", "story-quest"],
    biomeTags: ["lava", "volcano", "fire", "rock"],
    skyline: "Smoking craters, glowing bridges, and obsidian peaks.",
    traversalStyle: "Stepping stones, bridge dashes, and checkpoint islands above lava.",
    zoneThemes: ["Magma Camp", "Crackle Span", "Smoke Vent Climb", "Crater Crown"],
    landmarkIdeas: ["Lavafall arch", "Smoke vent tower", "Obsidian bridge gate", "Crater crown platform"],
    sceneryHooks: ["Basalt shards", "Heat cracks", "Warning flags", "Glow crystals"],
    atmosphereHooks: ["Ember particles", "Low rumble loop", "Red-orange bounce light"],
    recommendedAssetPackSlugs: [
      "volcano-challenge-lane",
      "weather-and-lighting",
      "happy-obby-pieces",
      "celebration-fx"
    ],
    recommendedMapPatternSlugs: ["climb-to-crown", "island-hop-chain", "treasure-rings"],
    variationHooks: [
      "Alternate safe black rock pads with risky glowing paths",
      "Use smoke and glow to frame key jumps",
      "Keep one cool-color rest zone to reset the eye"
    ]
  },
  {
    slug: "space-station",
    title: "Space Station",
    summary: "Neon rails, launch pads, and ring gates that make racing or obstacle play feel fast and clean.",
    mood: "Arcade, glossy, and energetic.",
    kidHook: "Race through a giant space station full of lights.",
    starterTemplates: ["speed-sprint", "obby-rush"],
    biomeTags: ["space", "neon", "sci-fi", "metal"],
    skyline: "Ring gates, launch towers, and glowing tunnels hanging over a star field.",
    traversalStyle: "Boost pads, ring runs, and sharp readable turns.",
    zoneThemes: ["Dock Ring", "Launch Corridor", "Meteor Bend", "Victory Orbit"],
    landmarkIdeas: ["Launch platform", "Neon tunnel", "Ring gate array", "Orbital podium"],
    sceneryHooks: ["Panel lights", "Terminal screens", "Cargo pods", "Glow rails"],
    atmosphereHooks: ["Synth beeps", "Star backdrop", "Cool rim lights"],
    recommendedAssetPackSlugs: [
      "space-station-raceway",
      "race-track-modules",
      "cloud-backdrop-fx",
      "funny-sound-bites"
    ],
    recommendedMapPatternSlugs: ["race-circuit", "treasure-rings", "island-hop-chain"],
    variationHooks: [
      "Change lane color every major segment",
      "Use open star-field views before enclosed tunnel beats",
      "Keep one giant readable hero ring ahead of the player"
    ]
  },
  {
    slug: "underwater-reef",
    title: "Underwater Reef",
    summary: "Soft coral routes, bubble landmarks, and layered reef scenery for cozy exploration.",
    mood: "Calm, magical, and curious.",
    kidHook: "Swim through glowing reefs and friendly sea tunnels.",
    starterTemplates: ["pet-quest", "story-quest"],
    biomeTags: ["underwater", "reef", "ocean", "coral"],
    skyline: "Coral towers, bubble columns, and glowing sea arches.",
    traversalStyle: "Gentle curves, arch tunnels, and vertical bubble lifts.",
    zoneThemes: ["Coral Gate", "Bubble Garden", "Shell Tunnel", "Pearl Stage"],
    landmarkIdeas: ["Coral arch", "Bubble vent tower", "Shell gate", "Pearl shrine"],
    sceneryHooks: ["Seaweed clusters", "Anemone patches", "Driftwood props", "Fish-light particles"],
    atmosphereHooks: ["Soft bubble loops", "Blue-green fog", "Caustic light shimmer"],
    recommendedAssetPackSlugs: [
      "underwater-reef-decor",
      "weather-and-lighting",
      "celebration-fx",
      "funny-sound-bites"
    ],
    recommendedMapPatternSlugs: ["river-run", "story-loop", "hub-and-spokes"],
    variationHooks: [
      "Mix tight coral tunnels with open reef plazas",
      "Let bubble lifts create vertical reveals without confusion",
      "Use a stronger glow color for each new reef district"
    ]
  },
  {
    slug: "castle-courtyard",
    title: "Castle Courtyard",
    summary: "Friendly castle walls, banners, training yards, and royal steps for guided adventure maps.",
    mood: "Heroic, readable, and polished.",
    kidHook: "Explore a big castle and level up through its courtyards.",
    starterTemplates: ["pet-quest", "story-quest", "obby-rush"],
    biomeTags: ["castle", "stone", "banner", "royal"],
    skyline: "Banner towers, gatehouses, and layered courtyard stairs.",
    traversalStyle: "Courtyard hubs, stair climbs, and short gauntlet lanes.",
    zoneThemes: ["Gate Court", "Banner Walk", "Training Yard", "Royal Keep"],
    landmarkIdeas: ["Main gate arch", "Banner tower", "Training statue", "Royal keep stair"],
    sceneryHooks: ["Flower boxes", "Practice dummies", "Shield racks", "Stone benches"],
    atmosphereHooks: ["Trumpet stingers", "Warm afternoon light", "Torch flicker at edges"],
    recommendedAssetPackSlugs: [
      "castle-courtyard-builder",
      "forest-trail-foliage",
      "celebration-fx",
      "funny-sound-bites"
    ],
    recommendedMapPatternSlugs: ["layered-kingdom", "hub-and-spokes", "climb-to-crown"],
    variationHooks: [
      "Change banner color and emblem by district",
      "Use one statue or fountain as the center of each open yard",
      "Blend cozy garden edges into hard stone routes"
    ]
  },
  {
    slug: "forest-camp",
    title: "Forest Camp",
    summary: "Camp paths, soft lantern trails, and discovery spaces that work well for quests and stories.",
    mood: "Cozy, exploratory, and welcoming.",
    kidHook: "Follow the lantern trail to the next clue or friend.",
    starterTemplates: ["pet-quest", "story-quest"],
    biomeTags: ["forest", "camp", "cozy", "lantern"],
    skyline: "Tall pines, lantern strings, cabins, and reveal clearings.",
    traversalStyle: "Gentle path loops, cabin stops, and clue clearings.",
    zoneThemes: ["Lantern Gate", "Moss Trail", "Cabin Circle", "Campfire Reveal"],
    landmarkIdeas: ["Trailhead arch", "Ranger cabin", "Story circle", "Campfire reveal stage"],
    sceneryHooks: ["Fern banks", "Lantern posts", "Wood signs", "Camp crates and stools"],
    atmosphereHooks: ["Campfire crackle", "Soft dusk light", "Firefly particles"],
    recommendedAssetPackSlugs: [
      "forest-trail-foliage",
      "storybook-camp-decor",
      "cozy-village-props",
      "weather-and-lighting"
    ],
    recommendedMapPatternSlugs: ["story-loop", "hub-and-spokes", "river-run"],
    variationHooks: [
      "Use one cozy rest clearing between every bigger objective space",
      "Alternate lantern-led routes with natural overgrown shortcuts",
      "Let each cabin or clue spot have a different prop cluster"
    ]
  }
];

export const MAP_PATTERNS: MapPattern[] = [
  {
    slug: "hub-and-spokes",
    title: "Hub and Spokes",
    summary: "A friendly central hub with three readable branches and a clear return point.",
    starterTemplates: ["pet-quest", "story-quest", "obby-rush"],
    worldProfileSlugs: [],
    zoneFrames: ["Welcome Hub", "North Branch", "East Branch", "Final Celebration Yard"],
    traversalBeats: ["Teach the main move in the hub", "Give each branch one unique trick", "Reconnect to the hub before the finale"],
    landmarkRules: ["One hero landmark visible from the hub", "Unique landmark silhouette at each branch end", "Final yard must look bigger and brighter than the hub"],
    spawnDescription: "Players spawn in one safe readable plaza with a visible route choice.",
    finaleDescription: "All routes collapse into one shared celebration space.",
    recommendedAssetPackSlugs: ["cozy-village-props", "celebration-fx"],
    worldLayers: ["terrain", "landmarks", "scenery"],
    variationHooks: [
      "Make each spoke a different mood or color family",
      "Use the hub skyline as the orientation anchor",
      "Hide one optional side reward just off each branch"
    ]
  },
  {
    slug: "story-loop",
    title: "Story Loop",
    summary: "A guided route that circles back with escalating clues, rewards, or reveals.",
    starterTemplates: ["story-quest", "pet-quest"],
    worldProfileSlugs: ["forest-camp", "jungle-ruins", "underwater-reef"],
    zoneFrames: ["Story Gate", "Clue Trail", "Reveal Pocket", "Return Stage"],
    traversalBeats: ["Start with a clear clue or NPC prompt", "Use one scenic bend to tease the reveal", "Return to a transformed hub or stage"],
    landmarkRules: ["The first clue landmark should be readable immediately", "Every new clue should have a different landmark type", "The return stage should visibly pay off the mystery"],
    spawnDescription: "Spawn points straight at the first clue or helper NPC.",
    finaleDescription: "The reveal stage closes the loop and gives one strong payoff moment.",
    recommendedAssetPackSlugs: ["storybook-camp-decor", "forest-trail-foliage"],
    worldLayers: ["terrain", "landmarks", "scenery", "rewards"],
    variationHooks: [
      "Let each clue push the player into a slightly different kind of space",
      "Use scenic framing to keep the mystery inviting instead of scary",
      "Change how the return stage looks after completion"
    ]
  },
  {
    slug: "race-circuit",
    title: "Race Circuit",
    summary: "A clean closed loop with starter straightaways, readable turns, and a big finish line.",
    starterTemplates: ["speed-sprint", "obby-rush"],
    worldProfileSlugs: ["space-station", "desert-dunes"],
    zoneFrames: ["Launch Grid", "Speed Straight", "Skill Curve", "Finish Orbit"],
    traversalBeats: ["Teach boosts early", "Use one hard turn or hazard section mid-run", "End with a long visible sprint to the finish"],
    landmarkRules: ["Show the finish truss from at least one earlier segment", "Use one giant ring or tunnel as the mid-course hero landmark", "Keep side scenery low near tight turns"],
    spawnDescription: "Spawn in a garage or launch grid with instant route clarity.",
    finaleDescription: "Finish area should feel wide, bright, and easy to celebrate in.",
    recommendedAssetPackSlugs: ["race-track-modules", "space-station-raceway", "celebration-fx"],
    worldLayers: ["terrain", "traversal", "landmarks", "audio"],
    variationHooks: [
      "Change the lane material or lighting every lap district",
      "Use one open vista before every enclosed speed tunnel",
      "Keep boosts in visible rhythm, not random clutter"
    ]
  },
  {
    slug: "climb-to-crown",
    title: "Climb to Crown",
    summary: "A vertical ascent map with clear rest ledges and one obvious summit payoff.",
    starterTemplates: ["obby-rush", "story-quest"],
    worldProfileSlugs: ["frost-peaks", "volcano-quest", "castle-courtyard", "sky-islands"],
    zoneFrames: ["Base Camp", "Middle Ridge", "High Approach", "Crown Summit"],
    traversalBeats: ["Use safe rest ledges after every tough section", "Show the summit landmark from below", "Make the last climb feel dramatic but fair"],
    landmarkRules: ["Base camp needs one strong upward view", "Each height band should have a different hero silhouette", "Summit should be wider than the approach suggests"],
    spawnDescription: "Spawn at the base with a clear first climb target overhead.",
    finaleDescription: "Summit space should feel earned, open, and celebratory.",
    recommendedAssetPackSlugs: ["celebration-fx", "weather-and-lighting"],
    worldLayers: ["terrain", "traversal", "landmarks", "atmosphere"],
    variationHooks: [
      "Use lighting or color to show altitude progression",
      "Alternate exposed vistas with sheltered rest pockets",
      "Put the biggest wow landmark at the top third, not the base"
    ]
  },
  {
    slug: "island-hop-chain",
    title: "Island Hop Chain",
    summary: "A linear route across bold separated platforms or mini-islands with constant forward motion.",
    starterTemplates: ["obby-rush", "speed-sprint"],
    worldProfileSlugs: ["sky-islands", "candy-kingdom", "volcano-quest", "space-station"],
    zoneFrames: ["Starter Island", "Jump Chain", "Hero Island", "Winner Platform"],
    traversalBeats: ["Start with a big safe island", "Shrink the route width mid-run", "End on a wide visible winner island"],
    landmarkRules: ["Every third island should carry a big silhouette", "Hero island must read from two zones back", "Winner platform should have skybox support and celebration FX"],
    spawnDescription: "Spawn on a roomy platform with the first jump line already framed.",
    finaleDescription: "The winner platform is wide enough for playtests and celebration loops.",
    recommendedAssetPackSlugs: ["happy-obby-pieces", "cloud-backdrop-fx", "celebration-fx"],
    worldLayers: ["terrain", "traversal", "landmarks"],
    variationHooks: [
      "Change support shapes under islands so repetition still feels intentional",
      "Alternate bridge and jump sections",
      "Keep one rest island after every intense sequence"
    ]
  },
  {
    slug: "river-run",
    title: "River Run",
    summary: "A map shaped by a water path or canyon curve that naturally guides the player forward.",
    starterTemplates: ["story-quest", "pet-quest"],
    worldProfileSlugs: ["jungle-ruins", "underwater-reef", "pirate-bay", "forest-camp"],
    zoneFrames: ["Trailhead", "River Bend", "Cascade Pocket", "Treasure Pool"],
    traversalBeats: ["Let water or current guide the eye", "Use bridges and overlooks for visual change", "Finish at a wider basin or reveal space"],
    landmarkRules: ["Anchor each bend with one visible marker", "Use water crossings as landmark moments, not just obstacles", "Final pool should feel calmer and more open than the path"],
    spawnDescription: "Players face the river or channel immediately so direction is obvious.",
    finaleDescription: "The final basin feels like a reward zone with extra space and color.",
    recommendedAssetPackSlugs: ["weather-and-lighting", "celebration-fx"],
    worldLayers: ["terrain", "scenery", "landmarks", "atmosphere"],
    variationHooks: [
      "Use elevation changes to make each bend look fresh",
      "Swap bridge shapes and bank dressing by zone",
      "Use calmer water or lighting near reward spaces"
    ]
  },
  {
    slug: "treasure-rings",
    title: "Treasure Rings",
    summary: "A route built around collectible loops, ring gates, or reward nodes that pull kids onward.",
    starterTemplates: ["speed-sprint", "obby-rush", "pet-quest"],
    worldProfileSlugs: ["pirate-bay", "space-station", "desert-dunes"],
    zoneFrames: ["Spawn Cove", "Ring Trail", "Vault Approach", "Loot Stage"],
    traversalBeats: ["Make the first collectible ring visible from spawn", "Cluster rewards around one mid-map wow landmark", "Give the final reward stage a calmer landing zone"],
    landmarkRules: ["Use ring gates or treasure markers to define direction", "The mid-map landmark should frame a reward burst", "The final stage should visually promise treasure or victory"],
    spawnDescription: "Spawn in a compact safe cove that points toward the first ring.",
    finaleDescription: "The reward stage should support chest, badge, or podium moments cleanly.",
    recommendedAssetPackSlugs: ["pet-quest-rewards", "celebration-fx", "funny-sound-bites"],
    worldLayers: ["traversal", "rewards", "audio", "landmarks"],
    variationHooks: [
      "Change the reward type each district so the route feels less repetitive",
      "Use treasure markers to hint at optional side paths",
      "Keep the loot stage wider and brighter than any earlier node"
    ]
  },
  {
    slug: "layered-kingdom",
    title: "Layered Kingdom",
    summary: "A stacked city or castle layout with terraces, stairs, and rising districts.",
    starterTemplates: ["story-quest", "pet-quest", "obby-rush"],
    worldProfileSlugs: ["castle-courtyard", "candy-kingdom"],
    zoneFrames: ["Gate District", "Middle Terrace", "Upper Walk", "Crown Yard"],
    traversalBeats: ["Use stairs and ramps to create gentle elevation", "Give each level its own mini plaza", "End in a broad rooftop or royal yard"],
    landmarkRules: ["Every terrace should have one clear focal landmark", "Use banners or color to show district changes", "The crown yard must be visible from lower levels at least once"],
    spawnDescription: "Spawn just inside the gate with a visible path upward.",
    finaleDescription: "The top yard should feel open, triumphant, and easy to celebrate in.",
    recommendedAssetPackSlugs: ["castle-courtyard-builder", "celebration-fx", "forest-trail-foliage"],
    worldLayers: ["terrain", "landmarks", "scenery"],
    variationHooks: [
      "Give each level a different prop family so repeats feel thematic",
      "Use long lines of sight between terraces",
      "Save the boldest color and banner treatment for the top yard"
    ]
  }
];

export const WORLD_CREW_ROLES: WorldCrewRole[] = [
  {
    slug: "map-architect",
    title: "Map Architect",
    stageKey: "terrain",
    mission: "Blocks the big playable route so kids can read where to go in five seconds.",
    ownedLayers: ["terrain", "traversal"],
    buildHints: [
      "Start with spawn, route spine, safe rest spots, and finale footprint",
      "Use large shapes first so the map reads before detail exists",
      "Keep at least one clear forward landmark in view"
    ]
  },
  {
    slug: "biome-mixer",
    title: "Biome Mixer",
    stageKey: "terrain",
    mission: "Applies biome flavor, terrain materials, and color rhythm so the world feels distinct fast.",
    ownedLayers: ["terrain", "atmosphere"],
    dependsOnRoleSlug: "map-architect",
    buildHints: [
      "Change palette, elevation, and ground dressing by zone",
      "Use one clear accent color per district",
      "Reserve the strongest lighting shift for the finale"
    ]
  },
  {
    slug: "hero-landmark-artist",
    title: "Hero Landmark Artist",
    stageKey: "landmarks",
    mission: "Places memorable silhouettes and set pieces that sell the world before scripts exist.",
    ownedLayers: ["landmarks"],
    dependsOnRoleSlug: "biome-mixer",
    buildHints: [
      "Use one hero landmark per zone",
      "Make every landmark readable from at least one approach angle",
      "Let landmarks teach route direction, not just decoration"
    ]
  },
  {
    slug: "set-dresser",
    title: "Set Dresser",
    stageKey: "scenery",
    mission: "Fills the route with props, foliage, rewards, and side details that stop the map from feeling empty.",
    ownedLayers: ["scenery", "rewards"],
    dependsOnRoleSlug: "hero-landmark-artist",
    buildHints: [
      "Repeat small kits in deliberate clusters",
      "Support pathing with scenery instead of blocking it",
      "Use reward props to create optional micro-goals"
    ]
  },
  {
    slug: "mood-mixer",
    title: "Mood Mixer",
    stageKey: "scenery",
    mission: "Adds lighting, audio, weather, and celebration beats so the world feels alive for playtests.",
    ownedLayers: ["atmosphere", "audio", "ui"],
    dependsOnRoleSlug: "set-dresser",
    buildHints: [
      "Use one ambience loop and one lighting mood per zone family",
      "Keep celebration beats stronger at checkpoints and finals than in filler spaces",
      "Make every polish beat support clarity or joy"
    ]
  }
];

const WORLD_PROFILE_BY_SLUG = new Map(WORLD_PROFILES.map((profile) => [profile.slug, profile]));
const MAP_PATTERN_BY_SLUG = new Map(MAP_PATTERNS.map((pattern) => [pattern.slug, pattern]));

export function getWorldProfileBySlug(slug?: string | null) {
  return slug ? WORLD_PROFILE_BY_SLUG.get(slug) ?? null : null;
}

export function getMapPatternBySlug(slug?: string | null) {
  return slug ? MAP_PATTERN_BY_SLUG.get(slug) ?? null : null;
}

export function listWorldProfilesForTemplate(templateSlug?: string | null) {
  if (!templateSlug) return WORLD_PROFILES;
  const matches = WORLD_PROFILES.filter((profile) => profile.starterTemplates.includes(templateSlug));
  return matches.length ? matches : WORLD_PROFILES;
}

export function listMapPatternsForTemplate(options: {
  templateSlug?: string | null;
  worldProfileSlug?: string | null;
}) {
  const { templateSlug, worldProfileSlug } = options;
  const matches = MAP_PATTERNS.filter((pattern) => {
    const templateOkay = !templateSlug || pattern.starterTemplates.includes(templateSlug);
    const profileOkay =
      !worldProfileSlug ||
      !pattern.worldProfileSlugs.length ||
      pattern.worldProfileSlugs.includes(worldProfileSlug);
    return templateOkay && profileOkay;
  });
  return matches.length ? matches : MAP_PATTERNS;
}

export function recommendedWorldProfileSlugs(templateSlug?: string | null) {
  return listWorldProfilesForTemplate(templateSlug)
    .slice(0, 4)
    .map((profile) => profile.slug);
}

export function recommendedMapPatternSlugs(options: {
  templateSlug?: string | null;
  worldProfileSlug?: string | null;
}) {
  const { templateSlug, worldProfileSlug } = options;
  return listMapPatternsForTemplate({ templateSlug, worldProfileSlug })
    .slice(0, 4)
    .map((pattern) => pattern.slug);
}

export function sanitizeWorldProfileSlug(slug?: string | null) {
  return getWorldProfileBySlug(slug)?.slug ?? null;
}

export function sanitizeMapPatternSlug(slug?: string | null) {
  return getMapPatternBySlug(slug)?.slug ?? null;
}

function resolveWorldProfile(options: { templateSlug?: string | null; worldProfileSlug?: string | null }) {
  return (
    getWorldProfileBySlug(options.worldProfileSlug) ??
    listWorldProfilesForTemplate(options.templateSlug)[0] ??
    WORLD_PROFILES[0]
  );
}

function resolveMapPattern(options: {
  templateSlug?: string | null;
  worldProfileSlug?: string | null;
  mapPatternSlug?: string | null;
}) {
  return (
    getMapPatternBySlug(options.mapPatternSlug) ??
    listMapPatternsForTemplate({
      templateSlug: options.templateSlug,
      worldProfileSlug: options.worldProfileSlug
    })[0] ??
    MAP_PATTERNS[0]
  );
}

function buildCrewLines(profile: WorldProfile, pattern: MapPattern) {
  return WORLD_CREW_ROLES.map((role) => {
    return `${role.title}: ${role.mission} Focus on ${profile.title} with ${pattern.title}.`;
  });
}

export function buildWorldRecipe(options: {
  templateSlug?: string | null;
  worldProfileSlug?: string | null;
  mapPatternSlug?: string | null;
  theme?: string | null;
  heroGoal?: string | null;
  selectedAssetPackSlugs?: string[];
}) {
  const worldProfile = resolveWorldProfile(options);
  const mapPattern = resolveMapPattern({
    templateSlug: options.templateSlug,
    worldProfileSlug: worldProfile.slug,
    mapPatternSlug: options.mapPatternSlug
  });
  const recommendedAssetPackSlugs = unique(
    [
      ...(options.selectedAssetPackSlugs ?? []),
      ...worldProfile.recommendedAssetPackSlugs,
      ...mapPattern.recommendedAssetPackSlugs
    ],
    10
  );
  const recommendedPacks = getAssetPacksBySlugs(recommendedAssetPackSlugs);
  const recommendedPackLines = recommendedPacks.map((pack) => {
    const layer = pack.worldLayer ?? "scenery";
    const category = pack.packCategory ?? "scenery";
    const biome = pack.biomeTags?.length ? ` ${pack.biomeTags.join("/")}` : "";
    return `${pack.title} [${layer}/${category}${biome ? ` ${biome}` : ""}]`;
  });
  const zoneSequence = mapPattern.zoneFrames.map((frame, index) => {
    const theme = worldProfile.zoneThemes[index % worldProfile.zoneThemes.length] ?? worldProfile.title;
    return `${theme} ${frame}`.trim();
  });
  const landmarkQueue = worldProfile.landmarkIdeas
    .slice(0, 4)
    .map((landmark, index) => `${landmark} for ${zoneSequence[index] ?? zoneSequence[0]}`);
  const traversalMoments = unique(
    [worldProfile.traversalStyle, ...mapPattern.traversalBeats],
    6
  );
  const sceneryClusters = unique(
    [...worldProfile.sceneryHooks, ...worldProfile.variationHooks.slice(0, 2)],
    6
  );
  const atmosphereBeats = unique(
    [...worldProfile.atmosphereHooks, ...mapPattern.variationHooks.slice(0, 2)],
    6
  );
  const recommendedAssetPackTitles = recommendedPacks.map((pack) => pack.title);
  const headline = `${worldProfile.title} + ${mapPattern.title}`;
  const promptLines = [
    `World profile: ${worldProfile.title} - ${worldProfile.summary}`,
    `Map pattern: ${mapPattern.title} - ${mapPattern.summary}`,
    options.theme ? `Theme: ${options.theme}` : null,
    options.heroGoal ? `Hero goal: ${options.heroGoal}` : null,
    `Zone order: ${zoneSequence.join(" -> ")}`,
    `Landmark queue: ${landmarkQueue.join(" | ")}`,
    `Traversal beats: ${traversalMoments.join(" | ")}`,
    `Scenery clusters: ${sceneryClusters.join(" | ")}`,
    `Atmosphere beats: ${atmosphereBeats.join(" | ")}`,
    recommendedPackLines.length
      ? `Recommended pack mix: ${recommendedPackLines.join(", ")}`
      : null
  ].filter((value): value is string => Boolean(value));

  return {
    worldProfile,
    mapPattern,
    headline,
    zoneSequence,
    landmarkQueue,
    traversalMoments,
    sceneryClusters,
    atmosphereBeats,
    recommendedAssetPackSlugs,
    recommendedAssetPackTitles,
    promptLines,
    crewLines: buildCrewLines(worldProfile, mapPattern)
  } satisfies WorldRecipe;
}

export function summarizeWorldRecipeForPrompt(recipe?: WorldRecipe | null, maxLines = 8) {
  if (!recipe) return [] as string[];
  return recipe.promptLines.slice(0, maxLines);
}

export function summarizeWorldCrewForPrompt(maxItems = 5) {
  return WORLD_CREW_ROLES.slice(0, maxItems).map((role) => {
    return `${role.title} -> ${role.stageKey} (${role.ownedLayers.join("/")})`;
  });
}
