export type WriterStageKey =
  | "pitch"
  | "terrain"
  | "landmarks"
  | "scenery"
  | "quest"
  | "script"
  | "playtest";

export type WriterAgentKey =
  | "dream-writer"
  | "terrain-writer"
  | "landmark-writer"
  | "scenery-writer"
  | "quest-writer"
  | "script-writer"
  | "playtest-writer";

export type WriterEngineProfile = "coach" | "planner" | "builder" | "critic";

export type WriterStageDefinition = {
  stageKey: WriterStageKey;
  agentKey: WriterAgentKey;
  title: string;
  mission: string;
  outputLabel: string;
  handoffLabel: string;
  dependsOnStageKey?: WriterStageKey;
  engineProfile: WriterEngineProfile;
  focusPoints: string[];
};

export type WriterProjectSnapshot = {
  projectId?: string | null;
  title?: string | null;
  templateName?: string | null;
  templateSlug?: string | null;
  theme?: string | null;
  heroGoal?: string | null;
  worldProfileTitle?: string | null;
  mapPatternTitle?: string | null;
  worldRecipeHeadline?: string | null;
  worldRecipeLines: string[];
  worldCrewLines: string[];
  selectedAssetPackSlugs: string[];
  selectedAssetPackTitles: string[];
  selectedAssetManifestLines: string[];
  approvedCodePackageTitles: string[];
  approvedCodePackageLines: string[];
  buildPlanOneLiner?: string | null;
  buildPlanCoreLoop?: string | null;
  buildPlanScenes: string[];
  buildPlanMechanics: string[];
  buildPlanScripts: string[];
};

export type WriterStageSummary = {
  stageKey: WriterStageKey;
  agentKey: WriterAgentKey;
  title: string;
  mission: string;
  outputLabel: string;
  handoffLabel: string;
  dependsOnStageKey?: WriterStageKey;
  engineProfile: WriterEngineProfile;
  engineLabel: string;
  dedicatedEngine: boolean;
  status: string;
  routineId?: string | null;
  draftSlug?: string | null;
  latestRunPreview?: string | null;
  latestRunAt?: string | null;
  handoff?: Record<string, unknown> | null;
};

export const ROBLOX_WRITER_STAGES: WriterStageDefinition[] = [
  {
    stageKey: "pitch",
    agentKey: "dream-writer",
    title: "Pitch Writer",
    mission: "Turn kid language into one clear Roblox game promise.",
    outputLabel: "Starter pitch",
    handoffLabel: "Terrain direction",
    engineProfile: "coach",
    focusPoints: [
      "Choose the strongest player fantasy",
      "Keep the win condition easy to explain",
      "Name the best Roblox template fit",
      "Keep the scope small enough for a first playable version"
    ]
  },
  {
    stageKey: "terrain",
    agentKey: "terrain-writer",
    title: "Terrain Writer",
    mission: "Lay out the terrain, pathing, spawn, and big map beats one zone at a time.",
    outputLabel: "Terrain plan",
    handoffLabel: "Landmark map",
    dependsOnStageKey: "pitch",
    engineProfile: "planner",
    focusPoints: [
      "Lay out the hub, action lane, and celebration space",
      "Break the world into small buildable zones",
      "Use simple Roblox terrain and parts first",
      "Keep navigation readable for kids"
    ]
  },
  {
    stageKey: "landmarks",
    agentKey: "landmark-writer",
    title: "Landmark Writer",
    mission: "Place the memorable structures, set pieces, and visual anchors that make the world exciting fast.",
    outputLabel: "Landmark pass",
    handoffLabel: "Scenery pass",
    dependsOnStageKey: "terrain",
    engineProfile: "planner",
    focusPoints: [
      "Choose one hero landmark per zone",
      "Use approved shelves and easy-to-place Roblox objects",
      "Name the best props for first-playable wow moments",
      "Keep each landmark readable from a distance"
    ]
  },
  {
    stageKey: "scenery",
    agentKey: "scenery-writer",
    title: "Scenery Writer",
    mission: "Fill the world with cozy detail, atmosphere, and kid-friendly decoration without overcomplicating the map.",
    outputLabel: "Scenery pass",
    handoffLabel: "Quest beats",
    dependsOnStageKey: "landmarks",
    engineProfile: "builder",
    focusPoints: [
      "Dress each zone with small props, color, and atmosphere",
      "Favor simple repeated kits over one-off complexity",
      "Use approved shelves for props, FX, and sound moments",
      "Keep the scenery supportive of play, not in the player's way"
    ]
  },
  {
    stageKey: "quest",
    agentKey: "quest-writer",
    title: "Quest Writer",
    mission: "Turn the world into a beginner-friendly sequence of goals, NPC prompts, and rewards.",
    outputLabel: "Quest flow",
    handoffLabel: "Luau tasks",
    dependsOnStageKey: "scenery",
    engineProfile: "planner",
    focusPoints: [
      "Write simple objective loops",
      "Define friendly NPC jobs",
      "Keep rewards motivating but readable",
      "Prepare data the script writer can implement"
    ]
  },
  {
    stageKey: "script",
    agentKey: "script-writer",
    title: "Script Writer",
    mission: "Translate the plan into Roblox Studio objects, Luau scripts, and exact placement guidance.",
    outputLabel: "Studio build sheet",
    handoffLabel: "Playtest checklist",
    dependsOnStageKey: "quest",
    engineProfile: "builder",
    focusPoints: [
      "Write Luau only when needed",
      "Name exact Studio locations",
      "Prefer small scripts and ModuleScripts over giant files",
      "Keep implementation safe for remixing"
    ]
  },
  {
    stageKey: "playtest",
    agentKey: "playtest-writer",
    title: "Playtest Writer",
    mission: "Check the build for clarity, fun, and kid-friendly pacing before the next revision.",
    outputLabel: "Playtest notes",
    handoffLabel: "Next remix",
    dependsOnStageKey: "script",
    engineProfile: "critic",
    focusPoints: [
      "Look for confusion points and dead ends",
      "Recommend one fun upgrade and one simplification",
      "Keep feedback constructive and buildable",
      "Prepare a clean next-step handoff back to the team"
    ]
  }
];

