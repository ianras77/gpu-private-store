import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getSessionFromRequest, resolveEngineUserId } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import {
  loadPluginDraft,
  normalizePluginSlug,
  savePluginDraft,
  type PluginDraft
} from "@/lib/cat/plugin-builder";
import { generatePluginSource } from "@/lib/cat/plugin-generation";
import { serializeRoutine } from "@/lib/agent-routines";
import { getStudioSummary } from "@/lib/studio/data";
import {
  ROBLOX_WRITER_STAGES,
  buildWriterProjectSnapshot,
  buildWriterStageBrief,
  type WriterProjectSnapshot
} from "@/lib/studio/writer-team";
import { getOrCreateWorkspace } from "@/lib/workspace/data";

export const runtime = "nodejs";

const PromoteSchema = z.object({
  mode: z.enum(["skill", "workflow", "loop", "writer-pack"]).default("skill"),
  source: z.enum(["last-user", "thread", "message"]).default("last-user"),
  messageId: z.string().optional(),
  workspaceContext: z
    .object({
      workspaceName: z.string().max(120).optional(),
      workspaceId: z.string().optional(),
      branch: z.string().max(120).optional(),
      activeFile: z.string().max(400).nullable().optional(),
      openFiles: z.array(z.string().max(400)).max(8).optional(),
      sessionId: z.string().optional(),
      sessionTitle: z.string().max(120).optional(),
      studioProjectId: z.string().optional(),
      projectTitle: z.string().max(160).optional(),
      templateName: z.string().max(120).optional(),
      templateSlug: z.string().max(120).optional(),
      projectTheme: z.string().max(200).optional(),
      theme: z.string().max(200).optional(),
      heroGoal: z.string().max(240).optional(),
      worldProfileTitle: z.string().max(160).optional(),
      mapPatternTitle: z.string().max(160).optional(),
      worldRecipeHeadline: z.string().max(320).optional(),
      worldRecipeLines: z.array(z.string().max(500)).max(12).optional(),
      worldCrewLines: z.array(z.string().max(320)).max(12).optional(),
      selectedAssetPackSlugs: z.array(z.string().max(120)).max(12).optional(),
      selectedAssetPackTitles: z.array(z.string().max(160)).max(12).optional(),
      selectedAssetManifestLines: z.array(z.string().max(240)).max(12).optional(),
      approvedCodePackageTitles: z.array(z.string().max(160)).max(12).optional(),
      approvedCodePackageLines: z.array(z.string().max(240)).max(12).optional(),
      buildPlanOneLiner: z.string().max(500).optional(),
      buildPlanCoreLoop: z.string().max(800).optional(),
      buildPlanScenes: z.array(z.string().max(160)).max(12).optional(),
      buildPlanMechanics: z.array(z.string().max(160)).max(12).optional(),
      buildPlanScripts: z.array(z.string().max(160)).max(12).optional(),
      collaboratorCount: z.number().int().min(0).max(50).optional()
    })
    .optional()
});

type PromotionMode = z.infer<typeof PromoteSchema>["mode"];
type PromotionSource = z.infer<typeof PromoteSchema>["source"];
type PromotionMessage = {
  id: string;
  role: string;
  content: string;
};
type WorkspaceContext = z.infer<typeof PromoteSchema>["workspaceContext"];

function trimContent(input: string, maxChars: number) {
  const clean = input.replace(/\s+/g, " ").trim();
  return clean.length > maxChars ? `${clean.slice(0, maxChars)}...` : clean;
}

