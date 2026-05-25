import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type {
  StudioAssetItemSummary,
  StudioCodePackageSummary,
  StudioProjectSummary
} from "@/lib/studio/types";

export type RojoExportEntry = {
  name: string;
  data: Buffer;
};

export type RojoExportCheck = {
  label: string;
  status: "passed" | "warning";
  detail: string;
};

export type RojoExportManifest = {
  packageVersion: 1;
  generatedAt: string;
  source: "Rassy Launchpad";
  handoffMode: "rojo-studio-owned-publish";
  project: {
    id: string;
    slug: string;
    title: string;
    template: string;
    theme: string;
    heroGoal: string | null;
    worldRecipe: string | null;
  };
  studioBoundary: {
    robloxAuth: "Handled by Roblox Studio";
    publish: "Handled by Roblox Studio";
    launchpadWritesTo: string;
  };
  counts: {
    zones: number;
    assetItems: number;
    codePackages: number;
    scripts: number;
  };
  checks: RojoExportCheck[];
};

export type RojoExportPackage = {
  filename: string;
  entries: RojoExportEntry[];
  manifest: RojoExportManifest;
  checks: RojoExportCheck[];
};

type LuaPrimitive = string | number | boolean | null;
type LuaValue = LuaPrimitive | LuaValue[] | LuaRecord;
type LuaRecord = {
  [key: string]: LuaValue;
};

const FALLBACK_MODULES: Record<string, string> = {
  "launchpad-checkpoint-service": [
    "local CheckpointService = {}",
    "",
    "function CheckpointService.registerCheckpoint(_part, _checkpointId)",
    "\treturn true",
    "end",
    "",
    "function CheckpointService.resetPlayer(_player)",
    "\treturn nil",
    "end",
    "",
    "return CheckpointService",
    ""
  ].join("\n")
};

function cleanFilename(input: string) {
  const cleaned = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || "launchpad-project";
}

function pascalCase(input: string) {
  const cleaned = input
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join("");
  return cleaned || "LaunchpadModule";
}

function moduleNameFor(pkg: StudioCodePackageSummary) {
  return pascalCase(pkg.title || pkg.slug);
}

function buffer(text: string) {
  return Buffer.from(text, "utf8");
}

function luaString(input: string) {
  return JSON.stringify(input);
}

function luaKey(key: string) {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(key) ? key : `[${luaString(key)}]`;
}

function luaValue(value: LuaValue, indent = 0): string {
  const space = " ".repeat(indent);
  const childSpace = " ".repeat(indent + 2);

  if (value === null) return "nil";
  if (typeof value === "string") return luaString(value);
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "0";
  if (typeof value === "boolean") return value ? "true" : "false";

  if (Array.isArray(value)) {
    if (!value.length) return "{}";
    return [
      "{",
      ...value.map((item) => `${childSpace}${luaValue(item, indent + 2)},`),
      `${space}}`
    ].join("\n");
  }

  const entries = Object.entries(value);
  if (!entries.length) return "{}";
  return [
    "{",
    ...entries.map(([key, item]) => `${childSpace}${luaKey(key)} = ${luaValue(item, indent + 2)},`),
    `${space}}`
  ].join("\n");
}

function textList(values?: string[] | null, maxItems = 20) {
  return Array.from(new Set(values ?? []))
    .filter((value) => typeof value === "string" && value.trim().length > 0)
    .map((value) => value.trim())
    .slice(0, maxItems);
}

function deriveControls(project: StudioProjectSummary): LuaRecord {
  const difficultyLabel = project.templatePack?.difficulty ?? "Beginner";
  const difficulty =
    difficultyLabel === "Beginner+"
      ? 0.45
      : difficultyLabel.toLowerCase().includes("advanced")
        ? 0.7
        : 0.3;
  const zoneCount =
    project.worldRecipe?.zoneSequence.length ?? project.buildPlan?.scenes.length ?? 0;
  const assetCount = project.selectedAssetItems.length;
  const questCount = project.buildPlan?.quests.length ?? 0;
  const isObstacle = project.templatePack?.slug === "obby-rush";
  const isRace = project.templatePack?.slug === "speed-sprint";
  const hasFunnyPack = project.selectedAssetPackSlugs.includes("funny-sound-bites");

  return {
    difficulty,
    worldScale: Math.min(1, Math.max(0.25, zoneCount / 8)),
    sceneryDensity: Math.min(1, Math.max(0.25, assetCount / 10)),
    questDepth: Math.min(1, Math.max(0.2, questCount / 5)),
    hazardLevel: isObstacle ? 0.55 : isRace ? 0.35 : 0.2,
    rewardFrequency: project.approvedCodePackages.some((pkg) => pkg.slug.includes("reward"))
      ? 0.7
      : 0.4,
    silliness: hasFunnyPack ? 0.75 : 0.35
  };
}

