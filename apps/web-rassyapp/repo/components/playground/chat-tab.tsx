"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import type { StudioTemplateSummary } from "@/lib/studio/types";
import type {
  WorkspaceSummary,
  WorkspaceFileEntry,
  WorkspacePresenceSummary,
  WorkspaceFileResponse,
  WorkspaceDiffResponse
} from "@/lib/workspace/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { MessageList, type ChatMessage } from "@/components/chat/message-list";
import { Composer } from "@/components/chat/composer";
import { streamChat } from "@/lib/client/stream";

const statusTone: Record<string, string> = {
  "In progress": "bg-glow-500/15 text-glow-300 border border-glow-500/30",
  "In review": "bg-ember-500/15 text-ember-300 border border-ember-500/30",
  Queued: "bg-ink-800 text-ink-300 border border-ink-700",
  Ready: "bg-ink-800 text-ink-300 border border-ink-700",
  "Not started": "bg-ink-800 text-ink-300 border border-ink-700",
  Paused: "bg-ink-800 text-ink-300 border border-ink-700",
  Running: "bg-glow-500/15 text-glow-300 border border-glow-500/30",
  Passed: "bg-glow-500/15 text-glow-300 border border-glow-500/30",
  Failed: "bg-ember-500/15 text-ember-300 border border-ember-500/30"
};

type JumpTab = "templates" | "worlds" | "assets" | "plugins" | "memory" | "status";

type PromotionMode = "skill" | "workflow" | "loop" | "writer-pack";

type PromotionResult = {
  draft?: {
    slug: string;
    name: string;
    description: string;
  };
  routine?: AgentRoutine;
  brief?: string;
  mode?: PromotionMode;
  routines?: AgentRoutine[];
  writerPack?: {
    title?: string;
    stageCount?: number;
  } | null;
  focus?: {
    threadTitle?: string;
    messageCount?: number;
  };
};

type AgentRoutineRun = {
  id: string;
  status: string;
  stageStatus?: string | null;
  trigger: string;
  outputText?: string | null;
  errorText?: string | null;
  handoff?: Record<string, unknown> | null;
  createdAt: string;
  startedAt: string;
  completedAt?: string | null;
};

type AgentRoutine = {
  id: string;
  kind: "skill" | "workflow" | "loop";
  stageKey?: string | null;
  agentKey?: string | null;
  dependsOnRoutineId?: string | null;
  status: "Active" | "Paused";
  triggerMode: "Manual" | "Scheduled";
  scheduleText?: string | null;
  name: string;
  description: string;
  draftSlug?: string | null;
  promptBrief: string;
  handoff?: Record<string, unknown> | null;
  projectSnapshot?: Record<string, unknown> | null;
  sourceThreadId?: string | null;
  sessionId?: string | null;
  lastRunAt?: string | null;
  nextRunAt?: string | null;
  recentRuns: AgentRoutineRun[];
};

type DiffLine = {
  type: "add" | "del" | "context";
  text: string;
};

type StoredMessage = {
  id: string;
  role: string;
  content: string;
  metaJson?: string | null;
};

type StoredThread = {
  id: string;
  title: string;
  messages?: StoredMessage[];
};

function promotionLabel(mode: PromotionMode) {
  if (mode === "skill") return "build kit";
  if (mode === "workflow") return "build recipe";
  if (mode === "writer-pack") return "writer room";
  return "coach loop";
}

function parseDiff(diff: string): DiffLine[] {
  if (!diff.trim()) {
    return [{ type: "context", text: "No changes detected for this file." }];
  }

  return diff
    .split("\n")
    .slice(0, 60)
    .map((line) => {
      if (line.startsWith("+++ ") || line.startsWith("--- ")) {
        return { type: "context", text: line };
      }
      if (line.startsWith("+")) return { type: "add", text: line };
      if (line.startsWith("-")) return { type: "del", text: line };
      return { type: "context", text: line };
    });
}

function normalizeRole(role: string): ChatMessage["role"] {
  if (role === "user" || role === "assistant") return role;
  return "system";
}