function humanizeSlug(value: string) {
  return value
    .split("-")
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function modeMeta(mode: PromotionMode) {
  if (mode === "workflow") {
    return {
      suffix: "workflow",
      title: "Workflow",
      description:
        "Reusable multi-step Cheshire Cat workflow promoted from a live Roblox studio conversation.",
      instruction:
        "Turn this into a reusable multi-step workflow skill for Roblox game creation. It should sequence clear steps, surface progress, and be safe to rerun."
    };
  }

  if (mode === "loop") {
    return {
      suffix: "agent-loop",
      title: "Agent Loop",
      description:
        "Reusable Cheshire Cat agent loop promoted from a live Roblox studio conversation.",
      instruction:
        "Turn this into an agent loop skill for Roblox game creation. It should revisit work intentionally, report progress, and stop safely instead of running forever."
    };
  }

  if (mode === "writer-pack") {
    return {
      suffix: "writer-room",
      title: "Writer Room",
      description:
        "Linked Roblox writer-room routines promoted from a live studio conversation.",
      instruction:
        "Turn this into a reusable Roblox writer room. Break the work into staged agents with explicit handoffs, and spend multiple passes on the world first: pitch, terrain, landmarks, scenery, quest, script, and playtest."
    };
  }

  return {
    suffix: "skill",
    title: "Shared Skill",
    description:
      "Reusable Cheshire Cat shared skill promoted from a live Roblox studio conversation.",
    instruction:
      "Turn this into a reusable shared skill for Cheshire Cat inside a Roblox game-building studio. Prefer a focused capability with one strong tool entrypoint and safe defaults."
  };
}

function findLastIndex<T>(items: T[], predicate: (item: T) => boolean) {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (predicate(items[index])) return index;
  }
  return -1;
}

function pickFocusMessages(options: {
  messages: PromotionMessage[];
  source: PromotionSource;
  messageId?: string;
}) {
  const { messages, source, messageId } = options;
  if (!messages.length) return [];

  if (source === "thread") {
    return messages.slice(-8);
  }

  let focusIndex = -1;
  if (source === "message" && messageId) {
    focusIndex = messages.findIndex((message) => message.id === messageId);
  }
  if (focusIndex === -1) {
    focusIndex = findLastIndex(messages, (message) => message.role === "user");
  }
  if (focusIndex === -1) {
    return messages.slice(-4);
  }

  const focus = messages[focusIndex];
  const windowStart = Math.max(0, focusIndex - 1);
  const windowEnd = Math.min(messages.length, focusIndex + 2);
  const slice = messages.slice(windowStart, windowEnd);

  if (focus.role === "user") {
    return slice.filter(
      (message, index) =>
        index === 0 ||
        index === 1 ||
        message.role === "assistant" ||
        message.id === focus.id
    );
  }

  return slice;
}

function buildSeedText(threadTitle: string, focusMessages: PromotionMessage[]) {
  const preferred =
    focusMessages.find((message) => message.role === "user")?.content ??
    focusMessages[0]?.content ??
    threadTitle;
  return trimContent(preferred, 72) || threadTitle;
}

function buildSlug(seedText: string, mode: PromotionMode) {
  const base = normalizePluginSlug(seedText);
  const suffix = modeMeta(mode).suffix;
  if (base.endsWith(`-${suffix}`)) {
    return base;
  }
  return normalizePluginSlug(`${base}-${suffix}`);
}

function buildDraftFields(slug: string, mode: PromotionMode) {
  const meta = modeMeta(mode);
  const baseName = humanizeSlug(slug.replace(new RegExp(`-${meta.suffix}$`), ""));
  return {
    name: `${baseName || "Conversation"} ${meta.title}`.trim(),
    description: meta.description,
    moduleName: slug.replace(/-/g, "_")
  };
}