function buildProjectSpec(project: StudioProjectSummary): LuaRecord {
  return {
    title: project.title,
    slug: project.slug,
    theme: project.theme,
    heroGoal: project.heroGoal ?? null,
    targetAudience: project.targetAudience,
    template: {
      slug: project.templatePack?.slug ?? "starter",
      name: project.templatePack?.name ?? "Starter",
      genre: project.templatePack?.genre ?? "Roblox game",
      difficulty: project.templatePack?.difficulty ?? "Beginner",
      primaryMechanics: textList(project.templatePack?.primaryMechanics)
    },
    world: {
      profile: project.worldProfile?.title ?? null,
      pattern: project.mapPattern?.title ?? null,
      headline: project.worldRecipe?.headline ?? null,
      zones: textList(project.worldRecipe?.zoneSequence),
      landmarks: textList(project.worldRecipe?.landmarkQueue),
      traversal: textList(project.worldRecipe?.traversalMoments),
      atmosphere: textList(project.worldRecipe?.atmosphereBeats)
    },
    controls: deriveControls(project),
    safety: {
      robloxAuth: "Roblox Studio handles login and publishing.",
      namespace: "Launchpad",
      rule: "Generated files stay inside the Launchpad namespace unless a parent or coach moves them."
    }
  };
}

function buildPlanTable(project: StudioProjectSummary): LuaRecord {
  const plan = project.buildPlan;

  return {
    status: plan?.status ?? "Drafting",
    oneLiner: plan?.oneLiner ?? project.templatePack?.summary ?? project.title,
    coreLoop: plan?.coreLoop ?? "Build, test, remix, and improve one small Roblox loop.",
    scenes: textList(plan?.scenes ?? project.worldRecipe?.zoneSequence),
    mechanics: textList(plan?.mechanics ?? project.templatePack?.primaryMechanics),
    quests: textList(plan?.quests),
    npcs: textList(plan?.npcs),
    scripts: textList(plan?.scripts),
    worldCrew: textList(project.worldRecipe?.crewLines),
    nextActions: textList(project.nextActions)
  };
}

function assetTable(item: StudioAssetItemSummary): LuaRecord {
  return {
    slug: item.slug,
    title: item.title,
    kind: item.kind,
    storageMode: item.storageMode,
    source: item.sourceLabel,
    localBundleKey: item.localBundleKey,
    targetContainer: item.targetContainer,
    targetPath: item.targetPath,
    placementHint: item.placementHint,
    buildHints: textList(item.buildHints, 8),
    safetyNote: item.safetyNote
  };
}

function buildAssetManifestTable(project: StudioProjectSummary): LuaRecord {
  return {
    shelves: project.selectedAssetPacks.map((pack) => ({
      slug: pack.slug,
      title: pack.title,
      shelf: pack.shelf,
      reviewMode: pack.reviewMode,
      sampleItems: textList(pack.sampleItems, 8),
      safetyNote: pack.safetyNote
    })),
    items: project.selectedAssetItems.map(assetTable),
    codePackages: project.approvedCodePackages.map((pkg) => ({
      slug: pkg.slug,
      title: pkg.title,
      moduleName: moduleNameFor(pkg),
      targetContainer: pkg.targetContainer,
      purpose: pkg.purpose,
      apiShape: textList(pkg.apiShape, 8),
      buildHints: textList(pkg.buildHints, 8)
    }))
  };
}

function buildLuaModule(name: string, table: LuaRecord) {
  return [`local ${name} = ${luaValue(table)}`, "", `return ${name}`, ""].join("\n");
}

function readCodePackageSource(pkg: StudioCodePackageSummary) {
  const absolutePath = path.join(process.cwd(), pkg.localModulePath);
  if (existsSync(absolutePath)) {
    return readFileSync(absolutePath, "utf8").replace(/\s*$/, "\n");
  }
  return FALLBACK_MODULES[pkg.slug] ?? ["local Module = {}", "", "return Module", ""].join("\n");
}

