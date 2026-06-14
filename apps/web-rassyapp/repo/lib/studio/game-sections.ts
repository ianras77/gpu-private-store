import type {
  StudioAssetItemSummary,
  StudioCodePackageSummary,
  StudioGameSectionLinkedAssetSummary,
  StudioGameSectionSummary,
  StudioProjectSummary
} from "@/lib/studio/types";

type SectionType = StudioGameSectionSummary["sectionType"];

type ProjectForSections = Omit<StudioProjectSummary, "gameSections"> & {
  gameSections?: StudioGameSectionSummary[];
};

function slugify(input: string) {
  const slug = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "section";
}

function pascalCase(input: string) {
  const text = input
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join("");
  return text || "Section";
}

function uniqueText(values: Array<string | null | undefined>, maxItems = 6) {
  return Array.from(
    new Set(
      values.filter((value): value is string => Boolean(value?.trim())).map((value) => value.trim())
    )
  ).slice(0, maxItems);
}

function sectionPrefix(sectionType: SectionType) {
  if (sectionType === "spawn") return "spawn";
  if (sectionType === "finale") return "finale";
  if (sectionType === "systems") return "systems";
  return "route";
}

function sectionTypeForZone(index: number, total: number): SectionType {
  if (index === 0) return "spawn";
  if (index === total - 1) return "finale";
  return "route";
}

function studioFolderName(index: number, title: string) {
  return `${String(index + 1).padStart(2, "0")}-${pascalCase(title)}`;
}

function zoneTitles(project: ProjectForSections) {
  const zones = project.worldRecipe?.zoneSequence.length
    ? project.worldRecipe.zoneSequence
    : project.buildPlan?.scenes.length
      ? project.buildPlan.scenes
      : (project.templatePack?.starterScenes ?? []);

  return uniqueText(zones, 8);
}

function assetText(asset: StudioAssetItemSummary) {
  return [
    asset.title,
    asset.kind,
    asset.targetPath,
    asset.placementHint,
    asset.summary,
    ...asset.tags,
    ...asset.buildHints
  ]
    .join(" ")
    .toLowerCase();
}

function assetMatchesSection(
  asset: StudioAssetItemSummary,
  sectionType: SectionType,
  title: string
) {
  const text = assetText(asset);
  const titleTokens = slugify(title)
    .split("-")
    .filter((token) => token.length > 3);

  if (titleTokens.some((token) => text.includes(token))) return true;
  if (sectionType === "spawn") {
    return /\b(spawn|start|safe|guide|intro)\b/.test(text);
  }
  if (sectionType === "route") {
    return /\b(checkpoint|challenge|hazard|jump|route|path|platform|track|boost)\b/.test(text);
  }
  if (sectionType === "finale") {
    return /\b(final|finish|winner|podium|gate|castle|celebration)\b/.test(text);
  }
  return /\b(reward|coin|quest|ui|hud|sound|npc|dialogue|collectible)\b/.test(text);
}

function linkedAssetSummary(asset: StudioAssetItemSummary): StudioGameSectionLinkedAssetSummary {
  return {
    slug: asset.slug,
    title: asset.title,
    kind: asset.kind,
    targetPath: asset.targetPath,
    localBundleKey: asset.localBundleKey,
    placementHint: asset.placementHint
  };
}

function linkedAssetsForSection(
  project: ProjectForSections,
  sectionType: SectionType,
  title: string
) {
  const matches = project.selectedAssetItems.filter((asset) =>
    assetMatchesSection(asset, sectionType, title)
  );

  if (matches.length) return matches.slice(0, 4).map(linkedAssetSummary);
  if (sectionType === "route")
    return project.selectedAssetItems.slice(0, 2).map(linkedAssetSummary);
  if (sectionType === "systems")
    return project.selectedAssetItems.slice(-3).map(linkedAssetSummary);
  return [];
}

function codeTaskForPackage(pkg: StudioCodePackageSummary) {
  return `Wire ${pkg.title} in ${pkg.targetContainer} for this section.`;
}

function packageText(pkg: StudioCodePackageSummary) {
  return [pkg.title, pkg.purpose, pkg.targetContainer, ...pkg.buildHints, ...pkg.apiShape]
    .join(" ")
    .toLowerCase();
}

function codeTasksForSection(project: ProjectForSections, sectionType: SectionType) {
  const packages = project.approvedCodePackages.filter((pkg) => {
    const text = packageText(pkg);
    if (sectionType === "spawn") return /\b(spawn|guide|intro|dialogue)\b/.test(text);
    if (sectionType === "route")
      return /\b(checkpoint|boost|lap|platform|collectible|hazard)\b/.test(text);
    if (sectionType === "finale") return /\b(finish|reward|unlock|celebration|gate)\b/.test(text);
    return true;
  });

  const packageTasks = (packages.length ? packages : project.approvedCodePackages)
    .slice(0, sectionType === "systems" ? 5 : 3)
    .map(codeTaskForPackage);

  const scriptTasks =
    sectionType === "systems"
      ? (project.buildPlan?.scripts ?? [])
          .slice(0, 4)
          .map((script) => `Review or create the ${script} Luau task.`)
      : [];

  return uniqueText([...packageTasks, ...scriptTasks], 7);
}

