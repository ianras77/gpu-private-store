"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type Plugin = {
  id?: string;
  plugin_id?: string;
  name?: string;
  description?: string | null;
  category?: string | null;
  active?: boolean;
  configurable?: boolean;
};

type PluginDraft = {
  slug: string;
  name: string;
  description: string;
  version: string;
  authorName: string;
  authorUrl: string;
  moduleName: string;
  source: string;
  updatedAt: string;
  lastBuildReport?: PluginBuildReport | null;
};

type BuilderCheck = {
  ok: boolean;
  label: string;
  detail: string;
};

type BuildStep = {
  label: string;
  status: "passed" | "failed" | "skipped";
  detail: string;
};

type PluginBuildReport = {
  mode: "checks" | "live-test" | "deploy" | "repair" | "runtime";
  summary: string;
  ranAt: string;
  checks: BuilderCheck[];
  steps: BuildStep[];
  manifest: {
    name: string;
    version: string;
    description: string;
    author_name: string;
    author_url: string;
    plugin_url: string;
    tags: string[];
    thumb: string;
  };
  archive: {
    slug: string;
    filename: string;
    moduleName: string;
  };
  notes?: string | null;
};

type SkillBlueprint = {
  title: string;
  prompt: string;
  lane: string;
};

type CapabilityFlavor = {
  label: string;
  variant: "neutral" | "glow" | "ember";
  detail: string;
};

type AgentStage = {
  title: string;
  eyebrow: string;
  detail: string;
};

const skillBlueprints: SkillBlueprint[] = [
  {
    title: "Obby starter kit",
    lane: "Template",
    prompt:
      "Create a Cheshire Cat build kit that helps kids turn an obstacle-course idea into checkpoints, rewards, difficulty tuning, and beginner-friendly script tasks."
  },
  {
    title: "Story quest maker",
    lane: "Quest",
    prompt:
      "Create a build kit that turns a simple story pitch into scenes, NPC goals, dialogue starters, and quest reward ideas for a kid-friendly game."
  },
  {
    title: "NPC dialogue coach",
    lane: "Character",
    prompt:
      "Create a build kit that helps kids design friendly NPCs, quest hints, and safe dialogue with clear roles and simple emotional tone."
  },
  {
    title: "Parent publish helper",
    lane: "Review",
    prompt:
      "Create a build kit that reviews a project before publish, summarizes what changed, flags kid-safety concerns, and prepares a calm handoff for a parent or coach."
  }
];

const capabilityRituals = [
  "A kid describes the game they want to make.",
  "Drafts turn that idea into reusable studio powers.",
  "Checks keep the build kit safe and remixable.",
  "Deploy makes the build kit ready for the next project too."
];

const agentStages: AgentStage[] = [
  {
    eyebrow: "Dream",
    title: "Start from kid language",
    detail:
      "Short ideas, favorite themes, and simple goals should be enough to start a strong build plan."
  },
  {
    eyebrow: "Plan",
    title: "Turn ideas into build steps",
    detail:
      "Templates, references, and forms should shape the game before code gets detailed."
  },
  {
    eyebrow: "Build",
    title: "Generate safe reusable helpers",
    detail:
      "Create quest makers, NPC packs, and script assistants that are easy to test and reuse."
  },
  {
    eyebrow: "Share",
    title: "Reuse the good parts",
    detail:
      "Every deployed kit should make the next family project easier instead of starting from zero."
  }
];

function defaultDraft(): PluginDraft {
  return {
    slug: "game-build-kit",
    name: "Game Build Kit",
    description: "Generated Cheshire Cat build kit for the studio",
    version: "0.1.0",
    authorName: "Console User",
    authorUrl: "",
    moduleName: "game_build_kit",
    source: "",
    updatedAt: new Date(0).toISOString(),
    lastBuildReport: null
  };
}

function pluginKey(plugin: Plugin) {
  return plugin.id ?? plugin.plugin_id ?? plugin.name ?? "unknown";
}

function lineCount(value: string) {
  return Math.max(1, value.split("\n").length);
}