function buildServerScript(project: StudioProjectSummary) {
  const requires = project.approvedCodePackages
    .map((pkg) => `local ${moduleNameFor(pkg)} = require(Launchpad.Modules.${moduleNameFor(pkg)})`)
    .join("\n");

  return [
    'local ReplicatedStorage = game:GetService("ReplicatedStorage")',
    'local Launchpad = ReplicatedStorage:WaitForChild("Launchpad")',
    "local ProjectSpec = require(Launchpad.ProjectSpec)",
    "local BuildPlan = require(Launchpad.BuildPlan)",
    "local AssetManifest = require(Launchpad.AssetManifest)",
    requires,
    "",
    'print(string.format("[Launchpad] Loaded %s", ProjectSpec.title))',
    'print(string.format("[Launchpad] Core loop: %s", BuildPlan.coreLoop))',
    'print(string.format("[Launchpad] Approved assets: %d", #AssetManifest.items))',
    "",
    "-- Keep generated behavior inside the Launchpad namespace.",
    "-- Add map Parts, Models, and UI manually or through the future Studio plugin using this plan.",
    ""
  ]
    .filter((line) => line !== null)
    .join("\n");
}

function buildClientScript() {
  return [
    'local ReplicatedStorage = game:GetService("ReplicatedStorage")',
    'local Launchpad = ReplicatedStorage:WaitForChild("Launchpad")',
    "local ProjectSpec = require(Launchpad.ProjectSpec)",
    "",
    'print(string.format("[Launchpad] Ready to build: %s", ProjectSpec.title))',
    ""
  ].join("\n");
}

function buildHudModel(project: StudioProjectSummary) {
  return JSON.stringify(
    {
      $className: "ScreenGui",
      Name: "LaunchpadHud",
      ResetOnSpawn: false,
      LaunchpadTitle: {
        $className: "TextLabel",
        Name: "LaunchpadTitle",
        Text: project.title,
        Size: {
          $type: "UDim2",
          X: { Scale: 0, Offset: 360 },
          Y: { Scale: 0, Offset: 42 }
        },
        Position: {
          $type: "UDim2",
          X: { Scale: 0, Offset: 24 },
          Y: { Scale: 0, Offset: 24 }
        },
        BackgroundTransparency: 0.2,
        TextScaled: true
      }
    },
    null,
    2
  );
}

function buildRojoProject(project: StudioProjectSummary) {
  return JSON.stringify(
    {
      name: project.title,
      globIgnorePaths: ["review/**", "launchpad.manifest.json", "README.md"],
      tree: {
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
        },
        StarterGui: {
          $className: "StarterGui",
          $path: "src/StarterGui"
        }
      }
    },
    null,
    2
  );
}

function buildChecks(project: StudioProjectSummary): RojoExportCheck[] {
  return [
    {
      label: "Starter template",
      status: project.templatePack ? "passed" : "warning",
      detail: project.templatePack
        ? `${project.templatePack.name} is saved as the project contract.`
        : "No template is saved; export uses generic starter defaults."
    },
    {
      label: "World recipe",
      status: project.worldRecipe ? "passed" : "warning",
      detail: project.worldRecipe
        ? `${project.worldRecipe.zoneSequence.length} zones are ready for Studio review.`
        : "No world recipe is saved; use Map Forge before the next export."
    },
    {
      label: "Approved assets",
      status: project.selectedAssetItems.length ? "passed" : "warning",
      detail: project.selectedAssetItems.length
        ? `${project.selectedAssetItems.length} reviewed asset manifest items are included.`
        : "No reviewed asset items are included yet."
    },
    {
      label: "Reviewed Luau modules",
      status: project.approvedCodePackages.length ? "passed" : "warning",
      detail: project.approvedCodePackages.length
        ? `${project.approvedCodePackages.length} approved module packages are included.`
        : "No approved Luau modules are included yet."
    }
  ];
}

function buildManifest(
  project: StudioProjectSummary,
  checks: RojoExportCheck[]
): RojoExportManifest {
  return {
    packageVersion: 1,
    generatedAt: new Date().toISOString(),
    source: "Rassy Launchpad",
    handoffMode: "rojo-studio-owned-publish",
    project: {
      id: project.id,
      slug: project.slug,
      title: project.title,
      template: project.templatePack?.name ?? "Starter",
      theme: project.theme,
      heroGoal: project.heroGoal ?? null,
      worldRecipe: project.worldRecipe?.headline ?? null
    },
    studioBoundary: {
      robloxAuth: "Handled by Roblox Studio",
      publish: "Handled by Roblox Studio",
      launchpadWritesTo:
        "ReplicatedStorage/Launchpad, ServerScriptService, StarterPlayerScripts, StarterGui"
    },
    counts: {
      zones: project.worldRecipe?.zoneSequence.length ?? project.buildPlan?.scenes.length ?? 0,
      assetItems: project.selectedAssetItems.length,
      codePackages: project.approvedCodePackages.length,
      scripts: project.buildPlan?.scripts.length ?? 0
    },
    checks
  };
}