function buildProjectSnapshot(
  studioProject: Awaited<ReturnType<typeof getStudioSummary>> | null,
  workspaceContext?: WorkspaceContext
) {
  if (studioProject) {
    return buildWriterProjectSnapshot({
      projectId: studioProject.id,
      title: studioProject.title,
      templateName: studioProject.templatePack?.name ?? null,
      templateSlug: studioProject.templatePack?.slug ?? null,
      theme: studioProject.theme,
      heroGoal: studioProject.heroGoal ?? null,
      worldProfileTitle: studioProject.worldProfile?.title ?? null,
      mapPatternTitle: studioProject.mapPattern?.title ?? null,
      worldRecipeHeadline: studioProject.worldRecipe?.headline ?? null,
      worldRecipeLines: studioProject.worldRecipe?.promptLines ?? [],
      worldCrewLines: studioProject.worldRecipe?.crewLines ?? [],
      selectedAssetPackSlugs: studioProject.selectedAssetPackSlugs,
      selectedAssetPackTitles: studioProject.selectedAssetPacks.map((pack) => pack.title),
      selectedAssetManifestLines: studioProject.selectedAssetItems
        .slice(0, 8)
        .map((item) => `${item.title} -> ${item.targetPath} (${item.kind}; ${item.localBundleKey})`),
      approvedCodePackageTitles: studioProject.approvedCodePackages.map((pkg) => pkg.title),
      approvedCodePackageLines: studioProject.approvedCodePackages
        .slice(0, 4)
        .map((pkg) => `${pkg.title} -> ${pkg.targetContainer} (${pkg.localModulePath})`),
      buildPlanOneLiner: studioProject.buildPlan?.oneLiner ?? null,
      buildPlanCoreLoop: studioProject.buildPlan?.coreLoop ?? null,
      buildPlanScenes: studioProject.buildPlan?.scenes ?? [],
      buildPlanMechanics: studioProject.buildPlan?.mechanics ?? [],
      buildPlanScripts: studioProject.buildPlan?.scripts ?? []
    });
  }

  return buildWriterProjectSnapshot({
    projectId: workspaceContext?.studioProjectId,
    title: workspaceContext?.projectTitle ?? workspaceContext?.workspaceName ?? null,
    templateName: workspaceContext?.templateName,
    templateSlug: workspaceContext?.templateSlug,
    theme: workspaceContext?.projectTheme ?? workspaceContext?.theme ?? null,
    heroGoal: workspaceContext?.heroGoal,
    worldProfileTitle: workspaceContext?.worldProfileTitle,
    mapPatternTitle: workspaceContext?.mapPatternTitle,
    worldRecipeHeadline: workspaceContext?.worldRecipeHeadline,
    worldRecipeLines: workspaceContext?.worldRecipeLines ?? [],
    worldCrewLines: workspaceContext?.worldCrewLines ?? [],
    selectedAssetPackSlugs: workspaceContext?.selectedAssetPackSlugs ?? [],
    selectedAssetPackTitles: workspaceContext?.selectedAssetPackTitles ?? [],
    selectedAssetManifestLines: workspaceContext?.selectedAssetManifestLines ?? [],
    approvedCodePackageTitles: workspaceContext?.approvedCodePackageTitles ?? [],
    approvedCodePackageLines: workspaceContext?.approvedCodePackageLines ?? [],
    buildPlanOneLiner: workspaceContext?.buildPlanOneLiner,
    buildPlanCoreLoop: workspaceContext?.buildPlanCoreLoop,
    buildPlanScenes: workspaceContext?.buildPlanScenes ?? [],
    buildPlanMechanics: workspaceContext?.buildPlanMechanics ?? [],
    buildPlanScripts: workspaceContext?.buildPlanScripts ?? []
  });
}

function buildProjectLines(project?: WriterProjectSnapshot | null) {
  if (!project) return [] as string[];

  return [
    project.title ? `Project: ${project.title}` : null,
    project.templateName ? `Starter template: ${project.templateName}` : null,
    project.theme ? `Theme: ${project.theme}` : null,
    project.heroGoal ? `Hero goal: ${project.heroGoal}` : null,
    project.worldProfileTitle ? `World profile: ${project.worldProfileTitle}` : null,
    project.mapPatternTitle ? `Map pattern: ${project.mapPatternTitle}` : null,
    project.worldRecipeHeadline ? `World recipe: ${project.worldRecipeHeadline}` : null,
    project.buildPlanOneLiner ? `Starter pitch: ${project.buildPlanOneLiner}` : null,
    project.buildPlanCoreLoop ? `Core loop: ${project.buildPlanCoreLoop}` : null,
    project.buildPlanScenes.length ? `Scenes: ${project.buildPlanScenes.join(", ")}` : null,
    project.buildPlanMechanics.length
      ? `Mechanics: ${project.buildPlanMechanics.join(", ")}`
      : null,
    project.buildPlanScripts.length ? `Luau tasks: ${project.buildPlanScripts.join(", ")}` : null,
    project.worldRecipeLines.length ? `World recipe lines: ${project.worldRecipeLines.join(" | ")}` : null,
    project.worldCrewLines.length ? `World crew: ${project.worldCrewLines.join(" | ")}` : null,
    project.selectedAssetPackSlugs.length
      ? `Approved asset shelves: ${project.selectedAssetPackSlugs.join(", ")}`
      : null
  ].filter((value): value is string => Boolean(value));
}