function trimText(input: string, maxChars: number) {
  const clean = input.replace(/\s+/g, " ").trim();
  return clean.length > maxChars ? `${clean.slice(0, maxChars)}...` : clean;
}

function uniqueStrings(values?: string[] | null, maxItems = 8) {
  return Array.from(new Set(values ?? []))
    .filter((value) => typeof value === "string" && value.trim().length > 0)
    .slice(0, maxItems);
}

function pickTheme(snapshot?: WriterProjectSnapshot | null) {
  return snapshot?.theme?.trim() || null;
}

export function getWriterStage(stageKey?: string | null) {
  if (!stageKey) return null;
  return ROBLOX_WRITER_STAGES.find((stage) => stage.stageKey === stageKey) ?? null;
}

export function getNextWriterStage(stageKey?: string | null) {
  if (!stageKey) return ROBLOX_WRITER_STAGES[0] ?? null;
  const index = ROBLOX_WRITER_STAGES.findIndex((stage) => stage.stageKey === stageKey);
  if (index === -1) return null;
  return ROBLOX_WRITER_STAGES[index + 1] ?? null;
}

export function buildWriterProjectSnapshot(
  snapshot?: Partial<WriterProjectSnapshot> | null
): WriterProjectSnapshot | null {
  if (!snapshot) return null;

  const title = typeof snapshot.title === "string" && snapshot.title.trim() ? snapshot.title.trim() : null;
  const templateName =
    typeof snapshot.templateName === "string" && snapshot.templateName.trim()
      ? snapshot.templateName.trim()
      : null;
  const templateSlug =
    typeof snapshot.templateSlug === "string" && snapshot.templateSlug.trim()
      ? snapshot.templateSlug.trim()
      : null;
  const theme = typeof snapshot.theme === "string" && snapshot.theme.trim() ? snapshot.theme.trim() : null;
  const heroGoal =
    typeof snapshot.heroGoal === "string" && snapshot.heroGoal.trim() ? snapshot.heroGoal.trim() : null;

  const hasAssetContext =
    uniqueStrings(snapshot.worldRecipeLines, 10).length > 0 ||
    uniqueStrings(snapshot.worldCrewLines, 8).length > 0 ||
    uniqueStrings(snapshot.selectedAssetPackSlugs, 12).length > 0 ||
    uniqueStrings(snapshot.selectedAssetPackTitles, 12).length > 0 ||
    uniqueStrings(snapshot.selectedAssetManifestLines, 8).length > 0 ||
    uniqueStrings(snapshot.approvedCodePackageTitles, 8).length > 0 ||
    uniqueStrings(snapshot.approvedCodePackageLines, 6).length > 0;

  if (
    !title &&
    !templateName &&
    !theme &&
    !heroGoal &&
    !snapshot.buildPlanOneLiner &&
    !snapshot.buildPlanCoreLoop &&
    !hasAssetContext
  ) {
    return null;
  }

  return {
    projectId:
      typeof snapshot.projectId === "string" && snapshot.projectId.trim() ? snapshot.projectId.trim() : null,
    title,
    templateName,
    templateSlug,
    theme,
    heroGoal,
    worldProfileTitle:
      typeof snapshot.worldProfileTitle === "string" && snapshot.worldProfileTitle.trim()
        ? snapshot.worldProfileTitle.trim()
        : null,
    mapPatternTitle:
      typeof snapshot.mapPatternTitle === "string" && snapshot.mapPatternTitle.trim()
        ? snapshot.mapPatternTitle.trim()
        : null,
    worldRecipeHeadline:
      typeof snapshot.worldRecipeHeadline === "string" && snapshot.worldRecipeHeadline.trim()
        ? snapshot.worldRecipeHeadline.trim()
        : null,
    worldRecipeLines: uniqueStrings(snapshot.worldRecipeLines, 10),
    worldCrewLines: uniqueStrings(snapshot.worldCrewLines, 8),
    selectedAssetPackSlugs: uniqueStrings(snapshot.selectedAssetPackSlugs, 12),
    selectedAssetPackTitles: uniqueStrings(snapshot.selectedAssetPackTitles, 12),
    selectedAssetManifestLines: uniqueStrings(snapshot.selectedAssetManifestLines, 8),
    approvedCodePackageTitles: uniqueStrings(snapshot.approvedCodePackageTitles, 8),
    approvedCodePackageLines: uniqueStrings(snapshot.approvedCodePackageLines, 6),
    buildPlanOneLiner:
      typeof snapshot.buildPlanOneLiner === "string" && snapshot.buildPlanOneLiner.trim()
        ? snapshot.buildPlanOneLiner.trim()
        : null,
    buildPlanCoreLoop:
      typeof snapshot.buildPlanCoreLoop === "string" && snapshot.buildPlanCoreLoop.trim()
        ? snapshot.buildPlanCoreLoop.trim()
        : null,
    buildPlanScenes: uniqueStrings(snapshot.buildPlanScenes, 8),
    buildPlanMechanics: uniqueStrings(snapshot.buildPlanMechanics, 8),
    buildPlanScripts: uniqueStrings(snapshot.buildPlanScripts, 8)
  };
}