function parseMessageMeta(metaJson?: string | null): ChatMessage["meta"] | undefined {
  if (!metaJson) return undefined;
  try {
    const parsed = JSON.parse(metaJson) as { why?: Record<string, unknown> | null };
    if (parsed && typeof parsed === "object" && "why" in parsed) {
      return { why: parsed.why ?? null };
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function mapStoredMessages(messages: StoredMessage[]): ChatMessage[] {
  return messages.map((item) => ({
    id: item.id,
    role: normalizeRole(item.role),
    content: item.content,
    meta: parseMessageMeta(item.metaJson)
  }));
}

function buildStarterPrompts(
  activeFile: string | null,
  workspaceName: string,
  templateName?: string | null
) {
  return [
    `Turn ${workspaceName} into a kid-friendly ${templateName ?? "starter"} game pitch with a core loop, win condition, and first three build steps.`,
    activeFile
      ? `Explain how ${activeFile} could fit into a Roblox game build and what I should change first.`
      : "Give me three simple game ideas I can build with this studio today.",
    `Design a reusable build kit that helps kids add ${templateName === "Pet Quest" ? "pet chores, quest rewards, and friendly NPC hints" : "checkpoints, quests, and rewards"}.`,
    "Summarize what inspiration packs or reference uploads I should add next."
  ];
}

function buildTemplatePrompt(template: StudioTemplateSummary, workspaceName: string) {
  return `Use the ${template.name} starter for ${workspaceName}. ${template.starterPrompt} Then give me a one-line pitch, core loop, first three scenes, starter mechanics, and a parent-reviewed publish checklist.`;
}

export function ChatTab({
  summary,
  onRefreshSummary,
  onJumpToTab,
  queuedPrompt,
  onQueuedPromptHandled
}: {
  summary: WorkspaceSummary | null;
  onRefreshSummary?: () => void;
  onJumpToTab?: (tab: JumpTab) => void;
  queuedPrompt?: string | null;
  onQueuedPromptHandled?: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [promotionBusy, setPromotionBusy] = React.useState<PromotionMode | null>(null);
  const [promotionError, setPromotionError] = React.useState<string | null>(null);
  const [promotionResult, setPromotionResult] = React.useState<PromotionResult | null>(null);
  const [routineBusyId, setRoutineBusyId] = React.useState<string | null>(null);
  const [routineError, setRoutineError] = React.useState<string | null>(null);
  const [threadId, setThreadId] = React.useState<string | null>(null);
  const [threadLoading, setThreadLoading] = React.useState(false);

  const [files, setFiles] = React.useState<WorkspaceFileEntry[]>([]);
  const [openFiles, setOpenFiles] = React.useState<string[]>([]);
  const [activeFile, setActiveFile] = React.useState<string | null>(null);
  const [fileContent, setFileContent] = React.useState<string>("");
  const [fileTruncated, setFileTruncated] = React.useState(false);
  const [diffLines, setDiffLines] = React.useState<DiffLine[]>([]);
  const [runs, setRuns] = React.useState(summary?.runs ?? []);
  const [presence, setPresence] = React.useState<WorkspacePresenceSummary[]>([]);
  const [routines, setRoutines] = React.useState<AgentRoutine[]>([]);
  const queuedPromptRef = React.useRef<string | null>(null);

  const activeWorkspaceSessionTitle = React.useMemo(
    () =>
      summary?.sessions.find((item) => item.id === summary.activeSessionId)?.title ?? "Workspace",
    [summary?.activeSessionId, summary?.sessions]
  );
  const threadStorageKey = React.useMemo(
    () => (summary?.activeSessionId ? `console-thread-${summary.activeSessionId}` : null),
    [summary?.activeSessionId]
  );

  React.useEffect(() => {
    if (!summary) return;
    setOpenFiles(summary.openFiles ?? []);
    setActiveFile(summary.activeFile ?? summary.openFiles?.[0] ?? null);
    setRuns(summary.runs ?? []);
  }, [summary]);

  const loadRoutines = React.useCallback(async () => {
    const workspaceId = summary?.workspace.id;
    const suffix = workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : "";
    const res = await fetch(`/api/agent-routines${suffix}`);
    if (!res.ok) return;
    const data = (await res.json()) as { routines?: AgentRoutine[] };
    setRoutines(data.routines ?? []);
  }, [summary?.workspace.id]);

  React.useEffect(() => {
    loadRoutines();
  }, [loadRoutines]);

  React.useEffect(() => {
    let active = true;

    const loadFiles = async () => {
      const res = await fetch("/api/workspace/files");
      if (!res.ok) return;
      const data = (await res.json()) as { entries: WorkspaceFileEntry[] };
      if (active) {
        setFiles(data.entries);
      }
    };

    loadFiles();
    return () => {
      active = false;
    };
  }, []);

  React.useEffect(() => {
    if (!activeFile) return;
    let active = true;

    setFileContent("");
    setFileTruncated(false);
    setDiffLines([]);

    const loadFile = async () => {
      const [fileRes, diffRes] = await Promise.all([
        fetch(`/api/workspace/file?path=${encodeURIComponent(activeFile)}`),
        fetch(`/api/workspace/diff?path=${encodeURIComponent(activeFile)}`)
      ]);

      if (!fileRes.ok) return;
      const fileData = (await fileRes.json()) as WorkspaceFileResponse;
      if (active) {
        setFileContent(fileData.content);
        setFileTruncated(fileData.truncated);
      }

      if (diffRes.ok) {
        const diffData = (await diffRes.json()) as WorkspaceDiffResponse;
        if (active) {
          setDiffLines(parseDiff(diffData.diff));
        }
      }
    };

    loadFile();
    return () => {
      active = false;
    };
  }, [activeFile]);

  React.useEffect(() => {
    if (!summary) return;
    let active = true;
    let timer: NodeJS.Timeout | null = null;

    const refreshPresence = async () => {
      await fetch("/api/workspace/presence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "Editing" })
      });
      const res = await fetch("/api/workspace/presence");
      if (!res.ok) return;
      const data = (await res.json()) as { presences: WorkspacePresenceSummary[] };
      if (active) {
        setPresence(data.presences ?? []);
      }
    };

    refreshPresence();
    timer = setInterval(refreshPresence, 10_000);

    return () => {
      active = false;
      if (timer) clearInterval(timer);
    };
  }, [summary]);

  const loadThread = React.useCallback(async (id: string) => {
    const response = await fetch(`/api/threads/${encodeURIComponent(id)}`);
    if (!response.ok) {
      throw new Error("Unable to load thread");
    }

    const data = (await response.json()) as { thread?: StoredThread };
    if (!data.thread?.id) {
      throw new Error("Thread not found");
    }

    setThreadId(data.thread.id);
    setMessages(mapStoredMessages(data.thread.messages ?? []));
    return data.thread.id;
  }, []);

  const createThread = React.useCallback(async () => {
    const response = await fetch("/api/threads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: `${activeWorkspaceSessionTitle} Chat`
      })
    });

    if (!response.ok) {
      throw new Error("Unable to create thread");
    }

    const data = (await response.json()) as { thread?: StoredThread };
    if (!data.thread?.id) {
      throw new Error("Thread creation failed");
    }

    setThreadId(data.thread.id);
    setMessages([]);
    return data.thread.id;
  }, [activeWorkspaceSessionTitle]);

  React.useEffect(() => {
    if (!threadStorageKey) return;
    let active = true;

    const ensureThread = async () => {
      setThreadLoading(true);
      setError(null);

      try {
        const saved = window.localStorage.getItem(threadStorageKey);
        if (saved) {
          try {
            await loadThread(saved);
            return;
          } catch {
            window.localStorage.removeItem(threadStorageKey);
          }
        }

        const createdId = await createThread();
        window.localStorage.setItem(threadStorageKey, createdId);
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : "Unable to initialize thread");
        }
      } finally {
        if (active) {
          setThreadLoading(false);
        }
      }
    };

    ensureThread();
    return () => {
      active = false;
    };
  }, [createThread, loadThread, threadStorageKey]);

  const resetChat = React.useCallback(async () => {
    setError(null);

    if (!threadStorageKey) {
      setMessages([]);
      return;
    }

    setThreadLoading(true);
    try {
      if (threadId) {
        await fetch(`/api/threads/${encodeURIComponent(threadId)}`, {
          method: "DELETE"
        });
      }
      const createdId = await createThread();
      window.localStorage.setItem(threadStorageKey, createdId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to reset chat");
    } finally {
      setThreadLoading(false);
    }
  }, [createThread, threadId, threadStorageKey]);

  const persistSessionState = React.useCallback(
    async (nextOpenFiles: string[], nextActiveFile: string | null) => {
      if (!summary) return;
      await fetch("/api/workspace/session", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: summary.activeSessionId,
          openFiles: nextOpenFiles,
          activeFile: nextActiveFile ?? undefined
        })
      });
      onRefreshSummary?.();
    },
    [onRefreshSummary, summary]
  );

  const handleOpenFile = React.useCallback(
    async (path: string) => {
      const nextOpenFiles = openFiles.includes(path) ? openFiles : [path, ...openFiles].slice(0, 5);
      setOpenFiles(nextOpenFiles);
      setActiveFile(path);
      await persistSessionState(nextOpenFiles, path);
    },
    [openFiles, persistSessionState]
  );

  const sendMessage = React.useCallback(
    async (text: string) => {
      if (busy || threadLoading) return;
      if (!threadId) {
        setError("Chat thread is not ready");
        return;
      }

      setError(null);
      setBusy(true);

      const userMessage: ChatMessage = { role: "user", content: text };
      const assistantMessage: ChatMessage = { role: "assistant", content: "" };
      let assistantIndex = 0;

      setMessages((prev) => {
        assistantIndex = prev.length + 1;
        return [...prev, userMessage, assistantMessage];
      });

      const controller = new AbortController();

      try {
        const metadata = summary
          ? {
              workspaceId: summary.workspace.id,
              sessionId: summary.activeSessionId,
              sessionTitle: activeWorkspaceSessionTitle,
              activeFile,
              openFiles,
              branch: summary.workspace.branch,
              role: summary.member.role,
              studioProjectId: summary.studioProject?.id,
              projectTitle: summary.studioProject?.title,
              templateName: summary.studioProject?.templatePack?.name,
              templateSlug: summary.studioProject?.templatePack?.slug,
              theme: summary.studioProject?.theme,
              projectTheme: summary.studioProject?.theme,
              heroGoal: summary.studioProject?.heroGoal,
              worldProfileTitle: summary.studioProject?.worldProfile?.title,
              mapPatternTitle: summary.studioProject?.mapPattern?.title,
              worldRecipeHeadline: summary.studioProject?.worldRecipe?.headline,
              worldRecipeLines: summary.studioProject?.worldRecipe?.promptLines ?? [],
              worldCrewLines: summary.studioProject?.worldRecipe?.crewLines ?? [],
              selectedAssetPackSlugs: summary.studioProject?.selectedAssetPackSlugs ?? [],
              selectedAssetPackTitles:
                summary.studioProject?.selectedAssetPacks.map((pack) => pack.title) ?? [],
              selectedAssetItemTitles:
                summary.studioProject?.selectedAssetItems.map((item) => item.title) ?? [],
              selectedAssetManifestLines:
                summary.studioProject?.selectedAssetItems
                  .slice(0, 8)
                  .map(
                    (item) =>
                      `${item.title} -> ${item.targetPath} (${item.kind}; ${item.localBundleKey})`
                  ) ?? [],
              approvedCodePackageTitles:
                summary.studioProject?.approvedCodePackages.map((pkg) => pkg.title) ?? [],
              approvedCodePackageLines:
                summary.studioProject?.approvedCodePackages
                  .slice(0, 4)
                  .map(
                    (pkg) =>
                      `${pkg.title} -> ${pkg.targetContainer} (${pkg.localModulePath})`
                  ) ?? [],
              lastEditedBy: summary.studioProject?.lastEditedBy?.username ?? null,
              buildPlan: summary.studioProject?.buildPlan
                ? {
                    oneLiner: summary.studioProject.buildPlan.oneLiner,
                    coreLoop: summary.studioProject.buildPlan.coreLoop,
                    scenes: summary.studioProject.buildPlan.scenes.slice(0, 4),
                    mechanics: summary.studioProject.buildPlan.mechanics.slice(0, 4),
                    scripts: summary.studioProject.buildPlan.scripts.slice(0, 4)
                  }
                : null
            }
          : undefined;

        const streamPath = `/api/threads/${encodeURIComponent(threadId)}/stream`;

        await streamChat(
          { text, metadata, historyLimit: 12 },
          (event) => {
            if (event.type === "token") {
              setMessages((prev) => {
                const next = [...prev];
                const current = next[assistantIndex];
                if (current) {
                  next[assistantIndex] = {
                    ...current,
                    content: current.content + event.value
                  };
                }
                return next;
              });
            }
            if (event.type === "final") {
              setMessages((prev) => {
                const next = [...prev];
                const current = next[assistantIndex];
                if (current) {
                  next[assistantIndex] = {
                    ...current,
                    content: event.value || current.content,
                    meta: { why: event.why ?? null }
                  };
                }
                return next;
              });
            }
            if (event.type === "notification") {
              setMessages((prev) => [...prev, { role: "system", content: event.message }]);
            }
            if (event.type === "error") {
              setError(event.message);
            }
          },
          controller.signal,
          streamPath
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "Stream failed");
      } finally {
        setBusy(false);
      }
    },
    [activeFile, busy, openFiles, summary, threadId, threadLoading]
  );

  const workspaceName = summary?.studioProject?.title ?? summary?.workspace.name ?? "Launchpad Project";
  const branchLabel = summary?.workspace.branch ?? "creative";
  const collaboratorCount = summary?.workspace.collaboratorCount ?? 0;
  const studioProject = summary?.studioProject ?? null;
  const selectedShelfCount = studioProject?.selectedAssetPackSlugs.length ?? 0;
  const templateCards = studioProject?.availableTemplates?.slice(0, 4) ?? [];
  const currentTemplateSlug = studioProject?.templatePack?.slug ?? null;
  const coachNextActions = studioProject?.nextActions ?? [];
  const connectionStatus = studioProject?.connectionStatus ?? "Guest";
  const publishReadiness = studioProject?.publishReadiness ?? "Planning";
  const threadReady = Boolean(threadId) && !threadLoading;
  const activeSession =
    summary?.sessions.find((session) => session.id === summary?.activeSessionId) ??
    summary?.sessions[0];
  const diffDisplay =
    diffLines.length > 0
      ? diffLines
      : [
          {
            type: "context" as const,
            text: activeFile ? "Loading diff..." : "Select a file to preview diff."
          }
        ];
  const filePreview = fileContent
    ? fileContent.split("\n").slice(0, 40)
    : ["Select a file to preview its current working context."];
  const starterPrompts = buildStarterPrompts(
    activeFile,
    workspaceName,
    studioProject?.templatePack?.name
  );
  const latestUserMessage = React.useMemo(
    () => [...messages].reverse().find((message) => message.role === "user") ?? null,
    [messages]
  );
  const latestUserMessageIndex = React.useMemo(() => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      if (messages[index]?.role === "user") {
        return index;
      }
    }
    return -1;
  }, [messages]);

  const openDraftInForge = React.useCallback(
    (slug: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", "plugins");
      params.set("draft", slug);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  const promoteThread = React.useCallback(
    async (mode: PromotionMode, source: "last-user" | "thread" = "last-user") => {
      if (!threadId || busy || threadLoading) return;
      setPromotionBusy(mode);
      setPromotionError(null);

      const response = await fetch(`/api/threads/${encodeURIComponent(threadId)}/promote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          source,
          workspaceContext: {
            workspaceName,
            ...(summary?.workspace.id ? { workspaceId: summary.workspace.id } : {}),
            branch: branchLabel,
            activeFile,
            openFiles,
            ...(summary?.activeSessionId ? { sessionId: summary.activeSessionId } : {}),
            ...(activeSession?.title ? { sessionTitle: activeSession.title } : {}),
            ...(summary?.studioProject?.id ? { studioProjectId: summary.studioProject.id } : {}),
            ...(summary?.studioProject?.title ? { projectTitle: summary.studioProject.title } : {}),
            ...(summary?.studioProject?.templatePack?.name
              ? { templateName: summary.studioProject.templatePack.name }
              : {}),
            ...(summary?.studioProject?.templatePack?.slug
              ? { templateSlug: summary.studioProject.templatePack.slug }
              : {}),
            ...(summary?.studioProject?.theme ? { projectTheme: summary.studioProject.theme } : {}),
            ...(summary?.studioProject?.heroGoal ? { heroGoal: summary.studioProject.heroGoal } : {}),
            ...(summary?.studioProject?.worldProfile?.title
              ? { worldProfileTitle: summary.studioProject.worldProfile.title }
              : {}),
            ...(summary?.studioProject?.mapPattern?.title
              ? { mapPatternTitle: summary.studioProject.mapPattern.title }
              : {}),
            ...(summary?.studioProject?.worldRecipe?.headline
              ? { worldRecipeHeadline: summary.studioProject.worldRecipe.headline }
              : {}),
            worldRecipeLines: summary?.studioProject?.worldRecipe?.promptLines ?? [],
            worldCrewLines: summary?.studioProject?.worldRecipe?.crewLines ?? [],
            selectedAssetPackSlugs: summary?.studioProject?.selectedAssetPackSlugs ?? [],
            selectedAssetPackTitles:
              summary?.studioProject?.selectedAssetPacks.map((pack) => pack.title) ?? [],
            selectedAssetItemTitles:
              summary?.studioProject?.selectedAssetItems.map((item) => item.title) ?? [],
            selectedAssetManifestLines:
              summary?.studioProject?.selectedAssetItems
                .slice(0, 8)
                .map(
                  (item) =>
                    `${item.title} -> ${item.targetPath} (${item.kind}; ${item.localBundleKey})`
                ) ?? [],
            approvedCodePackageTitles:
              summary?.studioProject?.approvedCodePackages.map((pkg) => pkg.title) ?? [],
            approvedCodePackageLines:
              summary?.studioProject?.approvedCodePackages
                .slice(0, 4)
                .map((pkg) => `${pkg.title} -> ${pkg.targetContainer} (${pkg.localModulePath})`) ?? [],
            ...(summary?.studioProject?.buildPlan?.oneLiner
              ? { buildPlanOneLiner: summary.studioProject.buildPlan.oneLiner }
              : {}),
            ...(summary?.studioProject?.buildPlan?.coreLoop
              ? { buildPlanCoreLoop: summary.studioProject.buildPlan.coreLoop }
              : {}),
            buildPlanScenes: summary?.studioProject?.buildPlan?.scenes ?? [],
            buildPlanMechanics: summary?.studioProject?.buildPlan?.mechanics ?? [],
            buildPlanScripts: summary?.studioProject?.buildPlan?.scripts ?? [],
            collaboratorCount: summary?.workspace.collaboratorCount ?? 1
          }
        })
      }).catch(() => null);

      setPromotionBusy(null);
      if (!response) {
        setPromotionError("Promotion request failed");
        return;
      }
      if (!response.ok) {
        const text = await response.text().catch(() => "");
        setPromotionError(text || "Unable to promote thread");
        return;
      }

      const result = (await response.json()) as PromotionResult;
      setPromotionResult(result);
      await loadRoutines();
      onRefreshSummary?.();
      setMessages((prev) => [
        ...prev,
        {
          role: "system",
          content:
            mode === "writer-pack"
              ? `Drafted writer room "${result.writerPack?.title ?? result.draft?.name ?? "Untitled"}" with ${result.writerPack?.stageCount ?? result.routines?.length ?? 0} linked world-building and game-writing routines.`
              : result.routine
                ? `Drafted ${promotionLabel(mode)} "${result.draft?.name ?? "Untitled"}" and created persistent routine "${result.routine.name}".`
                : `Drafted ${promotionLabel(mode)} "${result.draft?.name ?? "Untitled"}". Open the build kit lab to review, test, and deploy it.`
        }
      ]);
    },
    [
      activeFile,
      activeSession?.title,
      branchLabel,
      busy,
      loadRoutines,
      onRefreshSummary,
      openFiles,
      summary?.activeSessionId,
      summary?.workspace.id,
      threadId,
      threadLoading,
      workspaceName
    ]
  );

  const setRoutineStatus = React.useCallback(
    async (routineId: string, status: "Active" | "Paused") => {
      setRoutineBusyId(routineId);
      setRoutineError(null);
      const res = await fetch(`/api/agent-routines/${encodeURIComponent(routineId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status })
      }).catch(() => null);
      setRoutineBusyId(null);
      if (!res || !res.ok) {
        setRoutineError("Unable to update routine state");
        return;
      }
      await loadRoutines();
    },
    [loadRoutines]
  );

  const runRoutineNow = React.useCallback(
    async (routineId: string) => {
      setRoutineBusyId(routineId);
      setRoutineError(null);
      const res = await fetch(`/api/agent-routines/${encodeURIComponent(routineId)}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trigger: "manual" })
      }).catch(() => null);
      setRoutineBusyId(null);
      if (!res) {
        setRoutineError("Routine run failed");
        return;
      }
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        setRoutineError(text || "Routine run failed");
        return;
      }

      const data = (await res.json()) as {
        run?: { outputPreview?: string; status?: string };
      };
      await loadRoutines();
      onRefreshSummary?.();
      setMessages((prev) => [
        ...prev,
        {
          role: "system",
          content: data.run?.outputPreview
            ? `Routine finished: ${data.run.outputPreview}`
            : "Routine run completed."
        }
      ]);
    },
    [loadRoutines, onRefreshSummary]
  );

  const runQuickPrompt = async (prompt: string) => {
    if (!threadReady || busy) return;
    await sendMessage(prompt);
  };

  React.useEffect(() => {
    if (!queuedPrompt) {
      queuedPromptRef.current = null;
      return;
    }

    if (!threadReady || busy) {
      return;
    }

    if (queuedPromptRef.current === queuedPrompt) {
      return;
    }

    queuedPromptRef.current = queuedPrompt;
    void sendMessage(queuedPrompt).finally(() => {
      onQueuedPromptHandled?.();
    });
  }, [busy, onQueuedPromptHandled, queuedPrompt, sendMessage, threadReady]);

  return (
    <div className="space-y-4">
      <Card className="intro-rise p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.3em] text-ink-400">
              Game Coach
            </div>
            <h2 className="mt-2 text-2xl font-semibold text-ink-50">
              Keep the idea in front and pull tools in only when they help.
            </h2>
            <p className="mt-2 max-w-3xl text-sm text-ink-300">
              This lane ties the current project, files, run state, and family team presence
              directly to your coach thread so the Cat can act like a guided studio helper, not
              just a chatbot.
            </p>
          </div>

          <div className="flex flex-wrap gap-2 text-xs">
            <Badge variant="neutral">{workspaceName}</Badge>
            <Badge variant="neutral">Session {activeSession?.title ?? "Pending"}</Badge>
            <Badge variant={threadReady ? "glow" : "ember"}>
              Thread {threadReady ? "Ready" : "Starting"}
            </Badge>
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-7">
          <button
            onClick={() =>
              runQuickPrompt(
                `Pitch a kid-friendly game for ${workspaceName} with a simple core loop, a fun theme, and first build steps.`
              )
            }
            className="rounded-2xl border border-ink-800 bg-ink-950/70 p-4 text-left transition hover:border-glow-500/40"
          >
            <div className="text-[10px] uppercase tracking-[0.24em] text-glow-300">Ask</div>
            <div className="mt-2 text-sm font-semibold text-ink-100">Pitch a new game</div>
            <div className="mt-2 text-xs text-ink-300">Get a genre, loop, and first build plan.</div>
          </button>
          <button
            onClick={() => onJumpToTab?.("templates")}
            className="rounded-2xl border border-ink-800 bg-ink-950/70 p-4 text-left transition hover:border-glow-500/40"
          >
            <div className="text-[10px] uppercase tracking-[0.24em] text-glow-300">Templates</div>
            <div className="mt-2 text-sm font-semibold text-ink-100">Pick a starter</div>
            <div className="mt-2 text-xs text-ink-300">Choose the game feeling, theme, and goal first.</div>
          </button>
          <button
            onClick={() => onJumpToTab?.("worlds")}
            className="rounded-2xl border border-ink-800 bg-ink-950/70 p-4 text-left transition hover:border-glow-500/40"
          >
            <div className="text-[10px] uppercase tracking-[0.24em] text-glow-300">Map Forge</div>
            <div className="mt-2 text-sm font-semibold text-ink-100">Shape the world</div>
            <div className="mt-2 text-xs text-ink-300">Pick the biome, route shape, and world crew recipe.</div>
          </button>
          <button
            onClick={() => onJumpToTab?.("assets")}
            className="rounded-2xl border border-ink-800 bg-ink-950/70 p-4 text-left transition hover:border-glow-500/40"
          >
            <div className="text-[10px] uppercase tracking-[0.24em] text-glow-300">Asset Shelf</div>
            <div className="mt-2 text-sm font-semibold text-ink-100">Open safe shelves</div>
            <div className="mt-2 text-xs text-ink-300">Decorate with approved art, props, and sounds.</div>
          </button>
          <button
            onClick={() => onJumpToTab?.("memory")}
            className="rounded-2xl border border-ink-800 bg-ink-950/70 p-4 text-left transition hover:border-glow-500/40"
          >
            <div className="text-[10px] uppercase tracking-[0.24em] text-glow-300">Remix</div>
            <div className="mt-2 text-sm font-semibold text-ink-100">Open idea vault</div>
            <div className="mt-2 text-xs text-ink-300">Reuse notes, phrases, and project memory.</div>
          </button>
          <button
            onClick={() => onJumpToTab?.("plugins")}
            className="rounded-2xl border border-ink-800 bg-ink-950/70 p-4 text-left transition hover:border-glow-500/40"
          >
            <div className="text-[10px] uppercase tracking-[0.24em] text-glow-300">Build Kits</div>
            <div className="mt-2 text-sm font-semibold text-ink-100">Open kit lab</div>
            <div className="mt-2 text-xs text-ink-300">Create reusable helpers for quests, NPCs, and mechanics.</div>
          </button>
          <button
            onClick={() => onJumpToTab?.("status")}
            className="rounded-2xl border border-ink-800 bg-ink-950/70 p-4 text-left transition hover:border-glow-500/40"
          >
            <div className="text-[10px] uppercase tracking-[0.24em] text-glow-300">Publish</div>
            <div className="mt-2 text-sm font-semibold text-ink-100">Check studio pulse</div>
            <div className="mt-2 text-xs text-ink-300">Inspect engine health and the future publish path.</div>
          </button>
        </div>

        {templateCards.length ? (
          <div className="mt-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-[0.3em] text-ink-400">Template sparks</div>
                <div className="mt-2 text-lg font-semibold text-ink-50">
                  Start from a kid-friendly game pattern instead of a blank page
                </div>
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                <Badge variant="neutral">Connection {connectionStatus}</Badge>
                <Badge variant="neutral">Publish {publishReadiness}</Badge>
              </div>
            </div>

            <div className="mt-4 grid gap-3 xl:grid-cols-4">
              {templateCards.map((template) => (
                <button
                  key={template.slug}
                  type="button"
                  onClick={() => runQuickPrompt(buildTemplatePrompt(template, workspaceName))}
                  className="rounded-3xl border border-ink-800 bg-ink-950/70 p-4 text-left transition hover:border-glow-500/40"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm font-semibold text-ink-100">{template.name}</div>
                    {template.slug === currentTemplateSlug ? (
                      <Badge variant="glow">Current</Badge>
                    ) : null}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.16em] text-ink-500">
                    <span>{template.genre}</span>
                    <span>{template.ageBand}</span>
                    <span>{template.difficulty}</span>
                  </div>
                  <div className="mt-3 text-sm text-ink-300">{template.summary}</div>
                  <div className="mt-4 text-[10px] uppercase tracking-[0.22em] text-glow-300">
                    Starter mechanics
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {template.primaryMechanics.slice(0, 3).map((mechanic) => (
                      <span
                        key={mechanic}
                        className="rounded-full border border-ink-700 bg-ink-900/80 px-2 py-1 text-[11px] text-ink-300"
                      >
                        {mechanic}
                      </span>
                    ))}
                  </div>
                  <div className="mt-4 text-xs font-medium text-ink-200">Launch this starter with the coach</div>
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </Card>

      <div className="grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)_300px]">
        <div className="space-y-4">
          <Card className="p-5">
            <div className="text-xs uppercase tracking-[0.3em] text-ink-400">Current context</div>
            <div className="mt-4 grid gap-2">
              <div className="rounded-2xl border border-ink-800 bg-ink-950/70 px-3 py-3">
                <div className="text-[10px] uppercase tracking-[0.22em] text-ink-500">Project</div>
                <div className="mt-1 text-sm font-semibold text-ink-100">{workspaceName}</div>
                <div className="mt-1 text-xs text-ink-400">
                  Track {branchLabel} · {collaboratorCount} co-builders
                </div>
              </div>
              <div className="rounded-2xl border border-ink-800 bg-ink-950/70 px-3 py-3">
                <div className="text-[10px] uppercase tracking-[0.22em] text-ink-500">Build lane</div>
                <div className="mt-1 text-sm font-semibold text-ink-100">
                  {activeSession?.title ?? "Pending"}
                </div>
                <div className="mt-1 text-xs text-ink-400">
                  Thread {threadId ? threadId.slice(0, 8) : "initializing"}
                </div>
              </div>
              <div className="rounded-2xl border border-ink-800 bg-ink-950/70 px-3 py-3">
                <div className="text-[10px] uppercase tracking-[0.22em] text-ink-500">Active file</div>
                <div className="mt-1 text-sm font-semibold text-ink-100">
                  {activeFile ?? "No file selected"}
                </div>
                {fileTruncated ? (
                  <div className="mt-1 text-[11px] text-ink-400">Preview truncated for speed.</div>
                ) : null}
              </div>
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-[0.3em] text-ink-400">Guide rails</div>
                <div className="mt-2 text-lg font-semibold text-ink-50">Kid-safe studio checklist</div>
              </div>
              <Badge variant={studioProject?.parentModeEnabled ? "glow" : "neutral"}>
                Parent mode {studioProject?.parentModeEnabled ? "On" : "Off"}
              </Badge>
            </div>

            <div className="mt-4 space-y-2">
              {coachNextActions.length ? (
                coachNextActions.map((action) => (
                  <div
                    key={action}
                    className="rounded-2xl border border-ink-800 bg-ink-950/70 px-3 py-3 text-sm text-ink-300"
                  >
                    {action}
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-ink-800 bg-ink-950/70 px-3 py-3 text-sm text-ink-400">
                  Launchpad will add next-step guidance as the project scaffold fills in.
                </div>
              )}
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs uppercase tracking-[0.3em] text-ink-400">Project files</div>
              <div className="text-xs text-ink-500">{files.length}</div>
            </div>
            <div className="mt-4 max-h-[280px] space-y-1 overflow-y-auto pr-1 text-xs text-ink-300">
              {files.length ? (
                files.map((file) => (
                  <button
                    key={file.path}
                    onClick={() => (file.type === "file" ? handleOpenFile(file.path) : null)}
                    disabled={file.type !== "file"}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left transition",
                      file.path === activeFile
                        ? "bg-ink-800 text-ink-50"
                        : "hover:bg-ink-900/80"
                    )}
                    style={{ paddingLeft: `${file.depth * 12 + 8}px` }}
                  >
                    <span className="text-[10px] text-ink-500">
                      {file.type === "folder" ? "▸" : "•"}
                    </span>
                    <span className="truncate">{file.path.split("/").pop()}</span>
                  </button>
                ))
              ) : (
                <div className="rounded-xl border border-ink-800 bg-ink-950/60 p-3 text-ink-400">
                  Loading file tree...
                </div>
              )}
            </div>
          </Card>

          <Card className="p-5">
            <div className="text-xs uppercase tracking-[0.3em] text-ink-400">Live preview</div>
            <pre className="mt-4 max-h-[280px] overflow-y-auto whitespace-pre-wrap rounded-2xl border border-ink-800 bg-ink-950/70 p-4 font-mono text-[11px] text-ink-200">
              {filePreview.map((line, index) => `${String(index + 1).padStart(2, "0")} ${line}`).join("\n")}
            </pre>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-[0.3em] text-ink-400">
                  Coach conversation
                </div>
                <div className="mt-2 text-xl font-semibold text-ink-50">Live build thread</div>
                <div className="mt-1 text-sm text-ink-300">
                  Ask for game pitches, scene plans, reusable build kits, inspiration help, or publish-readiness advice.
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={resetChat} disabled={busy || threadLoading}>
                Clear thread
              </Button>
            </div>

            <div className="mt-4 max-h-[540px] overflow-y-auto pr-2">
              {messages.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-ink-700 bg-ink-950/60 p-8 text-center">
                  <div className="text-sm font-semibold text-ink-100">
                    {threadLoading ? "Initializing your coach thread..." : "Tell Launchpad what you want to build."}
                  </div>
                  <div className="mt-2 text-sm text-ink-400">
                    The coach already knows your current project, active files, track, and session
                    context.
                  </div>
                </div>
              ) : (
                <MessageList
                  messages={messages}
                  renderActions={(message, index) => {
                    if (message.role !== "user" || index !== latestUserMessageIndex) {
                      return null;
                    }

                    return (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => promoteThread("skill")}
                          className="rounded-full border border-ink-600 bg-ink-950/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-200 transition hover:border-glow-500/40 hover:text-ink-50"
                          disabled={Boolean(promotionBusy)}
                        >
                          Turn into build kit
                        </button>
                        <button
                          type="button"
                          onClick={() => promoteThread("workflow")}
                          className="rounded-full border border-ink-600 bg-ink-950/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-200 transition hover:border-glow-500/40 hover:text-ink-50"
                          disabled={Boolean(promotionBusy)}
                        >
                          Draft build recipe
                        </button>
                        <button
                          type="button"
                          onClick={() => promoteThread("loop")}
                          className="rounded-full border border-ink-600 bg-ink-950/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-200 transition hover:border-glow-500/40 hover:text-ink-50"
                          disabled={Boolean(promotionBusy)}
                        >
                          Coach loop
                        </button>
                      </div>
                    );
                  }}
                />
              )}
            </div>

            {error ? (
              <div className="mt-4 rounded-2xl border border-ember-500/40 bg-ember-500/10 px-4 py-3 text-sm text-ember-300">
                {error}
              </div>
            ) : null}
            {promotionError ? (
              <div className="mt-4 rounded-2xl border border-ember-500/40 bg-ember-500/10 px-4 py-3 text-sm text-ember-300">
                {promotionError}
              </div>
            ) : null}
          </Card>

          <Composer
            onSend={sendMessage}
            disabled={busy || threadLoading || !threadId}
            placeholder="Describe the game, mechanic, scene, or question you want Launchpad to help with."
            mode="Coach"
            contextHint={`${workspaceName} · ${openFiles.length} project files · ${activeFile ? activeFile.split("/").pop() : "no active file"} · ${selectedShelfCount} saved shelves · Roblox starter context attached`}
            suggestions={starterPrompts}
          />
        </div>

        <div className="space-y-4">
          <Card className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-[0.3em] text-ink-400">Build Kit Runner</div>
                <div className="mt-2 text-lg font-semibold text-ink-50">
                  Promote a live thread into reusable studio powers
                </div>
                <div className="mt-2 text-sm text-ink-300">
                  Use the conversation itself as the brief, then turn it into a build kit, a recurring recipe, or a linked writer room that builds the world in visible passes.
                </div>
              </div>
              <Badge variant={latestUserMessage ? "glow" : "neutral"}>
                {latestUserMessage ? "Ready" : "Need a prompt"}
              </Badge>
            </div>

            <div className="mt-4 space-y-2">
              <button
                onClick={() => promoteThread("skill")}
                disabled={!latestUserMessage || Boolean(promotionBusy)}
                className="w-full rounded-2xl border border-ink-800 bg-ink-950/70 px-3 py-3 text-left transition hover:border-glow-500/40 disabled:opacity-50"
              >
                <div className="text-sm font-semibold text-ink-100">Promote latest request</div>
                <div className="mt-1 text-xs text-ink-300">
                  Turn the newest idea into a focused build kit draft.
                </div>
              </button>
              <button
                onClick={() => promoteThread("workflow")}
                disabled={!latestUserMessage || Boolean(promotionBusy)}
                className="w-full rounded-2xl border border-ink-800 bg-ink-950/70 px-3 py-3 text-left transition hover:border-glow-500/40 disabled:opacity-50"
              >
                <div className="text-sm font-semibold text-ink-100">Draft recurring build recipe</div>
                <div className="mt-1 text-xs text-ink-300">
                  Convert the latest exchange into a multi-step studio recipe.
                </div>
              </button>
              <button
                onClick={() => promoteThread("writer-pack", "thread")}
                disabled={!messages.length || Boolean(promotionBusy)}
                className="w-full rounded-2xl border border-ink-800 bg-ink-950/70 px-3 py-3 text-left transition hover:border-glow-500/40 disabled:opacity-50"
              >
                <div className="text-sm font-semibold text-ink-100">Draft world-building writer room</div>
                <div className="mt-1 text-xs text-ink-300">
                  Create linked agents for pitch, terrain, landmarks, scenery, quests, scripts, and playtests.
                </div>
              </button>
              <button
                onClick={() => promoteThread("loop", "thread")}
                disabled={!messages.length || Boolean(promotionBusy)}
                className="w-full rounded-2xl border border-ink-800 bg-ink-950/70 px-3 py-3 text-left transition hover:border-glow-500/40 disabled:opacity-50"
              >
                <div className="text-sm font-semibold text-ink-100">Draft coach loop from thread</div>
                <div className="mt-1 text-xs text-ink-300">
                  Use the broader thread context to generate a reusable loop with safe checkpoints.
                </div>
              </button>
            </div>

            {promotionBusy ? (
              <div className="mt-4 rounded-2xl border border-glow-500/30 bg-glow-500/10 px-4 py-3 text-sm text-glow-200">
                Building a {promotionLabel(promotionBusy)} draft from this conversation...
              </div>
            ) : null}

            {promotionResult?.draft ? (
              <div className="mt-4 rounded-2xl border border-ink-800 bg-ink-950/70 p-4">
                <div className="text-[10px] uppercase tracking-[0.22em] text-glow-300">
                  Draft ready
                </div>
                <div className="mt-2 text-sm font-semibold text-ink-100">
                  {promotionResult.draft.name}
                </div>
                <div className="mt-2 text-xs text-ink-300">
                  {promotionResult.draft.description}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    variant="glow"
                    size="sm"
                    onClick={() => openDraftInForge(promotionResult.draft?.slug ?? "")}
                    disabled={!promotionResult.draft.slug}
                  >
                    Open in lab
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => promoteThread("skill", "thread")}
                    disabled={Boolean(promotionBusy)}
                  >
                    Rebuild with thread
                  </Button>
                </div>
                {promotionResult.routine ? (
                  <div className="mt-3 rounded-2xl border border-glow-500/20 bg-glow-500/10 px-3 py-3 text-xs text-glow-100">
                    {promotionResult.writerPack
                      ? `${promotionResult.writerPack.stageCount ?? promotionResult.routines?.length ?? 0} linked routines created for the writer room.`
                      : `Persistent routine created: ${promotionResult.routine.name}`}
                  </div>
                ) : null}
              </div>
            ) : null}
          </Card>

          <Card className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-[0.3em] text-ink-400">Automation roster</div>
                <div className="mt-2 text-lg font-semibold text-ink-50">
                  Persistent routines tied to this project
                </div>
                <div className="mt-2 text-sm text-ink-300">
                  Workflow, loop, and writer-room promotions land here as durable routines you can pause, resume, and run on demand.
                </div>
              </div>
              <Badge variant={routines.length ? "glow" : "neutral"}>
                {routines.length ? `${routines.length} loaded` : "Empty"}
              </Badge>
            </div>

            {routineError ? (
              <div className="mt-4 rounded-2xl border border-ember-500/40 bg-ember-500/10 px-4 py-3 text-sm text-ember-300">
                {routineError}
              </div>
            ) : null}

            <div className="mt-4 space-y-3">
              {routines.length ? (
                routines.map((routine) => {
                  const latestRun = routine.recentRuns[0];
                  return (
                    <div
                      key={routine.id}
                      className="rounded-3xl border border-ink-800 bg-ink-950/70 p-4"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={routine.kind === "loop" ? "ember" : "neutral"}>
                          {routine.kind}
                        </Badge>
                        {routine.stageKey ? <Badge variant="neutral">{routine.stageKey}</Badge> : null}
                        <Badge variant={routine.status === "Active" ? "glow" : "neutral"}>
                          {routine.status}
                        </Badge>
                        <Badge variant="neutral">{routine.triggerMode}</Badge>
                      </div>

                      <div className="mt-3 text-sm font-semibold text-ink-100">{routine.name}</div>
                      <div className="mt-2 text-xs text-ink-300">{routine.description}</div>

                      <div className="mt-3 rounded-2xl border border-ink-800 bg-ink-900/70 px-3 py-2 text-[11px] text-ink-300">
                        {latestRun
                          ? `Latest run: ${latestRun.stageStatus ?? latestRun.status}${latestRun.outputText ? ` · ${latestRun.outputText.slice(0, 120)}` : ""}`
                          : "No runs yet. Trigger this routine to produce its first output."}
                      </div>

                      {routine.dependsOnRoutineId ? (
                        <div className="mt-2 text-[11px] text-ink-400">
                          Waits on previous writer handoff before the full chain is complete.
                        </div>
                      ) : null}

                      <div className="mt-4 flex flex-wrap gap-2">
                        <Button
                          variant="glow"
                          size="sm"
                          onClick={() => runRoutineNow(routine.id)}
                          disabled={routineBusyId === routine.id || routine.status !== "Active"}
                        >
                          Run now
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setRoutineStatus(
                              routine.id,
                              routine.status === "Active" ? "Paused" : "Active"
                            )
                          }
                          disabled={routineBusyId === routine.id}
                        >
                          {routine.status === "Active" ? "Pause" : "Resume"}
                        </Button>
                        {routine.draftSlug ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openDraftInForge(routine.draftSlug ?? "")}
                            disabled={!routine.draftSlug}
                          >
                            Open draft
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="rounded-2xl border border-ink-800 bg-ink-950/60 px-4 py-4 text-sm text-ink-400">
                  No persistent routines yet. Promote a build recipe or coach loop from the conversation to create one.
                </div>
              )}
            </div>
          </Card>

          <Card className="p-5">
            <div className="text-xs uppercase tracking-[0.3em] text-ink-400">Next actions</div>
            <div className="mt-4 space-y-2">
              <button
                onClick={() =>
                  runQuickPrompt(
                    activeFile
                      ? `Review ${activeFile} and tell me how it could support the next game mechanic.`
                      : "Give me the next three high-impact moves to turn this project into a fun beginner-friendly game."
                  )
                }
                className="w-full rounded-2xl border border-ink-800 bg-ink-950/70 px-3 py-3 text-left text-sm text-ink-200 hover:border-ink-600"
              >
                Review the current project context
              </button>
              <button
                onClick={() => runQuickPrompt("Plan the next steps to turn this into a polished kid-friendly Roblox game project.")}
                className="w-full rounded-2xl border border-ink-800 bg-ink-950/70 px-3 py-3 text-left text-sm text-ink-200 hover:border-ink-600"
              >
                Plan the next build sprint
              </button>
              <button
                onClick={() => onJumpToTab?.("assets")}
                className="w-full rounded-2xl border border-ink-800 bg-ink-950/70 px-3 py-3 text-left text-sm text-ink-200 hover:border-ink-600"
              >
                Open the asset shelf
              </button>
              <button
                onClick={() => onJumpToTab?.("plugins")}
                className="w-full rounded-2xl border border-ink-800 bg-ink-950/70 px-3 py-3 text-left text-sm text-ink-200 hover:border-ink-600"
              >
                Review build kits already on the platform
              </button>
            </div>
          </Card>

          <Card className="p-5">
            <div className="text-xs uppercase tracking-[0.3em] text-ink-400">Project patch preview</div>
            <div className="mt-4 space-y-1 font-mono text-[11px]">
              {diffDisplay.map((line, index) => (
                <div
                  key={`${line.type}-${index}`}
                  className={cn(
                    "rounded-md px-2 py-1",
                    line.type === "add"
                      ? "bg-glow-500/10 text-glow-300"
                      : line.type === "del"
                        ? "bg-ember-500/10 text-ember-300"
                        : "text-ink-300"
                  )}
                >
                  {line.text}
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-5">
            <div className="text-xs uppercase tracking-[0.3em] text-ink-400">Run queue</div>
            <div className="mt-4 space-y-2">
              {runs.length ? (
                runs.map((run) => (
                  <div
                    key={run.id}
                    className="flex items-center justify-between rounded-2xl border border-ink-800 bg-ink-950/70 px-3 py-2 text-xs"
                  >
                    <span className="text-ink-200">{run.label}</span>
                    <span
                      className={cn(
                        "rounded-full border px-2 py-0.5 font-semibold",
                        statusTone[run.status] ?? statusTone.Queued
                      )}
                    >
                      {run.status}
                    </span>
                  </div>
                ))
              ) : (
                <div className="rounded-xl border border-ink-800 bg-ink-950/60 px-3 py-3 text-xs text-ink-400">
                  No queued runs.
                </div>
              )}
            </div>
          </Card>

          <Card className="p-5">
            <div className="text-xs uppercase tracking-[0.3em] text-ink-400">Team pulse</div>
            <div className="mt-4 space-y-2">
              {presence.length ? (
                presence.map((person) => (
                  <div
                    key={person.id}
                    className="flex items-center justify-between rounded-2xl border border-ink-800 bg-ink-950/70 px-3 py-2"
                  >
                    <div className="flex items-center gap-3">
                      <div className="grid h-8 w-8 place-items-center rounded-full bg-ink-700 text-xs font-semibold text-ink-50">
                        {person.name.slice(0, 1)}
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-ink-100">{person.name}</div>
                        <div className="text-[10px] text-ink-400">{person.role}</div>
                      </div>
                    </div>
                    <span className="text-[10px] font-semibold text-ink-300">{person.status}</span>
                  </div>
                ))
              ) : (
                <div className="rounded-xl border border-ink-800 bg-ink-950/60 px-3 py-3 text-xs text-ink-400">
                  No co-builders online.
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