function buildWorkspaceLines(workspaceContext?: WorkspaceContext) {
  return [
    workspaceContext?.workspaceName ? `Workspace: ${workspaceContext.workspaceName}` : null,
    workspaceContext?.branch ? `Branch: ${workspaceContext.branch}` : null,
    workspaceContext?.sessionTitle ? `Session lane: ${workspaceContext.sessionTitle}` : null,
    workspaceContext?.activeFile ? `Active file: ${workspaceContext.activeFile}` : null,
    workspaceContext?.openFiles?.length ? `Open files: ${workspaceContext.openFiles.join(", ")}` : null,
    typeof workspaceContext?.collaboratorCount === "number"
      ? `Collaborators: ${workspaceContext.collaboratorCount}`
      : null
  ].filter((value): value is string => Boolean(value));
}

function buildBrief(options: {
  mode: PromotionMode;
  threadTitle: string;
  focusMessages: PromotionMessage[];
  project?: WriterProjectSnapshot | null;
  workspaceContext?: WorkspaceContext;
}) {
  const workspaceLines = buildWorkspaceLines(options.workspaceContext);
  const projectLines = buildProjectLines(options.project);
  const conversationBlock = options.focusMessages
    .map((message) => `${message.role.toUpperCase()}: ${trimContent(message.content, 420)}`)
    .join("\n");

  return [
    `Thread title: ${options.threadTitle}`,
    ...workspaceLines,
    projectLines.length ? "" : null,
    projectLines.length ? "Shared Roblox project:" : null,
    ...projectLines,
    "",
    "Promote this conversation into a reusable Cheshire Cat capability.",
    modeMeta(options.mode).instruction,
    "",
    "Conversation slice:",
    conversationBlock,
    "",
    "Implementation guidance:",
    "- Keep the capability focused on Roblox game creation, Roblox Studio workflows, or Luau help.",
    "- Prefer world-building passes that create visible progress quickly for kids.",
    "- Use Cheshire Cat tool or hook patterns as appropriate.",
    "- Return clear, concise output for a studio builder working on a Roblox project.",
    "- Prefer safe defaults and explicit behavior over hidden magic."
  ]
    .filter((value): value is string => Boolean(value))
    .join("\n");
}

function buildRoutineContext(workspaceContext?: WorkspaceContext, project?: WriterProjectSnapshot | null) {
  return {
    ...(workspaceContext ?? {}),
    projectTitle: project?.title ?? workspaceContext?.projectTitle ?? null,
    templateName: project?.templateName ?? workspaceContext?.templateName ?? null,
    templateSlug: project?.templateSlug ?? workspaceContext?.templateSlug ?? null,
    projectTheme: project?.theme ?? workspaceContext?.projectTheme ?? workspaceContext?.theme ?? null,
    heroGoal: project?.heroGoal ?? workspaceContext?.heroGoal ?? null,
    worldProfileTitle: project?.worldProfileTitle ?? workspaceContext?.worldProfileTitle ?? null,
    mapPatternTitle: project?.mapPatternTitle ?? workspaceContext?.mapPatternTitle ?? null,
    worldRecipeHeadline: project?.worldRecipeHeadline ?? workspaceContext?.worldRecipeHeadline ?? null,
    worldRecipeLines: project?.worldRecipeLines ?? workspaceContext?.worldRecipeLines ?? [],
    worldCrewLines: project?.worldCrewLines ?? workspaceContext?.worldCrewLines ?? [],
    selectedAssetPackSlugs:
      project?.selectedAssetPackSlugs ?? workspaceContext?.selectedAssetPackSlugs ?? [],
    selectedAssetPackTitles:
      project?.selectedAssetPackTitles ?? workspaceContext?.selectedAssetPackTitles ?? [],
    selectedAssetManifestLines:
      project?.selectedAssetManifestLines ?? workspaceContext?.selectedAssetManifestLines ?? [],
    approvedCodePackageTitles:
      project?.approvedCodePackageTitles ?? workspaceContext?.approvedCodePackageTitles ?? [],
    approvedCodePackageLines:
      project?.approvedCodePackageLines ?? workspaceContext?.approvedCodePackageLines ?? [],
    buildPlanOneLiner: project?.buildPlanOneLiner ?? workspaceContext?.buildPlanOneLiner ?? null,
    buildPlanCoreLoop: project?.buildPlanCoreLoop ?? workspaceContext?.buildPlanCoreLoop ?? null,
    buildPlanScenes: project?.buildPlanScenes ?? workspaceContext?.buildPlanScenes ?? [],
    buildPlanMechanics: project?.buildPlanMechanics ?? workspaceContext?.buildPlanMechanics ?? [],
    buildPlanScripts: project?.buildPlanScripts ?? workspaceContext?.buildPlanScripts ?? []
  };
}

