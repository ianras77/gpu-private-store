import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getSessionFromRequest, resolveEngineUserId } from "@/lib/auth/session";
import { getCatProfileConfig } from "@/lib/cat/topology";
import { prisma } from "@/lib/db";
import { streamChat } from "@/lib/cat/chat";
import {
  summarizeAssetItemsForPrompt,
  summarizeCodePackagesForPrompt
} from "@/lib/studio/assets";
import { getStudioSummary } from "@/lib/studio/data";
import { buildWriterRoomSystemGuidance } from "@/lib/studio/writer-team";
import { getOrCreateWorkspace } from "@/lib/workspace/data";

export const runtime = "nodejs";

const ThreadStreamSchema = z.object({
  text: z.string().min(1).max(16_000),
  metadata: z.record(z.unknown()).optional(),
  historyLimit: z.number().int().min(0).max(24).optional()
});

type ThreadMessage = {
  role: string;
  content: string;
};

type PromptProjectContext = {
  title: string;
  templateName?: string | null;
  theme?: string | null;
  heroGoal?: string | null;
  worldProfileTitle?: string | null;
  mapPatternTitle?: string | null;
  worldRecipeHeadline?: string | null;
  worldRecipeLines?: string[];
  worldCrewLines?: string[];
  selectedAssetPackSlugs?: string[];
  selectedAssetPackTitles?: string[];
  selectedAssetManifestLines?: string[];
  approvedCodePackageTitles?: string[];
  approvedCodePackageLines?: string[];
  buildPlan?: {
    oneLiner?: string | null;
    coreLoop?: string | null;
    scenes: string[];
    mechanics: string[];
    scripts: string[];
  } | null;
  lastEditedBy?: string | null;
  writerStages?: Array<{ title: string; status: string }>;
} | null;

function serializeMeta(meta: Record<string, unknown>) {
  try {
    return JSON.stringify(meta);
  } catch {
    return null;
  }
}

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

