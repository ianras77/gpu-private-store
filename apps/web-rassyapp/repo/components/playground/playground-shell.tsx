"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import type { WorkspaceSummary } from "@/lib/workspace/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { BrandMark } from "@/components/brand/mark";
import { ChatTab } from "@/components/playground/chat-tab";
import { TemplatesTab } from "@/components/playground/templates-tab";
import { WorldForgeTab } from "@/components/playground/world-forge-tab";
import { MemoryTab } from "@/components/playground/memory-tab";
import { AssetShelfTab } from "@/components/playground/asset-shelf-tab";
import { SkillsTab } from "@/components/playground/personas-tab";
import { ModelsTab } from "@/components/playground/models-tab";
import { SettingsTab } from "@/components/playground/settings-tab";
import { UsersTab } from "@/components/playground/users-tab";
import { StatusTab } from "@/components/playground/status-tab";
import { CURATED_ASSET_PACKS } from "@/lib/studio/assets";

export type UserSummary = {
  id: string;
  username: string;
  engineUserId?: string | null;
};

type TabId =
  | "chat"
  | "templates"
  | "worlds"
  | "assets"
  | "plugins"
  | "memory"
  | "status"
  | "models"
  | "users"
  | "settings";

type TabMeta = {
  id: TabId;
  label: string;
  description: string;
  group: "core" | "advanced";
};

type FeatureSnapshot = {
  catOnline: boolean | null;
  pluginCount: number | null;
  userCount: number | null;
  mimeCount: number | null;
  llmCount: number | null;
};

const tabs: TabMeta[] = [
  {
    id: "chat",
    label: "Game Coach",
    description: "Turn a kid's idea into scenes, quests, scripts, and next steps.",
    group: "core"
  },
  {
    id: "templates",
    label: "Templates",
    description: "Pick a starter game feeling, theme, and goal without staring at a blank prompt.",
    group: "core"
  },
  {
    id: "worlds",
    label: "Map Forge",
    description: "Choose a world vibe, a route shape, and the world-building crew recipe before the agents fan out.",
    group: "core"
  },
  {
    id: "assets",
    label: "Asset Shelf",
    description: "Decorate with approved art packs, props, sounds, and simple inspiration uploads.",
    group: "core"
  },
  {
    id: "memory",
    label: "Idea Vault",
    description: "Inspect saved references, project memory, and remix notes.",
    group: "core"
  },
  {
    id: "plugins",
    label: "Build Kits",
    description: "Install or draft reusable studio powers for mechanics, quests, and NPCs.",
    group: "core"
  },
  {
    id: "status",
    label: "Studio Pulse",
    description: "Check engine health today and shape the path to account linking next.",
    group: "core"
  },
  {
    id: "models",
    label: "AI Engine",
    description: "Adjust the underlying LLM and embedder providers.",
    group: "advanced"
  },
  {
    id: "users",
    label: "Family Team",
    description: "Manage the underlying Cat users and permissions.",
    group: "advanced"
  },
  {
    id: "settings",
    label: "Studio Settings",
    description: "Edit lower-level runtime settings.",
    group: "advanced"
  }
];

function toArray(value: unknown) {
  return Array.isArray(value) ? value : null;
}

function isTabId(value: string | null | undefined): value is TabId {
  if (!value) return false;
  return tabs.some((tab) => tab.id === value);
}

function pickPluginCount(payload: unknown) {
  const base =
    payload && typeof payload === "object" && "plugins" in payload
      ? (payload as { plugins?: unknown }).plugins
      : payload;
  const direct = toArray(base);
  if (direct) return direct.length;
  if (base && typeof base === "object") {
    const installed = toArray((base as { installed?: unknown }).installed);
    if (installed) return installed.length;
    const plugins = toArray((base as { plugins?: unknown }).plugins);
    if (plugins) return plugins.length;
  }
  return null;
}

function pickUserCount(payload: unknown) {
  const base =
    payload && typeof payload === "object" && "users" in payload
      ? (payload as { users?: unknown }).users
      : payload;
  const direct = toArray(base);
  return direct ? direct.length : null;
}

function pickMimetypeCount(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const candidate =
    (payload as { mimetypes?: unknown; allowed_mimetypes?: unknown }).mimetypes ??
    (payload as { mimetypes?: unknown; allowed_mimetypes?: unknown }).allowed_mimetypes;
  const list = toArray(candidate);
  return list ? list.length : null;
}