async function createWriterPackRoutines(options: {
  userId: string;
  workspaceId: string;
  sessionId?: string | null;
  threadId: string;
  draft: PluginDraft;
  threadTitle: string;
  focusMessages: PromotionMessage[];
  project?: WriterProjectSnapshot | null;
  workspaceContext?: WorkspaceContext;
}): Promise<Array<ReturnType<typeof serializeRoutine>>> {
  const routines: Array<ReturnType<typeof serializeRoutine>> = [];
  const projectTitle = options.project?.title ?? options.workspaceContext?.projectTitle ?? "Launchpad";
  let dependsOnRoutineId: string | null = null;

  for (const stage of ROBLOX_WRITER_STAGES) {
    const promptBrief = buildWriterStageBrief({
      stage,
      threadTitle: options.threadTitle,
      focusMessages: options.focusMessages,
      project: options.project,
      workspaceContext: {
        workspaceName: options.workspaceContext?.workspaceName,
        sessionTitle: options.workspaceContext?.sessionTitle,
        activeFile: options.workspaceContext?.activeFile ?? null,
        openFiles: options.workspaceContext?.openFiles,
        branch: options.workspaceContext?.branch
      }
    });

    const createdRoutineId: string = (
      await prisma.agentRoutine.create({
        data: {
          userId: options.userId,
          workspaceId: options.workspaceId,
          sessionId: options.sessionId ?? null,
          sourceThreadId: options.threadId,
          kind: stage.stageKey === "playtest" ? "loop" : "workflow",
          stageKey: stage.stageKey,
          agentKey: stage.agentKey,
          dependsOnRoutineId,
          status: "Active",
          triggerMode: "Manual",
          name: `${projectTitle} ${stage.title}`,
          description: `${stage.mission} Build the ${stage.outputLabel.toLowerCase()} for the shared Roblox project.`,
          draftSlug: options.draft.slug,
          promptBrief,
          workspaceContextJson: JSON.stringify({
            ...buildRoutineContext(options.workspaceContext, options.project),
            writerStageKey: stage.stageKey,
            writerAgentKey: stage.agentKey,
            desiredOutput: stage.outputLabel,
            handoffLabel: stage.handoffLabel
          }),
          projectSnapshotJson: options.project ? JSON.stringify(options.project) : null
        },
        select: { id: true }
      })
    ).id;

    const routineRecord = await prisma.agentRoutine.findUniqueOrThrow({
      where: { id: createdRoutineId },
      include: {
        session: true,
        sourceThread: true,
        runs: {
          orderBy: { createdAt: "desc" },
          take: 5
        }
      }
    });

    dependsOnRoutineId = createdRoutineId;
    routines.push(serializeRoutine(routineRecord));
  }

  return routines;
}