function buildProjectLines(project?: WriterProjectSnapshot | null) {
  if (!project) return [] as string[];

  return [
    project.title ? `Project: ${project.title}` : null,
    project.templateName ? `Starter template: ${project.templateName}` : null,
    pickTheme(project) ? `Theme: ${pickTheme(project)}` : null,
    project.heroGoal ? `Hero goal: ${project.heroGoal}` : null,
    project.worldProfileTitle ? `World profile: ${project.worldProfileTitle}` : null,
    project.mapPatternTitle ? `Map pattern: ${project.mapPatternTitle}` : null,
    project.worldRecipeHeadline ? `World recipe: ${project.worldRecipeHeadline}` : null,
    project.worldRecipeLines.length
      ? `World recipe lines: ${project.worldRecipeLines.join(" | ")}`
      : null,
    project.worldCrewLines.length ? `World crew: ${project.worldCrewLines.join(" | ")}` : null,
    project.selectedAssetPackTitles.length
      ? `Approved asset shelves: ${project.selectedAssetPackTitles.join(", ")}`
      : project.selectedAssetPackSlugs.length
        ? `Approved asset shelf slugs: ${project.selectedAssetPackSlugs.join(", ")}`
        : null,
    project.selectedAssetManifestLines.length
      ? `Local asset manifests: ${project.selectedAssetManifestLines.join(" | ")}`
      : null,
    project.approvedCodePackageTitles.length
      ? `Approved Luau modules: ${project.approvedCodePackageTitles.join(", ")}`
      : null,
    project.approvedCodePackageLines.length
      ? `Local module manifests: ${project.approvedCodePackageLines.join(" | ")}`
      : null,
    project.buildPlanOneLiner ? `Starter pitch: ${project.buildPlanOneLiner}` : null,
    project.buildPlanCoreLoop ? `Core loop: ${project.buildPlanCoreLoop}` : null,
    project.buildPlanScenes.length ? `Scenes: ${project.buildPlanScenes.join(", ")}` : null,
    project.buildPlanMechanics.length
      ? `Mechanics: ${project.buildPlanMechanics.join(", ")}`
      : null,
    project.buildPlanScripts.length ? `Luau tasks: ${project.buildPlanScripts.join(", ")}` : null
  ].filter((value): value is string => Boolean(value));
}