function inferCapability(plugin: Plugin): CapabilityFlavor {
  const text = `${plugin.name ?? ""} ${plugin.description ?? ""} ${plugin.category ?? ""}`.toLowerCase();

  if (
    text.includes("memory") ||
    text.includes("rabbit") ||
    text.includes("knowledge") ||
    text.includes("embed")
  ) {
    return {
      label: "Idea Vault",
      variant: "glow",
      detail: "Feeds the coach with uploads, recall, and reusable project references."
    };
  }

  if (
    text.includes("agent") ||
    text.includes("workflow") ||
    text.includes("schedule") ||
    text.includes("loop") ||
    text.includes("automation")
  ) {
    return {
      label: "Coach Loop",
      variant: "ember",
      detail: "Automates repeated game-building steps or review checks."
    };
  }

  if (
    text.includes("repo") ||
    text.includes("code") ||
    text.includes("workspace") ||
    text.includes("tool")
  ) {
    return {
      label: "Build Tool",
      variant: "neutral",
      detail: "Acts on scripts, files, or helper workflows for the studio."
    };
  }

  return {
    label: "Studio Power",
    variant: "neutral",
    detail: "Reusable capability available across this studio."
  };
}

function draftFreshness(updatedAt: string) {
  const delta = Date.now() - new Date(updatedAt).getTime();
  const hours = Math.floor(delta / (1000 * 60 * 60));
  if (!Number.isFinite(hours) || hours < 0) return "Unknown";
  if (hours < 1) return "Updated just now";
  if (hours < 24) return `Updated ${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `Updated ${days}d ago`;
}

function extractPlugins(payload: unknown): Plugin[] {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];
  const candidate = (payload as { plugins?: unknown }).plugins;
  if (Array.isArray(candidate)) return candidate;
  return candidate && typeof candidate === "object" ? [candidate as Plugin] : [payload as Plugin];
}

export function SkillsTab() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [plugins, setPlugins] = React.useState<Plugin[]>([]);
  const [file, setFile] = React.useState<File | null>(null);
  const [registryUrl, setRegistryUrl] = React.useState("");
  const [status, setStatus] = React.useState<string | null>(null);

  const [drafts, setDrafts] = React.useState<PluginDraft[]>([]);
  const [draft, setDraft] = React.useState<PluginDraft>(defaultDraft());
  const [builderPrompt, setBuilderPrompt] = React.useState("");
  const [repairGoal, setRepairGoal] = React.useState("");
  const [builderChecks, setBuilderChecks] = React.useState<BuilderCheck[]>([]);
  const [buildReport, setBuildReport] = React.useState<PluginBuildReport | null>(null);
  const [busy, setBusy] = React.useState(false);

  const applyDraft = React.useCallback((nextDraft: PluginDraft) => {
    setDraft(nextDraft);
    setBuildReport(nextDraft.lastBuildReport ?? null);
    setBuilderChecks(nextDraft.lastBuildReport?.checks ?? []);
  }, []);

  const loadPlugins = React.useCallback(async () => {
    const res = await fetch("/api/cat/plugins");
    if (!res.ok) return;
    const data = (await res.json()) as unknown;
    setPlugins(extractPlugins(data));
  }, []);

  const loadDrafts = React.useCallback(async () => {
    const res = await fetch("/api/cat/plugin-builder");
    if (!res.ok) return;
    const data = (await res.json()) as { drafts?: PluginDraft[] };
    const list = data.drafts ?? [];
    setDrafts(list);
    if (list.length && !draft.source) {
      applyDraft(list[0]);
    }
  }, [applyDraft, draft.source]);

  const loadDraft = React.useCallback(async (slug: string) => {
    const res = await fetch(`/api/cat/plugin-builder?slug=${encodeURIComponent(slug)}`);
    if (!res.ok) return;
    const data = (await res.json()) as { draft?: PluginDraft };
    if (data.draft) {
      applyDraft(data.draft);
    }
  }, [applyDraft]);

  React.useEffect(() => {
    loadPlugins();
    loadDrafts();
  }, [loadPlugins, loadDrafts]);

  React.useEffect(() => {
    const requestedDraft = searchParams.get("draft");
    if (!requestedDraft) return;
    loadDraft(requestedDraft);

    const params = new URLSearchParams(searchParams.toString());
    params.delete("draft");
    router.replace(params.toString() ? `${pathname}?${params.toString()}` : pathname, {
      scroll: false
    });
  }, [loadDraft, pathname, router, searchParams]);

  const togglePlugin = async (plugin: Plugin) => {
    const pluginId = plugin.id ?? plugin.plugin_id ?? plugin.name;
    if (!pluginId) return;
    const res = await fetch(`/api/cat/plugins/${encodeURIComponent(pluginId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !plugin.active })
    });
    if (!res.ok) return;
    setPlugins((prev) =>
      prev.map((item) =>
        pluginKey(item) === pluginKey(plugin) ? { ...item, active: !plugin.active } : item
      )
    );
  };

  const uploadPlugin = async () => {
    if (!file) return;
    setStatus("Uploading build kit package...");
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/cat/plugins/upload", { method: "POST", body: form });
    if (!res.ok) {
      const text = await res.text();
      setStatus(text || "Build kit upload failed");
      return;
    }
    setStatus("Build kit uploaded to Cheshire Cat");
    setFile(null);
    loadPlugins();
  };

  const installFromRegistry = async () => {
    if (!registryUrl.trim()) return;
    setStatus("Installing build kit from registry...");
    const res = await fetch("/api/cat/plugins/registry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: registryUrl.trim() })
    });
    if (!res.ok) {
      const text = await res.text();
      setStatus(text || "Registry install failed");
      return;
    }
    setStatus("Registry build kit installed");
    setRegistryUrl("");
    loadPlugins();
  };

  const saveDraft = async () => {
    setBusy(true);
    setStatus("Saving build kit draft...");
    const res = await fetch("/api/cat/plugin-builder", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft)
    });
    setBusy(false);
    if (!res.ok) {
      const text = await res.text();
      setStatus(text || "Unable to save draft");
      return;
    }
    const data = (await res.json()) as { draft?: PluginDraft };
    if (data.draft) applyDraft(data.draft);
    setStatus("Build kit draft saved");
    loadDrafts();
  };

  const runChecks = async (catUpload = false) => {
    setBusy(true);
    setStatus(catUpload ? "Running live Cat upload test..." : "Running draft checks...");
    const res = await fetch("/api/cat/plugin-builder/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slug: draft.slug,
        catUpload,
        cleanup: true
      })
    });
    setBusy(false);
    const data = (await res.json().catch(() => null)) as
      | { checks?: BuilderCheck[]; ok?: boolean; report?: PluginBuildReport; error?: string }
      | null;
    if (data?.checks) setBuilderChecks(data.checks);
    if (data?.report) setBuildReport(data.report);
    if (!res.ok) {
      setStatus(data?.error || "Checks failed");
      return;
    }
    setStatus(data?.report?.summary ?? (data?.ok ? "Checks passed" : "Checks need attention"));
  };

  const generateFromPrompt = async () => {
    if (!builderPrompt.trim()) return;
    setBusy(true);
    setStatus("Generating build kit code...");
    const res = await fetch("/api/cat/plugin-builder/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slug: draft.slug,
        instructions: builderPrompt.trim()
      })
    });
    setBusy(false);
    if (!res.ok) {
      const text = await res.text();
      setStatus(text || "Generation failed");
      return;
    }
    const data = (await res.json()) as { draft?: PluginDraft };
    if (data.draft) {
      applyDraft(data.draft);
    }
    setStatus("Draft revised from prompt");
  };

  const runRuntimeHarness = async () => {
    setBusy(true);
    setStatus("Uploading draft and exercising it inside Cheshire Cat...");
    const res = await fetch("/api/cat/plugin-builder/runtime", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug: draft.slug })
    });
    setBusy(false);
    const data = (await res.json().catch(() => null)) as
      | { report?: PluginBuildReport; error?: string; ok?: boolean }
      | null;
    if (data?.report) {
      setBuildReport(data.report);
      setBuilderChecks(data.report.checks ?? []);
    }
    if (!res.ok) {
      setStatus(data?.error || "Runtime harness failed");
      loadDrafts();
      return;
    }
    setStatus(data?.report?.summary ?? (data?.ok ? "Runtime harness passed" : "Runtime harness found gaps"));
    loadDrafts();
    loadPlugins();
  };

  const repairDraft = async () => {
    setBusy(true);
    setStatus("Repairing build kit draft with AI...");
    const res = await fetch("/api/cat/plugin-builder/repair", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slug: draft.slug,
        goal: repairGoal.trim()
      })
    });
    setBusy(false);
    const data = (await res.json().catch(() => null)) as
      | { draft?: PluginDraft; report?: PluginBuildReport; error?: string }
      | null;
    if (!res.ok) {
      setStatus(data?.error || "Repair failed");
      return;
    }
    if (data?.draft) {
      applyDraft(data.draft);
    }
    if (data?.report) {
      setBuildReport(data.report);
    }
    setStatus(data?.report?.summary ?? "Draft repaired");
    loadDrafts();
  };

  const deployDraft = async () => {
    setBusy(true);
    setStatus("Deploying build kit to Cheshire Cat...");
    const res = await fetch("/api/cat/plugin-builder/deploy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug: draft.slug })
    });
    setBusy(false);
    const data = (await res.json().catch(() => null)) as
      | { report?: PluginBuildReport; error?: string }
      | null;
    if (data?.report) setBuildReport(data.report);
    if (!res.ok) {
      setStatus(data?.error || "Deploy failed");
      return;
    }
    setStatus(data?.report?.summary ?? "Build kit deployed");
    loadPlugins();
    loadDrafts();
  };

  const lineNumbers = React.useMemo(
    () =>
      Array.from({ length: lineCount(draft.source) }, (_, index) => String(index + 1)).join("\n"),
    [draft.source]
  );

  const activePlugins = plugins.filter((plugin) => plugin.active).length;
  const configurablePlugins = plugins.filter((plugin) => plugin.configurable).length;
  const activeChecks = builderChecks.filter((check) => check.ok).length;
  const capabilityFamilies = new Set(plugins.map((plugin) => inferCapability(plugin).label)).size;

  return (
    <div className="mt-6 space-y-4">
      <Card className="intro-rise overflow-hidden p-0">
        <div className="border-b border-ink-800 bg-[radial-gradient(circle_at_top_left,_rgba(78,240,199,0.14),_transparent_35%),radial-gradient(circle_at_bottom_right,_rgba(255,122,89,0.14),_transparent_32%),linear-gradient(180deg,rgba(15,18,24,0.96),rgba(8,10,14,0.96))] px-6 py-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-3xl">
              <div className="text-xs uppercase tracking-[0.34em] text-ink-400">
                Build Kit Lab
              </div>
              <div className="mt-3 text-3xl font-semibold text-ink-50">
                Turn one great game idea into a reusable studio power.
              </div>
              <p className="mt-3 text-sm text-ink-300">
                This is where Launchpad gets more helpful. Draft a build kit from a prompt, check
                it, deploy it, and let Cheshire Cat compound that capability across every future
                game conversation on this instance.
              </p>
            </div>

            <div className="flex flex-wrap gap-2 text-xs">
              <Badge variant="glow">{activePlugins} live kits</Badge>
              <Badge variant="neutral">{drafts.length} incubating drafts</Badge>
              <Badge variant="ember">{capabilityFamilies || 1} power families</Badge>
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-4">
            <div className="rounded-2xl border border-ink-800 bg-ink-950/60 px-4 py-3">
              <div className="text-[10px] uppercase tracking-[0.24em] text-ink-500">Live kits</div>
              <div className="mt-1 text-xl font-semibold text-ink-100">{plugins.length}</div>
              <div className="mt-1 text-xs text-ink-400">Reusable powers inside this studio.</div>
            </div>
            <div className="rounded-2xl border border-ink-800 bg-ink-950/60 px-4 py-3">
              <div className="text-[10px] uppercase tracking-[0.24em] text-ink-500">Draft kits</div>
              <div className="mt-1 text-xl font-semibold text-ink-100">{drafts.length}</div>
              <div className="mt-1 text-xs text-ink-400">Ideas being turned into studio powers.</div>
            </div>
            <div className="rounded-2xl border border-ink-800 bg-ink-950/60 px-4 py-3">
              <div className="text-[10px] uppercase tracking-[0.24em] text-ink-500">Checks passing</div>
              <div className="mt-1 text-xl font-semibold text-ink-100">
                {builderChecks.length ? `${activeChecks}/${builderChecks.length}` : "--"}
              </div>
              <div className="mt-1 text-xs text-ink-400">Validation before live deploy.</div>
            </div>
            <div className="rounded-2xl border border-ink-800 bg-ink-950/60 px-4 py-3">
              <div className="text-[10px] uppercase tracking-[0.24em] text-ink-500">
                Tweakable
              </div>
              <div className="mt-1 text-xl font-semibold text-ink-100">{configurablePlugins}</div>
              <div className="mt-1 text-xs text-ink-400">Build kits that expose runtime knobs.</div>
            </div>
          </div>
        </div>

        <div className="grid gap-0 border-t border-ink-800 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="px-6 py-5">
            <div className="text-xs uppercase tracking-[0.3em] text-ink-400">
              Why this matters
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-ink-800 bg-ink-950/60 p-4">
                <div className="text-sm font-semibold text-ink-100">Template memory</div>
                <div className="mt-2 text-xs text-ink-300">
                  Build kits can turn uploads, references, and memory into repeatable creation patterns.
                </div>
              </div>
              <div className="rounded-2xl border border-ink-800 bg-ink-950/60 p-4">
                <div className="text-sm font-semibold text-ink-100">Safer iteration</div>
                <div className="mt-2 text-xs text-ink-300">
                  Each deployed kit makes the next family project easier instead of starting from zero.
                </div>
              </div>
              <div className="rounded-2xl border border-ink-800 bg-ink-950/60 p-4">
                <div className="text-sm font-semibold text-ink-100">Coach loops</div>
                <div className="mt-2 text-xs text-ink-300">
                  The goal is not just chat UI. The goal is a studio that learns safe, remixable building moves.
                </div>
              </div>
            </div>
          </div>

          <div className="border-t border-ink-800 px-6 py-5 lg:border-l lg:border-t-0">
            <div className="text-xs uppercase tracking-[0.3em] text-ink-400">
              Kit rhythm
            </div>
            <div className="mt-3 space-y-2">
              {capabilityRituals.map((ritual, index) => (
                <div
                  key={ritual}
                  className="flex items-start gap-3 rounded-2xl border border-ink-800 bg-ink-950/60 px-3 py-3"
                >
                  <div className="grid h-7 w-7 place-items-center rounded-full border border-ink-700 bg-ink-900 text-[11px] font-semibold text-ink-200">
                    {index + 1}
                  </div>
                  <div className="text-sm text-ink-300">{ritual}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <Card className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.3em] text-ink-400">Agentic stack</div>
              <div className="mt-2 text-xl font-semibold text-ink-50">
                Build Launchpad as a studio engine, not a plugin shelf.
              </div>
            </div>
            <Badge variant="glow">Compoundable</Badge>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {agentStages.map((stage) => (
              <div key={stage.eyebrow} className="rounded-2xl border border-ink-800 bg-ink-950/70 p-4">
                <div className="text-[10px] uppercase tracking-[0.24em] text-glow-300">
                  {stage.eyebrow}
                </div>
                <div className="mt-2 text-sm font-semibold text-ink-100">{stage.title}</div>
                <div className="mt-2 text-xs text-ink-300">{stage.detail}</div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <div className="text-xs uppercase tracking-[0.3em] text-ink-400">Platform flywheel</div>
          <div className="mt-2 text-xl font-semibold text-ink-50">
            Use one solved game task to make the next build easier.
          </div>
          <div className="mt-4 space-y-3">
            <div className="rounded-2xl border border-ink-800 bg-ink-950/70 px-4 py-3 text-sm text-ink-300">
              Threads surface repeated game-building patterns worth packaging.
            </div>
            <div className="rounded-2xl border border-ink-800 bg-ink-950/70 px-4 py-3 text-sm text-ink-300">
              The lab turns those patterns into draft code, checks, and live deploys.
            </div>
            <div className="rounded-2xl border border-ink-800 bg-ink-950/70 px-4 py-3 text-sm text-ink-300">
              Live build kits feed future chats, so the studio keeps learning better moves.
            </div>
          </div>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        <div className="space-y-4">
          <Card className="p-5">
            <div className="text-xs uppercase tracking-[0.3em] text-ink-400">Blueprints</div>
            <div className="mt-3 text-sm text-ink-300">
              Seed the builder with ideas that make the studio more helpful, not just more busy.
            </div>
            <div className="mt-4 space-y-2">
              {skillBlueprints.map((blueprint) => (
                <button
                  key={blueprint.title}
                  onClick={() => setBuilderPrompt(blueprint.prompt)}
                  className="w-full rounded-2xl border border-ink-800 bg-ink-950/70 px-4 py-3 text-left transition hover:border-glow-500/40"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-ink-100">{blueprint.title}</div>
                    <Badge variant="neutral">{blueprint.lane}</Badge>
                  </div>
                  <div className="mt-2 text-xs text-ink-300">{blueprint.prompt}</div>
                </button>
              ))}
            </div>
          </Card>

          <Card className="p-5">
            <div className="text-xs uppercase tracking-[0.3em] text-ink-400">Kit actions</div>
            <div className="mt-4 space-y-3 text-sm text-ink-300">
              <input
                type="file"
                className="w-full rounded-xl border border-ink-800 bg-ink-900/60 px-3 py-2 text-xs text-ink-200"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
              <Button variant="outline" onClick={uploadPlugin}>
                Upload build kit zip
              </Button>

              <Input
                placeholder="https://github.com/org/repo"
                value={registryUrl}
                onChange={(event) => setRegistryUrl(event.target.value)}
              />
              <Button variant="ghost" onClick={installFromRegistry}>
                Install build kit from registry
              </Button>

              <Textarea
                placeholder="Describe the reusable helper you want Launchpad to learn..."
                value={builderPrompt}
                onChange={(event) => setBuilderPrompt(event.target.value)}
                rows={5}
              />

              <Textarea
                placeholder="Hardening goal for AI repair, for example: make this safer, less hallucination-prone, and compatible with live Cat upload."
                value={repairGoal}
                onChange={(event) => setRepairGoal(event.target.value)}
                rows={3}
              />

              <div className="grid gap-2 sm:grid-cols-2">
                <Button variant="outline" onClick={generateFromPrompt} disabled={busy}>
                  Generate / Revise
                </Button>
                <Button variant="outline" onClick={saveDraft} disabled={busy}>
                  Save draft
                </Button>
                <Button variant="ghost" onClick={() => runChecks(false)} disabled={busy}>
                  Run checks
                </Button>
                <Button variant="ghost" onClick={() => runChecks(true)} disabled={busy}>
                  Live Cat test
                </Button>
                <Button variant="ghost" onClick={runRuntimeHarness} disabled={busy}>
                  Runtime harness
                </Button>
                <Button variant="ghost" onClick={repairDraft} disabled={busy}>
                  Repair with AI
                </Button>
              </div>

              <Button variant="glow" onClick={deployDraft} disabled={busy} className="w-full">
                Deploy build kit to platform
              </Button>
            </div>
          </Card>

          <Card className="p-5">
            <div className="text-xs uppercase tracking-[0.3em] text-ink-400">Build kit incubator</div>
            <div className="mt-3 max-h-[340px] space-y-2 overflow-y-auto pr-1 text-xs">
              {drafts.length === 0 ? (
                <div className="rounded-2xl border border-ink-800 bg-ink-950/60 p-4 text-ink-400">
                  No drafts yet. Start from a blueprint or a prompt.
                </div>
              ) : (
                drafts.map((item) => (
                  <button
                    key={item.slug}
                    className="w-full rounded-2xl border border-ink-800 bg-ink-900/60 px-4 py-3 text-left transition hover:border-ink-600"
                    onClick={() => loadDraft(item.slug)}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-semibold text-ink-100">{item.name}</div>
                      <Badge variant="neutral">{draftFreshness(item.updatedAt)}</Badge>
                    </div>
                    <div className="mt-2 text-[11px] text-ink-400">{item.slug}</div>
                    <div className="mt-2 text-xs text-ink-300">{item.description}</div>
                  </button>
                ))
              )}
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-[0.3em] text-ink-400">
                  Installed studio powers
                </div>
                <div className="mt-2 text-lg font-semibold text-ink-50">
                  What the studio can already do
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={loadPlugins}>
                Refresh runtime
              </Button>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {plugins.length === 0 ? (
                <div className="rounded-2xl border border-ink-800 bg-ink-950/60 p-4 text-sm text-ink-400 md:col-span-2">
                  No build kits available yet.
                </div>
              ) : (
                plugins.map((plugin) => {
                  const capability = inferCapability(plugin);
                  return (
                    <div
                      key={pluginKey(plugin)}
                      className="rounded-3xl border border-ink-800 bg-ink-950/70 p-4"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={capability.variant}>{capability.label}</Badge>
                        <Badge variant={plugin.active ? "glow" : "neutral"}>
                          {plugin.active ? "Live" : "Dormant"}
                        </Badge>
                        {plugin.configurable ? <Badge variant="ember">Configurable</Badge> : null}
                      </div>
                      <div className="mt-3 text-lg font-semibold text-ink-50">
                        {plugin.name ?? "Unnamed build kit"}
                      </div>
                      <div className="mt-2 text-sm text-ink-300">
                        {plugin.description ?? "No description provided."}
                      </div>
                      <div className="mt-3 rounded-2xl border border-ink-800 bg-ink-900/70 px-3 py-2 text-xs text-ink-300">
                        {capability.detail}
                      </div>
                      <div className="mt-4 flex items-center justify-between gap-3">
                        <div className="text-[10px] uppercase tracking-[0.22em] text-ink-500">
                          {plugin.category ?? "General"}
                        </div>
                        <Button
                          variant={plugin.active ? "glow" : "outline"}
                          size="sm"
                          onClick={() => togglePlugin(plugin)}
                        >
                          {plugin.active ? "Enabled" : "Enable"}
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </Card>

          <Card className="p-5">
            <div className="text-xs uppercase tracking-[0.3em] text-ink-400">Creator ladder</div>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-ink-800 bg-ink-950/70 p-4">
                <div className="text-sm font-semibold text-ink-100">Idea to kit</div>
                <div className="mt-2 text-xs text-ink-300">
                  Use natural language to describe a repeatable helper you want inside the studio.
                </div>
              </div>
              <div className="rounded-2xl border border-ink-800 bg-ink-950/70 p-4">
                <div className="text-sm font-semibold text-ink-100">Kit to workflow</div>
                <div className="mt-2 text-xs text-ink-300">
                  Combine uploads, memory, and build kits so the coach can guide richer game patterns.
                </div>
              </div>
              <div className="rounded-2xl border border-ink-800 bg-ink-950/70 p-4">
                <div className="text-sm font-semibold text-ink-100">Workflow to studio habit</div>
                <div className="mt-2 text-xs text-ink-300">
                  Once deployed, the build kit becomes part of the studio’s default capability set.
                </div>
              </div>
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs uppercase tracking-[0.3em] text-ink-400">Build kit workbench</div>
              <div className="text-[10px] text-ink-500">Live draft buffer</div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <Input
                placeholder="Slug"
                value={draft.slug}
                onChange={(event) => setDraft((prev) => ({ ...prev, slug: event.target.value }))}
              />
              <Input
                placeholder="Module name"
                value={draft.moduleName}
                onChange={(event) =>
                  setDraft((prev) => ({ ...prev, moduleName: event.target.value }))
                }
              />
              <Input
                placeholder="Build kit name"
                value={draft.name}
                onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))}
              />
              <Input
                placeholder="Version"
                value={draft.version}
                onChange={(event) => setDraft((prev) => ({ ...prev, version: event.target.value }))}
              />
              <Input
                placeholder="Author name"
                value={draft.authorName}
                onChange={(event) =>
                  setDraft((prev) => ({ ...prev, authorName: event.target.value }))
                }
              />
              <Input
                placeholder="Author URL"
                value={draft.authorUrl}
                onChange={(event) =>
                  setDraft((prev) => ({ ...prev, authorUrl: event.target.value }))
                }
              />
            </div>

            <Textarea
              className="mt-3"
              placeholder="Describe what this build kit should unlock for kids and parents."
              value={draft.description}
              onChange={(event) => setDraft((prev) => ({ ...prev, description: event.target.value }))}
              rows={2}
            />

            <div className="mt-3 grid grid-cols-[52px_1fr] overflow-hidden rounded-3xl border border-ink-800 bg-ink-950/80 font-mono text-xs">
              <pre className="max-h-[460px] overflow-hidden border-r border-ink-800 bg-ink-900/70 px-2 py-3 text-right leading-5 text-ink-500">
                {lineNumbers}
              </pre>
              <textarea
                className="max-h-[460px] min-h-[460px] w-full resize-y bg-transparent px-3 py-3 leading-5 text-ink-100 outline-none"
                spellCheck={false}
                value={draft.source}
                onChange={(event) => setDraft((prev) => ({ ...prev, source: event.target.value }))}
                onKeyDown={(event) => {
                  if (event.key !== "Tab") return;
                  event.preventDefault();
                  const target = event.currentTarget;
                  const start = target.selectionStart;
                  const end = target.selectionEnd;
                  const next = `${draft.source.slice(0, start)}  ${draft.source.slice(end)}`;
                  setDraft((prev) => ({ ...prev, source: next }));
                  requestAnimationFrame(() => {
                    target.selectionStart = start + 2;
                    target.selectionEnd = start + 2;
                  });
                }}
              />
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs uppercase tracking-[0.3em] text-ink-400">
                Build report
              </div>
              {buildReport ? (
                <Badge
                  variant={
                    buildReport.mode === "deploy"
                      ? "ember"
                      : buildReport.mode === "repair"
                        ? "glow"
                        : buildReport.mode === "runtime"
                          ? "ember"
                        : "neutral"
                  }
                >
                  {buildReport.mode}
                </Badge>
              ) : null}
            </div>
            <div className="mt-4 space-y-2">
              {buildReport ? (
                <div className="rounded-2xl border border-ink-800 bg-ink-950/60 px-4 py-4 text-sm text-ink-300">
                  <div className="font-semibold text-ink-100">{buildReport.summary}</div>
                  <div className="mt-1 text-xs text-ink-500">
                    {new Date(buildReport.ranAt).toLocaleString()}
                  </div>
                  <div className="mt-3 grid gap-2">
                    {buildReport.steps.map((step) => (
                      <div
                        key={`${step.label}-${step.status}`}
                        className={`rounded-2xl border px-4 py-3 text-sm ${
                          step.status === "passed"
                            ? "border-glow-500/30 bg-glow-500/10 text-glow-200"
                            : step.status === "failed"
                              ? "border-ember-500/30 bg-ember-500/10 text-ember-200"
                              : "border-ink-800 bg-ink-950/70 text-ink-300"
                        }`}
                      >
                        <div className="font-semibold">{step.label}</div>
                        <div className="mt-1 text-xs">{step.detail}</div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 grid gap-3 lg:grid-cols-2">
                    <div className="rounded-2xl border border-ink-800 bg-ink-900/60 px-4 py-3">
                      <div className="text-[10px] uppercase tracking-[0.24em] text-ink-500">
                        Archive
                      </div>
                      <div className="mt-2 text-xs text-ink-200">
                        {buildReport.archive.filename}
                      </div>
                      <div className="mt-1 text-xs text-ink-400">
                        slug: {buildReport.archive.slug}
                      </div>
                      <div className="mt-1 text-xs text-ink-400">
                        module: {buildReport.archive.moduleName}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-ink-800 bg-ink-900/60 px-4 py-3">
                      <div className="text-[10px] uppercase tracking-[0.24em] text-ink-500">
                        Manifest
                      </div>
                      <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words text-[11px] leading-5 text-ink-300">
                        {JSON.stringify(buildReport.manifest, null, 2)}
                      </pre>
                    </div>
                  </div>
                  {buildReport.notes ? (
                    <div className="mt-3 rounded-2xl border border-ink-800 bg-ink-900/60 px-4 py-3 text-xs text-ink-300">
                      {buildReport.notes}
                    </div>
                  ) : null}
                </div>
              ) : null}
              {builderChecks.length === 0 ? (
                <div className="rounded-2xl border border-ink-800 bg-ink-950/60 px-4 py-4 text-sm text-ink-400">
                  Run checks to see whether the current build kit draft is ready for the live Cat.
                </div>
              ) : (
                builderChecks.map((check) => (
                  <div
                    key={check.label}
                    className={`rounded-2xl border px-4 py-3 text-sm ${
                      check.ok
                        ? "border-glow-500/30 bg-glow-500/10 text-glow-200"
                        : "border-ember-500/30 bg-ember-500/10 text-ember-200"
                    }`}
                  >
                    <div className="font-semibold">{check.label}</div>
                    <div className="mt-1 text-xs">{check.detail}</div>
                  </div>
                ))
              )}
              {status ? (
                <div className="rounded-2xl border border-ink-800 bg-ink-950/60 px-4 py-3 text-sm text-ink-300">
                  {status}
                </div>
              ) : null}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