export async function POST(request: NextRequest, context: { params: { id: string } }) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await request.json().catch(() => null);
  const parsed = PromoteSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const thread = await prisma.chatThread.findFirst({
    where: { id: context.params.id, userId: session.userId },
    include: {
      messages: {
        orderBy: { createdAt: "asc" }
      }
    }
  });

  if (!thread) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }

  const focusMessages = pickFocusMessages({
    messages: thread.messages.map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content
    })),
    source: parsed.data.source,
    messageId: parsed.data.messageId
  });

  if (!focusMessages.length) {
    return NextResponse.json({ error: "No messages available to promote" }, { status: 400 });
  }

  const { workspace } = await getOrCreateWorkspace(session.userId);
  const workspaceId = parsed.data.workspaceContext?.workspaceId ?? workspace.id;
  const workspaceMember = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: session.userId } }
  });
  const sessionRecord = parsed.data.workspaceContext?.sessionId
    ? await prisma.workspaceSession.findFirst({
        where: {
          id: parsed.data.workspaceContext.sessionId,
          workspaceId: workspaceMember?.workspaceId ?? workspace.id
        }
      })
    : null;
  const studioProject = await getStudioSummary(workspaceMember?.workspaceId ?? workspace.id, session.userId).catch(
    () => null
  );
  const projectSnapshot = buildProjectSnapshot(studioProject, parsed.data.workspaceContext);

  const seedText = buildSeedText(thread.title, focusMessages);
  const slug = buildSlug(seedText, parsed.data.mode);
  const fields = buildDraftFields(slug, parsed.data.mode);

  let draft: PluginDraft = await savePluginDraft(session.userId, {
    slug,
    ...fields
  });

  const brief = buildBrief({
    mode: parsed.data.mode,
    threadTitle: thread.title,
    focusMessages,
    project: projectSnapshot,
    workspaceContext: parsed.data.workspaceContext
  });

  const generatedSource = await generatePluginSource({
    draft: await loadPluginDraft(session.userId, slug),
    instructions: brief,
    token: session.engineJwt,
    userId: resolveEngineUserId(session),
    appUserId: session.userId
  }).catch((error) => (error instanceof Error ? error : new Error("Unable to generate draft")));

  if (generatedSource instanceof Error) {
    return NextResponse.json({ error: generatedSource.message }, { status: 502 });
  }

  draft = await savePluginDraft(session.userId, {
    ...draft,
    source: generatedSource
  });

  let routine = null;
  let routines: ReturnType<typeof serializeRoutine>[] = [];

  if (parsed.data.mode === "writer-pack") {
    routines = await createWriterPackRoutines({
      userId: session.userId,
      workspaceId: workspaceMember?.workspaceId ?? workspace.id,
      sessionId: sessionRecord?.id ?? null,
      threadId: thread.id,
      draft,
      threadTitle: thread.title,
      focusMessages,
      project: projectSnapshot,
      workspaceContext: parsed.data.workspaceContext
    });
    routine = routines[0] ?? null;
  } else if (parsed.data.mode === "workflow" || parsed.data.mode === "loop") {
    const createdRoutine = await prisma.agentRoutine.create({
      data: {
        userId: session.userId,
        workspaceId: workspaceMember?.workspaceId ?? workspace.id,
        sessionId: sessionRecord?.id ?? null,
        sourceThreadId: thread.id,
        kind: parsed.data.mode,
        status: "Active",
        triggerMode: "Manual",
        name: draft.name,
        description: draft.description,
        draftSlug: draft.slug,
        promptBrief: brief,
        workspaceContextJson: parsed.data.workspaceContext
          ? JSON.stringify(buildRoutineContext(parsed.data.workspaceContext, projectSnapshot))
          : null,
        projectSnapshotJson: projectSnapshot ? JSON.stringify(projectSnapshot) : null
      },
      include: {
        session: true,
        sourceThread: true,
        runs: {
          orderBy: { createdAt: "desc" },
          take: 5
        }
      }
    });

    routine = serializeRoutine(createdRoutine);
    routines = routine ? [routine] : [];
  }

  return NextResponse.json({
    draft,
    routine,
    routines,
    writerPack:
      parsed.data.mode === "writer-pack"
        ? {
            title: `${projectSnapshot?.title ?? draft.name} Writer Room`,
            stageCount: routines.length
          }
        : null,
    brief,
    mode: parsed.data.mode,
    source: parsed.data.source,
    focus: {
      threadTitle: thread.title,
      messageCount: focusMessages.length
    }
  });
}