function playerGoalForSection(
  project: ProjectForSections,
  sectionType: SectionType,
  title: string
) {
  if (sectionType === "spawn") return "Learn the goal and start safely.";
  if (sectionType === "finale") {
    return project.heroGoal
      ? `Finish the run by trying to ${project.heroGoal.toLowerCase()}.`
      : "Finish the run clearly.";
  }
  if (sectionType === "systems") return "Make rewards, UI, and helper code work together.";
  const mechanic = project.buildPlan?.mechanics[0] ?? project.templatePack?.primaryMechanics[0];
  return mechanic ? `Practice ${mechanic.toLowerCase()} in ${title}.` : `Play through ${title}.`;
}

function sceneBeatsForSection(
  project: ProjectForSections,
  sectionType: SectionType,
  title: string
) {
  const world = project.worldRecipe;
  const beats =
    sectionType === "spawn"
      ? [project.mapPattern?.spawnDescription, world?.promptLines[0], project.heroGoal]
      : sectionType === "finale"
        ? [project.mapPattern?.finaleDescription, world?.landmarkQueue.at(-1), project.heroGoal]
        : sectionType === "systems"
          ? [
              project.buildPlan?.coreLoop,
              ...(project.buildPlan?.quests ?? []),
              ...(project.buildPlan?.scripts ?? [])
            ]
          : [
              world?.traversalMoments[0],
              world?.landmarkQueue.find((landmark) =>
                slugify(landmark).includes(slugify(title).split("-")[0] ?? "")
              ),
              world?.sceneryClusters[0]
            ];

  return uniqueText(beats, 5);
}

function studioServicesForSection(sectionType: SectionType) {
  if (sectionType === "spawn") return ["Workspace", "StarterPlayer"];
  if (sectionType === "route") return ["Workspace", "ReplicatedStorage", "ServerScriptService"];
  if (sectionType === "finale") return ["Workspace", "StarterGui", "ServerScriptService"];
  return ["ReplicatedStorage", "ServerScriptService", "StarterGui"];
}

function buildCoachPrompt(options: {
  project: ProjectForSections;
  title: string;
  studioPath: string;
  playerGoal: string;
  linkedAssets: StudioGameSectionLinkedAssetSummary[];
  codeTasks: string[];
}) {
  const { project, title, studioPath, playerGoal, linkedAssets, codeTasks } = options;
  const assets = linkedAssets.length
    ? linkedAssets.map((asset) => `${asset.title} at ${asset.targetPath}`).join(", ")
    : "no specific assets yet";
  const code = codeTasks.length
    ? codeTasks.join(" ")
    : "name the first Luau scripts or modules to create";

  return [
    `Focus on the ${title} section for ${project.title}.`,
    `Studio path: ${studioPath}.`,
    `Player goal: ${playerGoal}`,
    `Use these assets if they fit: ${assets}.`,
    `Luau tasks: ${code}.`,
    "Give me the next visible Roblox Studio changes, the objects or folders to touch, and a short code plan for this section only."
  ].join(" ");
}

function sectionStatus(
  linkedAssets: StudioGameSectionLinkedAssetSummary[],
  codeTasks: string[]
): StudioGameSectionSummary["status"] {
  if (!linkedAssets.length) return "Needs assets";
  if (!codeTasks.length) return "Needs code review";
  return "Ready to build";
}

export function buildGameSections(project: ProjectForSections): StudioGameSectionSummary[] {
  const zones = zoneTitles(project);
  const visibleZones = zones.length ? zones : ["Starter Area", "Main Route", "Final Goal"];
  const zoneSections = visibleZones.map((title, index) => {
    const sectionType = sectionTypeForZone(index, visibleZones.length);
    const folderName = studioFolderName(index, title);
    const studioPath = `Workspace/LaunchpadWorld/${folderName}`;
    const linkedAssets = linkedAssetsForSection(project, sectionType, title);
    const codeTasks = codeTasksForSection(project, sectionType);
    const playerGoal = playerGoalForSection(project, sectionType, title);

    return {
      slug: `${sectionPrefix(sectionType)}-${slugify(title)}`,
      title,
      sectionType,
      playerGoal,
      studioPath,
      studioServices: studioServicesForSection(sectionType),
      sceneBeats: sceneBeatsForSection(project, sectionType, title),
      linkedAssets,
      codeTasks,
      coachPrompt: buildCoachPrompt({
        project,
        title,
        studioPath,
        playerGoal,
        linkedAssets,
        codeTasks
      }),
      status: sectionStatus(linkedAssets, codeTasks)
    };
  });

  const systemsTitle = "Rewards And UI";
  const systemsPath = "ReplicatedStorage/Launchpad";
  const systemsLinkedAssets = linkedAssetsForSection(project, "systems", systemsTitle);
  const systemsCodeTasks = codeTasksForSection(project, "systems");
  const systemsGoal = playerGoalForSection(project, "systems", systemsTitle);

  return [
    ...zoneSections,
    {
      slug: "systems-rewards",
      title: systemsTitle,
      sectionType: "systems",
      playerGoal: systemsGoal,
      studioPath: systemsPath,
      studioServices: studioServicesForSection("systems"),
      sceneBeats: sceneBeatsForSection(project, "systems", systemsTitle),
      linkedAssets: systemsLinkedAssets,
      codeTasks: systemsCodeTasks,
      coachPrompt: buildCoachPrompt({
        project,
        title: systemsTitle,
        studioPath: systemsPath,
        playerGoal: systemsGoal,
        linkedAssets: systemsLinkedAssets,
        codeTasks: systemsCodeTasks
      }),
      status: sectionStatus(systemsLinkedAssets, systemsCodeTasks)
    }
  ];
}
