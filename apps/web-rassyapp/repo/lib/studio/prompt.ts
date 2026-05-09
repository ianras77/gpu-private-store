import { buildWriterRoomSystemGuidance } from "@/lib/studio/writer-team";

type PromptMessage = {
  role: string;
  content: string;
};

function trimContent(input: string, maxChars: number) {
  return input.length > maxChars ? `${input.slice(0, maxChars)}...` : input;
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function readRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function buildContextLines(metadata?: Record<string, unknown> | null) {
  if (!metadata) return [] as string[];

  const consoleContext = readRecord(metadata.console_context);
  const lines = [
    readString(metadata.projectTitle) ? `Project: ${readString(metadata.projectTitle)}` : null,
    readString(metadata.templateName) ? `Starter template: ${readString(metadata.templateName)}` : null,
    readString(metadata.templateSlug) ? `Template slug: ${readString(metadata.templateSlug)}` : null,
    readString(metadata.projectTheme) ? `Theme: ${readString(metadata.projectTheme)}` : null,
    readString(metadata.heroGoal) ? `Hero goal: ${readString(metadata.heroGoal)}` : null,
    readString(metadata.worldProfileTitle)
      ? `World profile: ${readString(metadata.worldProfileTitle)}`
      : null,
    readString(metadata.mapPatternTitle) ? `Map pattern: ${readString(metadata.mapPatternTitle)}` : null,
    readString(metadata.worldRecipeHeadline)
      ? `World recipe: ${readString(metadata.worldRecipeHeadline)}`
      : null,
    readString(metadata.buildPlanOneLiner)
      ? `Starter pitch: ${readString(metadata.buildPlanOneLiner)}`
      : null,
    readString(metadata.buildPlanCoreLoop)
      ? `Core loop: ${readString(metadata.buildPlanCoreLoop)}`
      : null,
    readStringArray(metadata.buildPlanScenes).length
      ? `Scenes: ${readStringArray(metadata.buildPlanScenes).join(", ")}`
      : null,
    readStringArray(metadata.buildPlanMechanics).length
      ? `Mechanics: ${readStringArray(metadata.buildPlanMechanics).join(", ")}`
      : null,
    readStringArray(metadata.buildPlanQuests).length
      ? `Quest beats: ${readStringArray(metadata.buildPlanQuests).join(", ")}`
      : null,
    readStringArray(metadata.selectedAssetPackTitles).length
      ? `Approved asset shelves: ${readStringArray(metadata.selectedAssetPackTitles).join(", ")}`
      : null,
    readStringArray(metadata.selectedAssetItemTitles).length
      ? `Local asset items: ${readStringArray(metadata.selectedAssetItemTitles).join(", ")}`
      : null,
    readStringArray(metadata.selectedAssetManifestLines).length
      ? `Local asset manifests: ${readStringArray(metadata.selectedAssetManifestLines).join(" | ")}`
      : null,
    readStringArray(metadata.approvedCodePackageTitles).length
      ? `Approved Luau modules: ${readStringArray(metadata.approvedCodePackageTitles).join(", ")}`
      : null,
    readStringArray(metadata.approvedCodePackageLines).length
      ? `Local module manifests: ${readStringArray(metadata.approvedCodePackageLines).join(" | ")}`
      : null,
    readStringArray(metadata.worldRecipeLines).length
      ? `World recipe lines: ${readStringArray(metadata.worldRecipeLines).join(" | ")}`
      : null,
    readStringArray(metadata.worldCrewLines).length
      ? `World crew lines: ${readStringArray(metadata.worldCrewLines).join(" | ")}`
      : null,
    readString(metadata.sessionTitle) ? `Build lane: ${readString(metadata.sessionTitle)}` : null,
    readString(metadata.activeFile) ? `Active file: ${readString(metadata.activeFile)}` : null,
    readStringArray(metadata.openFiles).length
      ? `Open files: ${readStringArray(metadata.openFiles).join(", ")}`
      : null,
    readString(metadata.branch) ? `Branch: ${readString(metadata.branch)}` : null,
    readString(metadata.role) ? `Workspace role: ${readString(metadata.role)}` : null,
    readString(metadata.collaboratorCount)
      ? `Collaborators: ${readString(metadata.collaboratorCount)}`
      : typeof metadata.collaboratorCount === "number"
        ? `Collaborators: ${metadata.collaboratorCount}`
        : null,
    readString(consoleContext?.workspaceSlug)
      ? `Workspace slug: ${readString(consoleContext?.workspaceSlug)}`
      : null,
    readString(consoleContext?.workspaceRole)
      ? `Workspace role: ${readString(consoleContext?.workspaceRole)}`
      : null
  ].filter(Boolean);

  return lines;
}

export function buildRobloxCoachPrompt(options: {
  text: string;
  personaPrompt?: string | null;
  history?: PromptMessage[];
  metadata?: Record<string, unknown> | null;
}) {
  const sections = [
    [
      "System instructions:",
      "You are Rassy Launchpad, a collaborative Roblox game creation coach.",
      "Translate ideas into Roblox Studio terms first: places, Workspace, Parts, Models, Folders, StarterPlayer, StarterGui, ReplicatedStorage, ServerScriptService, NPCs, quests, checkpoints, collectibles, dialogue, UI, and playtest loops.",
      "When code is needed, default to Roblox Luau and name where each script, ModuleScript, LocalScript, or object should live in Studio.",
      "Prefer beginner-friendly, buildable steps that kids and collaborators can actually assemble.",
      "Stay anchored to the saved project context, starter template, theme, hero goal, world profile, map pattern, world recipe, approved asset shelves, local asset manifests, approved Luau modules, and current build plan when they are available.",
      "Avoid drifting into generic game-engine advice or non-Roblox APIs unless the user explicitly asks.",
      buildWriterRoomSystemGuidance()
    ].join("\n")
  ];

  if (options.personaPrompt) {
    sections.push(`Extra persona guidance:\n${options.personaPrompt}`);
  }

  const contextLines = buildContextLines(options.metadata);
  if (contextLines.length) {
    sections.push(`Shared studio context:\n${contextLines.join("\n")}`);
  }

  if (options.history?.length) {
    const historyBlock = options.history
      .map((item) => `${item.role.toUpperCase()}: ${trimContent(item.content, 700)}`)
      .join("\n");
    sections.push(`Recent thread history:\n${historyBlock}`);
  }

  sections.push(`Current user message:\n${options.text}`);
  sections.push(
    [
      "Response rules:",
      "- Keep the answer Roblox-specific.",
      "- If you suggest code, write Luau and name the Roblox services or containers involved.",
      "- If you suggest assets, scenes, NPCs, or quests, keep them aligned with the current starter, world recipe, approved shelves, local asset manifests, and approved Luau modules.",
      "- Prefer short, practical next steps over abstract theory."
    ].join("\n")
  );

  return sections.join("\n\n");
}

export function buildRobloxRoutinePrompt(options: {
  name: string;
  kind: string;
  description: string;
  promptBrief: string;
  contextJson?: string | null;
  input?: string;
}) {
  const storedContext = options.contextJson ? `Stored shared context:\n${options.contextJson}` : null;
  const runInput = options.input ? `Run input:\n${options.input}` : null;

  return [
    "You are executing a persistent Roblox game-building routine inside Rassy Launchpad.",
    `Routine name: ${options.name}`,
    `Routine kind: ${options.kind}`,
    `Routine description: ${options.description}`,
    "",
    "Routine brief:",
    options.promptBrief,
    storedContext,
    runInput,
    "",
    "Return a concise collaborator report with:",
    "- What happened or what you would do next for the Roblox project",
    "- Key Roblox-specific findings, scene changes, Luau tasks, or build outputs",
    "- The best next action for the shared team"
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildRobloxPluginPrompt(options: {
  draftName: string;
  draftDescription: string;
  currentSource: string;
  instructions: string;
}) {
  return [
    "You are writing a Cheshire Cat Python plugin module for Rassy Launchpad, a Roblox game creation studio.",
    "Return only Python code for one plugin module. No markdown fences.",
    "The plugin itself is Python, but its outputs and guidance should default to Roblox Studio and Luau concepts when relevant.",
    "Prefer capabilities that help with Roblox scenes, quests, NPCs, UI, asset shelves, build plans, Luau task breakdowns, or playtest loops.",
    `Plugin name: ${options.draftName}`,
    `Plugin description: ${options.draftDescription}`,
    "",
    "Current source:",
    options.currentSource,
    "",
    "User request:",
    options.instructions
  ].join("\n");
}