export function buildWriterRoomSystemGuidance() {
  return [
    "Writer room order:",
    ...ROBLOX_WRITER_STAGES.map(
      (stage) =>
        `- ${stage.title}: ${stage.mission} Output: ${stage.outputLabel}. Handoff: ${stage.handoffLabel}.`
    ),
    "When the user asks a broad question, move the project forward by one writer step and explain the handoff to the next stage."
  ].join("\n");
}

export function buildWriterStageBrief(options: {
  stage: WriterStageDefinition;
  threadTitle: string;
  focusMessages: Array<{ role: string; content: string }>;
  project?: WriterProjectSnapshot | null;
  workspaceContext?: {
    workspaceName?: string;
    sessionTitle?: string;
    activeFile?: string | null;
    openFiles?: string[];
    branch?: string;
  } | null;
}) {
  const stageIndex = ROBLOX_WRITER_STAGES.findIndex((item) => item.stageKey === options.stage.stageKey);
  const previousStage = stageIndex > 0 ? ROBLOX_WRITER_STAGES[stageIndex - 1] : null;
  const nextStage = ROBLOX_WRITER_STAGES[stageIndex + 1] ?? null;
  const workspaceLines = [
    options.workspaceContext?.workspaceName ? `Workspace: ${options.workspaceContext.workspaceName}` : null,
    options.workspaceContext?.sessionTitle ? `Session lane: ${options.workspaceContext.sessionTitle}` : null,
    options.workspaceContext?.branch ? `Branch: ${options.workspaceContext.branch}` : null,
    options.workspaceContext?.activeFile ? `Active file: ${options.workspaceContext.activeFile}` : null,
    options.workspaceContext?.openFiles?.length
      ? `Open files: ${options.workspaceContext.openFiles.join(", ")}`
      : null
  ].filter((value): value is string => Boolean(value));
  const conversationBlock = options.focusMessages
    .map((message) => `${message.role.toUpperCase()}: ${trimText(message.content, 360)}`)
    .join("\n");
  const projectLines = buildProjectLines(options.project);

  return [
    `Thread title: ${options.threadTitle}`,
    `Writer stage: ${options.stage.title}`,
    `Mission: ${options.stage.mission}`,
    `Output needed: ${options.stage.outputLabel}`,
    `Expected handoff: ${options.stage.handoffLabel}`,
    previousStage ? `Needs input from: ${previousStage.title}` : null,
    nextStage ? `Hand off to: ${nextStage.title}` : null,
    ...workspaceLines,
    projectLines.length ? "" : null,
    projectLines.length ? "Shared Roblox project:" : null,
    ...projectLines,
    "",
    "Conversation slice:",
    conversationBlock,
    "",
    "Stage focus:",
    ...options.stage.focusPoints.map((point) => `- ${point}`),
    "",
    "Return a Roblox-specific stage deliverable with:",
    `- ${options.stage.outputLabel}`,
    `- A short handoff section for the ${nextStage?.title ?? "next collaborator"}`,
    "- Exact Roblox Studio placement or Luau tasks when relevant"
  ]
    .filter((value): value is string => Boolean(value))
    .join("\n");
}

export function buildWriterHandoff(options: {
  stage: WriterStageDefinition;
  outputText: string;
  routineName: string;
  completedAt: Date;
}) {
  const nextStage = getNextWriterStage(options.stage.stageKey);

  return {
    fromStageKey: options.stage.stageKey,
    fromAgentKey: options.stage.agentKey,
    fromTitle: options.stage.title,
    routineName: options.routineName,
    outputLabel: options.stage.outputLabel,
    summary: trimText(options.outputText, 260),
    nextStageKey: nextStage?.stageKey ?? null,
    nextStageTitle: nextStage?.title ?? null,
    completedAt: options.completedAt.toISOString()
  };
}