function pickLlmCount(payload: unknown) {
  const base =
    payload && typeof payload === "object" && "models" in payload
      ? (payload as { models?: unknown }).models
      : payload;
  const list = toArray(base);
  if (list) return list.length;
  if (base && typeof base === "object") {
    return Object.keys(base).length;
  }
  return null;
}

function readiness(value: boolean | null) {
  if (value === null) return "Checking";
  return value ? "Online" : "Offline";
}

function metricForTab(tabId: TabId, features: FeatureSnapshot, summary: WorkspaceSummary | null) {
  if (tabId === "chat") {
    return `Coach ${readiness(features.catOnline)}`;
  }
  if (tabId === "templates") {
    const count = summary?.studioProject?.availableTemplates.length ?? 0;
    return count ? `${count} starters` : "Starters loading";
  }
  if (tabId === "assets") {
    return `${CURATED_ASSET_PACKS.length} approved shelves`;
  }
  if (tabId === "worlds") {
    const headline = summary?.studioProject?.worldRecipe?.headline;
    return headline ? headline : "World recipe loading";
  }
  if (tabId === "memory") {
    return features.userCount == null ? "Vault syncing" : `${features.userCount} creator profiles`;
  }
  if (tabId === "plugins") {
    return features.pluginCount == null ? "Kit inventory pending" : `${features.pluginCount} build kits`;
  }
  if (tabId === "status") {
    return features.llmCount == null ? "Engine scan pending" : `${features.llmCount} engine tools`;
  }
  return "Advanced";
}

function metricTone(tabId: TabId, features: FeatureSnapshot) {
  if (tabId === "chat" && features.catOnline) {
    return "text-glow-300";
  }
  if (tabId === "templates" || tabId === "worlds" || tabId === "assets") {
    return "text-glow-300";
  }
  if (tabId === "status" && features.catOnline === false) {
    return "text-ember-300";
  }
  return "text-ink-400";
}

