import { describe, expect, it } from "vitest";
import { buildRojoExportPackage } from "@/lib/studio/rojo-export";
import type { StudioProjectSummary } from "@/lib/studio/types";

const sampleProject = {
  id: "project-1",
  slug: "sky-hopper-adventure",
  title: "Sky Hopper Adventure",
  theme: "Candy sky",
  heroGoal: "Reach the golden flag",
  targetAudience: "Kids 7-12",
  connectionStatus: "Guest",
  publishReadiness: "Studio-ready",
  parentModeEnabled: true,
  selectedAssetPackSlugs: ["happy-obby-pieces"],
  selectedAssetPacks: [
    {
      slug: "happy-obby-pieces",
      title: "Happy Obby Pieces",
      shelf: "Run and jump",
      sourceLabel: "Launchpad reviewed Roblox starter shelf",
      sourceType: "Roblox sample shelf",
      summary: "Bright platforms and checkpoint signs.",
      safetyNote: "Visual pieces only.",
      reviewMode: "Kid-safe shelf",
      ageBand: "7-10",
      recommendedTemplateSlugs: ["obby-rush"],
      sampleItems: ["Checkpoint arch", "Coin ring"],
      actions: ["Add to challenge lane"],
      localCatalogStatus: "Seeded locally",
      items: [],
      codePackageSlugs: ["launchpad-checkpoint-service"]
    }
  ],
  selectedAssetItems: [
    {
      slug: "obby-checkpoint-arch",
      title: "Checkpoint Arch",
      kind: "model",
      storageMode: "inventory-library",
      sourceLabel: "Launchpad reviewed Roblox sample library reference",
      sourceType: "Roblox sample shelf",
      summary: "Friendly checkpoint arch.",
      localBundleKey: "obby/checkpoint-arch",
      localManifestPath: "data/roblox-catalog/packs/happy-obby-pieces.json",
      targetContainer: "Workspace",
      targetPath: "Workspace/Map/Checkpoints",
      instanceHint: "Model",
      placementHint: "Place at the end of each challenge segment.",
      tags: ["checkpoint"],
      buildHints: ["Pair with checkpoint trigger"],
      safetyNote: "No embedded public scripts."
    }
  ],
  approvedCodePackages: [
    {
      slug: "launchpad-checkpoint-service",
      title: "Checkpoint Service",
      kind: "luau-module",
      sourceLabel: "Launchpad reviewed local module",
      storageMode: "launchpad-local",
      localModulePath: "data/roblox-catalog/modules/checkpoint-service.luau",
      targetContainer: "ReplicatedStorage",
      purpose: "Tracks checkpoint progress.",
      starterTemplates: ["obby-rush"],
      apiShape: ["CheckpointService.registerCheckpoint(part, checkpointId)"],
      buildHints: ["Pair with visible checkpoint arches"]
    }
  ],
  worldProfileSlug: "sky-islands",
  mapPatternSlug: "island-hop-chain",
  worldProfile: {
    slug: "sky-islands",
    title: "Sky Islands",
    summary: "Floating toy-box islands.",
    mood: "Bright",
    kidHook: "Jump from island to island.",
    starterTemplates: ["obby-rush"],
    biomeTags: ["sky"],
    skyline: "Cloud decks.",
    traversalStyle: "Short hops.",
    zoneThemes: ["Cloud Dock"],
    landmarkIdeas: ["Balloon harbor tower"],
    sceneryHooks: ["Cloud puffs"],
    atmosphereHooks: ["Bell chimes"],
    recommendedAssetPackSlugs: ["happy-obby-pieces"],
    recommendedMapPatternSlugs: ["island-hop-chain"],
    variationHooks: ["Use one hero color per island"]
  },
  mapPattern: {
    slug: "island-hop-chain",
    title: "Island Hop Chain",
    summary: "A readable island route.",
    starterTemplates: ["obby-rush"],
    worldProfileSlugs: ["sky-islands"],
    zoneFrames: ["Spawn island"],
    traversalBeats: ["Bridge hop"],
    landmarkRules: ["One landmark per zone"],
    spawnDescription: "Start on a safe cloud dock.",
    finaleDescription: "End at a winner cloud castle.",
    recommendedAssetPackSlugs: ["happy-obby-pieces"],
    worldLayers: ["terrain", "landmarks"],
    variationHooks: ["Alternate rest islands and challenge islands"]
  },
  worldRecipe: {
    headline: "Sky Islands Island Hop Chain",
    zoneSequence: ["Cloud Dock", "Rainbow Stepway", "Star Podium"],
    landmarkQueue: ["Balloon harbor tower", "Winner cloud castle"],
    traversalMoments: ["Bridge hop"],
    sceneryClusters: ["Cloud puffs"],
    atmosphereBeats: ["Bell chimes"],
    recommendedAssetPackSlugs: ["happy-obby-pieces"],
    recommendedAssetPackTitles: ["Happy Obby Pieces"],
    promptLines: ["World profile: Sky Islands", "Map pattern: Island Hop Chain"],
    crewLines: ["Terrain Writer: lay out the route"]
  },
  lastEditedBy: { id: "user-1", username: "builder" },
  updatedAt: "2026-05-24T00:00:00.000Z",
  templatePack: {
    slug: "obby-rush",
    name: "Obby Rush",
    genre: "Obstacle course",
    ageBand: "7-10",
    difficulty: "Beginner",
    summary: "Bright checkpoint-based platforming.",
    starterPrompt: "Build a colorful Roblox obby.",
    defaultTheme: "Sky islands",
    starterScenes: ["Spawn plaza", "Checkpoint canyon"],
    primaryMechanics: ["Checkpoints", "Collectible coins"],
    starterQuestText: "Reach the finish podium.",
    artDirection: "Bright floating islands."
  },
  buildPlan: {
    id: "plan-1",
    status: "Drafting",
    oneLiner: "Race across floating islands.",
    coreLoop: "Jump, checkpoint, collect, retry.",
    scenes: ["Spawn plaza", "Checkpoint canyon"],
    mechanics: ["Checkpoints", "Collectible coins"],
    quests: ["Reach the finish podium"],
    npcs: ["Coach Comet"],
    scripts: ["Checkpoint tracker", "Coin pickup"],
    artDirection: {
      look: "Bright floating islands"
    }
  },
  publishTarget: null,
  writerStages: [],
  availableTemplates: [],
  nextActions: []
} as StudioProjectSummary;