function buildReadme(project: StudioProjectSummary) {
  return [
    `# ${project.title}`,
    "",
    "This package was generated by Rassy Launchpad for Roblox Studio through Rojo.",
    "",
    "## How To Use",
    "",
    "1. Install Rojo and the Rojo Roblox Studio plugin.",
    "2. Run `rojo serve` in this folder.",
    "3. Open Roblox Studio while signed in to the Roblox account that owns the place.",
    "4. Connect the Rojo plugin to the local server.",
    "5. Review the Launchpad folder, scripts, and build notes before publishing from Studio.",
    "",
    "Launchpad does not store Roblox account credentials for this handoff. Studio owns login, place selection, and publishing.",
    "",
    "## Project",
    "",
    `- Template: ${project.templatePack?.name ?? "Starter"}`,
    `- Theme: ${project.theme}`,
    `- Goal: ${project.heroGoal ?? "Choose one clear goal"}`,
    `- World: ${project.worldRecipe?.headline ?? "No saved world recipe"}`,
    ""
  ].join("\n");
}

function buildReviewPlan(project: StudioProjectSummary) {
  const lines = [
    `# ${project.title} Build Plan`,
    "",
    `**Template:** ${project.templatePack?.name ?? "Starter"}`,
    `**Theme:** ${project.theme}`,
    `**Hero Goal:** ${project.heroGoal ?? "Not selected"}`,
    "",
    "## Core Loop",
    "",
    project.buildPlan?.coreLoop ?? "Build, test, remix, and improve one small Roblox loop.",
    "",
    "## Scenes",
    "",
    ...textList(project.buildPlan?.scenes ?? project.worldRecipe?.zoneSequence).map(
      (scene) => `- ${scene}`
    ),
    "",
    "## Mechanics",
    "",
    ...textList(project.buildPlan?.mechanics ?? project.templatePack?.primaryMechanics).map(
      (mechanic) => `- ${mechanic}`
    ),
    "",
    "## Studio Boundary",
    "",
    "- Roblox Studio owns login and publishing.",
    "- Launchpad-generated files stay in the `Launchpad` namespace.",
    "- Review generated modules before moving them into production game systems.",
    ""
  ];

  return lines.join("\n");
}

function entry(name: string, text: string): RojoExportEntry {
  return { name, data: buffer(text) };
}

export function buildRojoExportPackage(project: StudioProjectSummary): RojoExportPackage {
  const checks = buildChecks(project);
  const manifest = buildManifest(project, checks);
  const entries: RojoExportEntry[] = [
    entry("default.project.json", buildRojoProject(project)),
    entry("launchpad.manifest.json", JSON.stringify(manifest, null, 2)),
    entry("README.md", buildReadme(project)),
    entry("review/build-plan.md", buildReviewPlan(project)),
    entry(
      "src/ReplicatedStorage/Launchpad/ProjectSpec.lua",
      buildLuaModule("ProjectSpec", buildProjectSpec(project))
    ),
    entry(
      "src/ReplicatedStorage/Launchpad/BuildPlan.lua",
      buildLuaModule("BuildPlan", buildPlanTable(project))
    ),
    entry(
      "src/ReplicatedStorage/Launchpad/AssetManifest.lua",
      buildLuaModule("AssetManifest", buildAssetManifestTable(project))
    ),
    ...project.approvedCodePackages.map((pkg) =>
      entry(
        `src/ReplicatedStorage/Launchpad/Modules/${moduleNameFor(pkg)}.lua`,
        readCodePackageSource(pkg)
      )
    ),
    entry("src/ServerScriptService/Launchpad.server.lua", buildServerScript(project)),
    entry("src/StarterPlayer/StarterPlayerScripts/Launchpad.client.lua", buildClientScript()),
    entry("src/StarterGui/LaunchpadHud.model.json", buildHudModel(project))
  ];

  return {
    filename: `${cleanFilename(project.title)}-rojo.zip`,
    entries,
    manifest,
    checks
  };
}