export function ConsoleShell({ user }: { user: UserSummary }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [activeTab, setActiveTab] = React.useState<TabId>(() => {
    const requested = searchParams.get("tab");
    return isTabId(requested) ? requested : "chat";
  });

  const [summary, setSummary] = React.useState<WorkspaceSummary | null>(null);
  const [queuedCoachPrompt, setQueuedCoachPrompt] = React.useState<string | null>(null);
  const [features, setFeatures] = React.useState<FeatureSnapshot>({
    catOnline: null,
    pluginCount: null,
    userCount: null,
    mimeCount: null,
    llmCount: null
  });

  const redirectToSignIn = React.useCallback(() => {
    router.replace("/sign-in?reason=session-expired");
  }, [router]);

  const fetchWithAuth = React.useCallback(
    async (url: string) => {
      const response = await fetch(url);
      if (response.status === 401) {
        redirectToSignIn();
        return null;
      }
      return response;
    },
    [redirectToSignIn]
  );

  const refreshSummary = React.useCallback(async () => {
    const res = await fetchWithAuth("/api/workspace/summary");
    if (!res || !res.ok) return;
    const data = (await res.json()) as WorkspaceSummary;
    setSummary(data);
  }, [fetchWithAuth]);

  const refreshFeatures = React.useCallback(async () => {
    const [statusResult, pluginResult, userResult, mimeResult, llmResult] = await Promise.allSettled(
      [
        fetchWithAuth("/api/cat/status"),
        fetchWithAuth("/api/cat/plugins"),
        fetchWithAuth("/api/cat/users"),
        fetchWithAuth("/api/cat/rabbithole/allowed-mimetypes"),
        fetchWithAuth("/api/cat/llm")
      ]
    );

    const snapshot: FeatureSnapshot = {
      catOnline: null,
      pluginCount: null,
      userCount: null,
      mimeCount: null,
      llmCount: null
    };

    if (
      statusResult.status === "fulfilled" &&
      statusResult.value &&
      statusResult.value.ok
    ) {
      snapshot.catOnline = true;
    } else if (
      statusResult.status === "fulfilled" &&
      statusResult.value &&
      statusResult.value.status !== 401
    ) {
      snapshot.catOnline = false;
    }

    if (
      pluginResult.status === "fulfilled" &&
      pluginResult.value &&
      pluginResult.value.ok
    ) {
      const payload = await pluginResult.value.json().catch(() => null);
      snapshot.pluginCount = pickPluginCount(payload);
    }

    if (
      userResult.status === "fulfilled" &&
      userResult.value &&
      userResult.value.ok
    ) {
      const payload = await userResult.value.json().catch(() => null);
      snapshot.userCount = pickUserCount(payload);
    }

    if (
      mimeResult.status === "fulfilled" &&
      mimeResult.value &&
      mimeResult.value.ok
    ) {
      const payload = await mimeResult.value.json().catch(() => null);
      snapshot.mimeCount = pickMimetypeCount(payload);
    }

    if (llmResult.status === "fulfilled" && llmResult.value && llmResult.value.ok) {
      const payload = await llmResult.value.json().catch(() => null);
      snapshot.llmCount = pickLlmCount(payload);
    }

    setFeatures(snapshot);
  }, [fetchWithAuth]);

  const refreshAll = React.useCallback(async () => {
    await Promise.all([refreshSummary(), refreshFeatures()]);
  }, [refreshFeatures, refreshSummary]);

  React.useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  React.useEffect(() => {
    const requested = searchParams.get("tab");
    if (isTabId(requested) && requested !== activeTab) {
      setActiveTab(requested);
    }
  }, [searchParams, activeTab]);

  React.useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    if (params.get("tab") === activeTab) return;
    params.set("tab", activeTab);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [activeTab, pathname, router, searchParams]);

  const onSignOut = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
  };

  const launchCoachPrompt = React.useCallback((prompt: string) => {
    setQueuedCoachPrompt(prompt);
    setActiveTab("chat");
  }, []);

  const activeMeta = tabs.find((tab) => tab.id === activeTab) ?? tabs[0];
  const workspace = summary?.workspace;
  const studioProject = summary?.studioProject;
  const workspaceName = workspace?.name ?? "Launchpad Project";
  const workspaceBranch = workspace?.branch ?? "creative";
  const collaboratorCount = workspace?.collaboratorCount ?? 0;
  const projectTitle = studioProject?.title ?? workspaceName;
  const projectTemplate = studioProject?.templatePack?.name ?? "No template yet";
  const connectionStatus = studioProject?.connectionStatus ?? "Guest";
  const publishReadiness = studioProject?.publishReadiness ?? "Planning";
  const parentMode = studioProject?.parentModeEnabled ? "On" : "Off";
  const templateCount = studioProject?.availableTemplates.length ?? 0;
  const assetShelfCount = CURATED_ASSET_PACKS.length;
  const lastEditedBy = studioProject?.lastEditedBy?.username ?? "a teammate";
  const primaryTabs = tabs.filter((tab) => tab.group === "core");
  const advancedTabs = tabs.filter((tab) => tab.group === "advanced");

  return (
    <div className="min-h-screen bg-ink-950 text-ink-50">
      <div className="hero-bg relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(16,20,28,0.95),_rgba(6,8,12,1))]" />
        <div className="floating-orb absolute -left-24 top-20 h-[320px] w-[320px] rounded-full bg-glow-500/10 blur-[120px]" />
        <div className="floating-orb absolute -right-20 top-56 h-[300px] w-[300px] rounded-full bg-ember-500/10 blur-[120px]" />

        <div className="relative mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <header className="rounded-[2rem] border border-ink-800 bg-ink-900/75 p-5 sm:p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-4">
                <BrandMark />
                <div>
                  <div className="text-xs uppercase tracking-[0.32em] text-ink-400">
                    Kid-First Game Studio
                  </div>
                  <h1 className="mt-2 text-2xl font-semibold text-ink-50 sm:text-3xl">
                    One playful surface for starter worlds, safe shelves, build kits, and studio control.
                  </h1>
                  <p className="mt-3 max-w-3xl text-sm text-ink-300">
                    Launchpad wraps Cheshire Cat as a family-friendly game studio. Keep the coach
                    in the center, start from kid-friendly templates, decorate with approved asset
                    shelves, and turn strong patterns into reusable build kits that make the next
                    project easier.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={refreshAll}>
                  Refresh studio
                </Button>
                <Button variant="ghost" onClick={() => setActiveTab("chat")}>
                  Back to coach
                </Button>
                <Button variant="ghost" onClick={onSignOut}>
                  Sign out
                </Button>
              </div>
            </div>

            <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(0,1fr)_280px]">
              <div className="rounded-3xl border border-ink-800 bg-ink-950/60 p-4">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <Badge variant="neutral">Project {projectTitle}</Badge>
                  <Badge variant="neutral">Template {projectTemplate}</Badge>
                  <Badge variant="neutral">Track {workspaceBranch}</Badge>
                  <Badge variant={features.catOnline ? "glow" : "ember"}>
                    Engine {readiness(features.catOnline)}
                  </Badge>
                  <Badge variant="neutral">{collaboratorCount} co-builders</Badge>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl border border-ink-800 bg-ink-900/70 px-4 py-3">
                    <div className="text-[10px] uppercase tracking-[0.24em] text-ink-500">
                      Starter templates
                    </div>
                    <div className="mt-1 text-lg font-semibold text-ink-100">
                      {templateCount || "--"}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-ink-800 bg-ink-900/70 px-4 py-3">
                    <div className="text-[10px] uppercase tracking-[0.24em] text-ink-500">
                      Asset shelves
                    </div>
                    <div className="mt-1 text-lg font-semibold text-ink-100">
                      {assetShelfCount}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-ink-800 bg-ink-900/70 px-4 py-3">
                    <div className="text-[10px] uppercase tracking-[0.24em] text-ink-500">
                      Publish status
                    </div>
                    <div className="mt-1 text-lg font-semibold text-ink-100">{publishReadiness}</div>
                  </div>
                </div>
              </div>

              <div className="rounded-3xl border border-ink-800 bg-ink-950/60 p-4">
                <div className="text-xs uppercase tracking-[0.3em] text-ink-400">
                  Studio builder
                </div>
                <div className="mt-3 text-lg font-semibold text-ink-100">{user.username}</div>
                <div className="mt-2 text-xs text-ink-400">
                  {user.engineUserId ? `Engine user ${user.engineUserId}` : "No bound engine user id"}
                </div>
                <div className="mt-4 rounded-2xl border border-ink-800 bg-ink-900/70 px-3 py-3 text-xs text-ink-300">
                  Current lane: <span className="font-semibold text-ink-100">{activeMeta.label}</span>
                </div>
                <div className="mt-3 grid gap-2 text-xs">
                  <div className="rounded-2xl border border-ink-800 bg-ink-900/70 px-3 py-2 text-ink-300">
                    Connection: <span className="font-semibold text-ink-100">{connectionStatus}</span>
                  </div>
                  <div className="rounded-2xl border border-ink-800 bg-ink-900/70 px-3 py-2 text-ink-300">
                    Parent mode: <span className="font-semibold text-ink-100">{parentMode}</span>
                  </div>
                  <div className="rounded-2xl border border-ink-800 bg-ink-900/70 px-3 py-2 text-ink-300">
                    Last edit: <span className="font-semibold text-ink-100">{lastEditedBy}</span>
                  </div>
                </div>
              </div>
            </div>
          </header>

          <div className="mt-6 grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
            <aside className="space-y-4">
              <Card className="p-5">
                <div className="text-xs uppercase tracking-[0.3em] text-ink-400">
                  Build Rail
                </div>
                <h2 className="mt-3 text-xl font-semibold text-ink-50">
                  What do you want to build next?
                </h2>
                <p className="mt-2 text-sm text-ink-300">
                  Keep the game coach central. Start with a template, pull in approved shelves, and
                  bring in memory, build kits, and studio tools only when they help the next move.
                </p>
              </Card>

              <div className="space-y-2">
                {primaryTabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={cn(
                      "w-full rounded-3xl border px-4 py-4 text-left transition",
                      activeTab === tab.id
                        ? "border-glow-500/40 bg-glow-500/12 shadow-glow"
                        : "border-ink-800 bg-ink-900/70 hover:border-ink-600"
                    )}
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="text-base font-semibold text-ink-100">{tab.label}</div>
                      <div
                        className={cn(
                          "text-[10px] uppercase tracking-[0.24em]",
                          metricTone(tab.id, features)
                        )}
                      >
                        {metricForTab(tab.id, features, summary)}
                      </div>
                    </div>
                    <div className="mt-2 text-sm text-ink-300">{tab.description}</div>
                  </button>
                ))}
              </div>

              <details className="rounded-3xl border border-ink-800 bg-ink-900/70 p-4">
                <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.24em] text-ink-400">
                  Advanced controls
                </summary>
                <div className="mt-3 space-y-2">
                  {advancedTabs.map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={cn(
                        "w-full rounded-2xl border px-4 py-3 text-left transition",
                        activeTab === tab.id
                          ? "border-glow-500/40 bg-glow-500/12"
                          : "border-ink-800 bg-ink-950/70 hover:border-ink-600"
                      )}
                    >
                      <div className="text-sm font-semibold text-ink-100">{tab.label}</div>
                      <div className="mt-1 text-xs text-ink-300">{tab.description}</div>
                    </button>
                  ))}
                </div>
              </details>

              <Card className="p-5">
                <div className="text-xs uppercase tracking-[0.3em] text-ink-400">
                  Suggested flow
                </div>
                <div className="mt-3 space-y-2 text-sm text-ink-300">
                  <button
                    onClick={() => setActiveTab("templates")}
                    className="w-full rounded-2xl border border-ink-800 bg-ink-950/70 px-3 py-3 text-left hover:border-ink-600"
                  >
                    Pick the starter game feeling
                  </button>
                  <button
                    onClick={() => setActiveTab("assets")}
                    className="w-full rounded-2xl border border-ink-800 bg-ink-950/70 px-3 py-3 text-left hover:border-ink-600"
                  >
                    Browse approved shelves
                  </button>
                  <button
                    onClick={() => setActiveTab("chat")}
                    className="w-full rounded-2xl border border-ink-800 bg-ink-950/70 px-3 py-3 text-left hover:border-ink-600"
                  >
                    Pitch the next scene or mechanic
                  </button>
                  <button
                    onClick={() => setActiveTab("plugins")}
                    className="w-full rounded-2xl border border-ink-800 bg-ink-950/70 px-3 py-3 text-left hover:border-ink-600"
                  >
                    Open the build kit lab
                  </button>
                  <button
                    onClick={() => setActiveTab("status")}
                    className="w-full rounded-2xl border border-ink-800 bg-ink-950/70 px-3 py-3 text-left hover:border-ink-600"
                  >
                    Review publish readiness
                  </button>
                </div>
              </Card>
            </aside>

            <main className="space-y-4">
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
                <Card className="p-5">
                  <div className="text-xs uppercase tracking-[0.3em] text-ink-400">
                    Current lane
                  </div>
                  <div className="mt-2 text-2xl font-semibold text-ink-50">{activeMeta.label}</div>
                  <p className="mt-2 max-w-3xl text-sm text-ink-300">{activeMeta.description}</p>
                </Card>

                <Card className="p-5">
                  <div className="text-xs uppercase tracking-[0.3em] text-ink-400">
                    Studio pulse
                  </div>
                  <div className="mt-3 space-y-2 text-sm">
                    <div className="rounded-2xl border border-ink-800 bg-ink-950/70 px-3 py-2 text-ink-300">
                      Engine: <span className="font-semibold text-ink-100">{readiness(features.catOnline)}</span>
                    </div>
                    <div className="rounded-2xl border border-ink-800 bg-ink-950/70 px-3 py-2 text-ink-300">
                      Template: <span className="font-semibold text-ink-100">{projectTemplate}</span>
                    </div>
                    <div className="rounded-2xl border border-ink-800 bg-ink-950/70 px-3 py-2 text-ink-300">
                      Publish: <span className="font-semibold text-ink-100">{publishReadiness}</span>
                    </div>
                  </div>
                </Card>
              </div>

              {activeTab === "chat" ? (
                <ChatTab
                  summary={summary}
                  onRefreshSummary={refreshSummary}
                  onJumpToTab={(tab) => setActiveTab(tab)}
                  queuedPrompt={queuedCoachPrompt}
                  onQueuedPromptHandled={() => setQueuedCoachPrompt(null)}
                />
              ) : null}
              {activeTab === "templates" ? (
                <TemplatesTab
                  summary={summary}
                  onJumpToTab={(tab) => setActiveTab(tab)}
                  onSendToCoach={launchCoachPrompt}
                  onRefreshSummary={refreshSummary}
                />
              ) : null}
              {activeTab === "worlds" ? (
                <WorldForgeTab
                  summary={summary}
                  onJumpToTab={(tab) => setActiveTab(tab)}
                  onSendToCoach={launchCoachPrompt}
                  onRefreshSummary={refreshSummary}
                />
              ) : null}
              {activeTab === "assets" ? (
                <AssetShelfTab
                  summary={summary}
                  onSendToCoach={launchCoachPrompt}
                  onRefreshSummary={refreshSummary}
                />
              ) : null}
              {activeTab === "plugins" ? <SkillsTab /> : null}
              {activeTab === "memory" ? <MemoryTab /> : null}
              {activeTab === "status" ? <StatusTab /> : null}
              {activeTab === "models" ? <ModelsTab /> : null}
              {activeTab === "users" ? <UsersTab /> : null}
              {activeTab === "settings" ? <SettingsTab /> : null}
            </main>
          </div>
        </div>
      </div>
    </div>
  );
}