function readEntry(pkg: ReturnType<typeof buildRojoExportPackage>, name: string) {
  const entry = pkg.entries.find((item) => item.name === name);
  expect(entry).toBeDefined();
  return entry?.data.toString("utf8") ?? "";
}

describe("Rojo export package", () => {
  it("builds a Rojo project package from the saved studio project", () => {
    const pkg = buildRojoExportPackage(sampleProject);

    expect(pkg.filename).toBe("sky-hopper-adventure-rojo.zip");
    expect(pkg.entries.map((entry) => entry.name)).toEqual(
      expect.arrayContaining([
        "default.project.json",
        "launchpad.manifest.json",
        "README.md",
        "review/build-plan.md",
        "src/ReplicatedStorage/Launchpad/ProjectSpec.lua",
        "src/ReplicatedStorage/Launchpad/BuildPlan.lua",
        "src/ReplicatedStorage/Launchpad/AssetManifest.lua",
        "src/ReplicatedStorage/Launchpad/Modules/CheckpointService.lua",
        "src/ServerScriptService/Launchpad.server.lua",
        "src/StarterPlayer/StarterPlayerScripts/Launchpad.client.lua"
      ])
    );
  });

  it("emits a Rojo v7 project that keeps Launchpad in its own namespace", () => {
    const pkg = buildRojoExportPackage(sampleProject);
    const project = JSON.parse(readEntry(pkg, "default.project.json")) as {
      name?: string;
      tree?: Record<string, unknown>;
      globIgnorePaths?: string[];
    };

    expect(project.name).toBe("Sky Hopper Adventure");
    expect(project.globIgnorePaths).toContain("review/**");
    expect(project.tree).toMatchObject({
      $className: "DataModel",
      ReplicatedStorage: {
        $className: "ReplicatedStorage",
        Launchpad: {
          $path: "src/ReplicatedStorage/Launchpad"
        }
      },
      ServerScriptService: {
        $className: "ServerScriptService",
        $path: "src/ServerScriptService"
      },
      StarterPlayer: {
        $className: "StarterPlayer",
        StarterPlayerScripts: {
          $className: "StarterPlayerScripts",
          $path: "src/StarterPlayer/StarterPlayerScripts"
        }
      }
    });
  });

  it("grounds generated Luau in project context, assets, and approved modules", () => {
    const pkg = buildRojoExportPackage(sampleProject);

    expect(readEntry(pkg, "src/ReplicatedStorage/Launchpad/ProjectSpec.lua")).toContain(
      'title = "Sky Hopper Adventure"'
    );
    expect(readEntry(pkg, "src/ReplicatedStorage/Launchpad/BuildPlan.lua")).toContain(
      'coreLoop = "Jump, checkpoint, collect, retry."'
    );
    expect(readEntry(pkg, "src/ReplicatedStorage/Launchpad/AssetManifest.lua")).toContain(
      'targetPath = "Workspace/Map/Checkpoints"'
    );
    expect(readEntry(pkg, "src/ServerScriptService/Launchpad.server.lua")).toContain(
      "local CheckpointService = require(Launchpad.Modules.CheckpointService)"
    );
  });
});