function buildPrompt(options: {
  text: string;
  personaPrompt: string | null;
  history: ThreadMessage[];
  metadata: Record<string, unknown>;
  project: PromptProjectContext;
}) {
  const sections: string[] = [];

  sections.push(
    [
      "Studio role:",
      "You are Rassy Launchpad, a collaborative Roblox game creation coach.",
      "Stay fully focused on Roblox Studio, Roblox game design, and Luau.",
      "When code is useful, write Luau and say exactly where it belongs in Roblox Studio, such as ServerScriptService, StarterPlayerScripts, ReplicatedStorage, StarterGui, or Workspace.",
      "Prefer Roblox-specific guidance over generic engine advice.",
      "Keep responses encouraging and kid-friendly, but make the build steps technically precise for a real Roblox project.",
      "When possible, organize help around: pitch, world recipe, scenes, mechanics, NPCs, UI, assets, Luau tasks, and next Studio steps.",
      buildWriterRoomSystemGuidance()
    ].join("\n")
  );

  if (options.personaPrompt) {
    sections.push(`System persona:\n${options.personaPrompt}`);
  }

  if (options.project) {
    const projectLines = [
      `Project title: ${options.project.title}`,
      options.project.templateName ? `Starter template: ${options.project.templateName}` : null,
      options.project.theme ? `Theme: ${options.project.theme}` : null,
      options.project.heroGoal ? `Hero goal: ${options.project.heroGoal}` : null,
      options.project.worldProfileTitle ? `World profile: ${options.project.worldProfileTitle}` : null,
      options.project.mapPatternTitle ? `Map pattern: ${options.project.mapPatternTitle}` : null,
      options.project.worldRecipeHeadline ? `World recipe: ${options.project.worldRecipeHeadline}` : null,
      options.project.worldRecipeLines?.length
        ? `World recipe lines: ${options.project.worldRecipeLines.join(" | ")}`
        : null,
      options.project.worldCrewLines?.length
        ? `World crew: ${options.project.worldCrewLines.join(" | ")}`
        : null,
      options.project.selectedAssetPackSlugs?.length
        ? `Approved asset shelves: ${options.project.selectedAssetPackSlugs.join(", ")}`
        : null,
      options.project.selectedAssetPackTitles?.length
        ? `Approved asset shelf titles: ${options.project.selectedAssetPackTitles.join(", ")}`
        : null,
      options.project.selectedAssetManifestLines?.length
        ? `Local asset manifests: ${options.project.selectedAssetManifestLines.join(" | ")}`
        : null,
      options.project.approvedCodePackageTitles?.length
        ? `Approved Luau modules: ${options.project.approvedCodePackageTitles.join(", ")}`
        : null,
      options.project.approvedCodePackageLines?.length
        ? `Local module manifests: ${options.project.approvedCodePackageLines.join(" | ")}`
        : null,
      options.project.buildPlan?.oneLiner ? `One-line pitch: ${options.project.buildPlan.oneLiner}` : null,
      options.project.buildPlan?.coreLoop ? `Core loop: ${options.project.buildPlan.coreLoop}` : null,
      options.project.buildPlan?.scenes?.length
        ? `Scenes: ${options.project.buildPlan.scenes.join(", ")}`
        : null,
      options.project.buildPlan?.mechanics?.length
        ? `Mechanics: ${options.project.buildPlan.mechanics.join(", ")}`
        : null,
      options.project.buildPlan?.scripts?.length
        ? `Roblox script tasks: ${options.project.buildPlan.scripts.join(", ")}`
        : null,
      options.project.lastEditedBy ? `Last collaborator to save: ${options.project.lastEditedBy}` : null,
      options.project.writerStages?.length
        ? `Writer room: ${options.project.writerStages
            .map((stage) => `${stage.title}=${stage.status}`)
            .join(", ")}`
        : null
    ].filter(Boolean);

    if (projectLines.length) {
      sections.push(`Shared studio project:\n${projectLines.join("\n")}`);
    }
  }

  const metadataLines = [
    readString(options.metadata.sessionTitle) ? `Current build lane: ${readString(options.metadata.sessionTitle)}` : null,
    readString(options.metadata.activeFile) ? `Active file: ${readString(options.metadata.activeFile)}` : null,
    readString(options.metadata.branch) ? `Workspace branch: ${readString(options.metadata.branch)}` : null,
    readString(options.metadata.role) ? `Current collaborator role: ${readString(options.metadata.role)}` : null,
    readStringArray(options.metadata.openFiles).length
      ? `Open files: ${readStringArray(options.metadata.openFiles).join(", ")}`
      : null
  ].filter(Boolean);

  if (metadataLines.length) {
    sections.push(`Current editor context:\n${metadataLines.join("\n")}`);
  }

  if (options.history.length) {
    const historyBlock = options.history
      .map((item) => `${item.role.toUpperCase()}: ${trimContent(item.content, 700)}`)
      .join("\n");
    sections.push(`Recent thread history:\n${historyBlock}`);
  }

  sections.push(`Current user message:\n${options.text}`);
  return sections.join("\n\n");
}

function inferThreadTitle(currentTitle: string, text: string) {
  if (currentTitle !== "New Thread") return currentTitle;
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > 80 ? `${clean.slice(0, 80)}...` : clean || currentTitle;
}

export async function POST(request: NextRequest, context: { params: { id: string } }) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await request.json().catch(() => null);
  const parsed = ThreadStreamSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const historyLimit = parsed.data.historyLimit ?? 12;
  const thread = await prisma.chatThread.findFirst({
    where: { id: context.params.id, userId: session.userId },
    include: {
      persona: true,
      messages: {
        orderBy: { createdAt: "desc" },
        take: historyLimit
      }
    }
  });

  if (!thread) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }

  const history = [...thread.messages]
    .reverse()
    .map((message) => ({ role: message.role, content: message.content }));

  const text = parsed.data.text.trim();
  const metadata = parsed.data.metadata ?? {};
  const { workspace } = await getOrCreateWorkspace(session.userId);
  const studioProject = await getStudioSummary(workspace.id, session.userId).catch(() => null);
  const prompt = buildPrompt({
    text,
    personaPrompt: thread.persona?.systemPrompt ?? null,
    history,
    metadata,
    project: studioProject
      ? {
          title: studioProject.title,
          templateName: studioProject.templatePack?.name ?? null,
          theme: studioProject.theme,
          heroGoal: studioProject.heroGoal ?? null,
          worldProfileTitle: studioProject.worldProfile?.title ?? null,
          mapPatternTitle: studioProject.mapPattern?.title ?? null,
          worldRecipeHeadline: studioProject.worldRecipe?.headline ?? null,
          worldRecipeLines: studioProject.worldRecipe?.promptLines ?? [],
          worldCrewLines: studioProject.worldRecipe?.crewLines ?? [],
          selectedAssetPackSlugs: studioProject.selectedAssetPackSlugs,
          selectedAssetPackTitles: studioProject.selectedAssetPacks.map((pack) => pack.title),
          selectedAssetManifestLines: summarizeAssetItemsForPrompt(studioProject.selectedAssetItems, 8),
          approvedCodePackageTitles: studioProject.approvedCodePackages.map((pkg) => pkg.title),
          approvedCodePackageLines: summarizeCodePackagesForPrompt(
            studioProject.approvedCodePackages,
            4
          ),
          buildPlan: studioProject.buildPlan
            ? {
                oneLiner: studioProject.buildPlan.oneLiner ?? null,
                coreLoop: studioProject.buildPlan.coreLoop ?? null,
                scenes: studioProject.buildPlan.scenes,
                mechanics: studioProject.buildPlan.mechanics,
                scripts: studioProject.buildPlan.scripts
              }
            : null,
          lastEditedBy: studioProject.lastEditedBy?.username ?? null,
          writerStages: studioProject.writerStages.map((stage) => ({
            title: stage.title,
            status: stage.status
          }))
        }
      : null
  });

  await prisma.message.create({
    data: {
      threadId: thread.id,
      role: "user",
      content: text,
      metaJson: serializeMeta({
        source: "thread-stream",
        metadata
      })
    }
  });

  await prisma.chatThread.update({
    where: { id: thread.id },
    data: {
      title: inferThreadTitle(thread.title, text),
      updatedAt: new Date()
    }
  });

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let assistantBuffer = "";
      let finalized = false;

      const send = (event: unknown) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };

      const finalize = async (content: string, why?: unknown) => {
        if (finalized) return;
        finalized = true;

        await prisma.message.create({
          data: {
            threadId: thread.id,
            role: "assistant",
            content,
            metaJson: serializeMeta({
              source: "thread-stream",
              why: why ?? null
            })
          }
        });

        await prisma.chatThread.update({
          where: { id: thread.id },
          data: { updatedAt: new Date() }
        });
      };

      const coachProfile = getCatProfileConfig("coach");
      const closeSocket = streamChat({
        token: session.engineJwt,
        userId: resolveEngineUserId(session),
        wsBase: coachProfile.wsBase,
        payload: {
          text: prompt,
          metadata: {
            ...metadata,
            threadId: thread.id,
            personaId: thread.personaId ?? null
          }
        },
        onEvent: async (event) => {
          if (event.type === "token") {
            assistantBuffer += event.value;
            send(event);
            return;
          }

          if (event.type === "notification") {
            send(event);
            return;
          }

          if (event.type === "final") {
            const content = event.value || assistantBuffer;
            await finalize(content, event.why);
            send({ type: "final", value: content, why: event.why ?? undefined });
            controller.close();
            return;
          }

          if (event.type === "error") {
            const content = assistantBuffer.trim();
            if (content) {
              await finalize(content);
            }
            send(event);
            controller.close();
          }
        }
      });

      request.signal.addEventListener("abort", () => {
        closeSocket();
        controller.close();
      });
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive"
    }
  });
}
