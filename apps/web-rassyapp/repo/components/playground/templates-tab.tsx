"use client";

import * as React from "react";
import type { StudioTemplateSummary } from "@/lib/studio/types";
import type { WorkspaceSummary } from "@/lib/workspace/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

const BASE_THEMES = [
  "Candy sky",
  "Pirate island",
  "Space race",
  "Cozy village",
  "Dino park",
  "Haunted camp"
];

function goalsForTemplate(template: StudioTemplateSummary | null) {
  if (!template) {
    return ["Reach the golden flag", "Rescue the missing pet", "Win the race"];
  }

  switch (template.slug) {
    case "obby-rush":
      return ["Reach the golden flag", "Collect 20 coins", "Beat the lava climb"];
    case "pet-quest":
      return ["Rescue the missing pet", "Help three pets", "Unlock the celebration garden"];
    case "speed-sprint":
      return ["Win the race", "Beat the target time", "Unlock the pro track"];
    case "story-quest":
      return ["Find the magic key", "Solve the final clue", "Unlock the reveal stage"];
    default:
      return ["Reach the goal", "Help a friend", "Unlock the final scene"];
  }
}

function buildStarterPrompt(
  projectTitle: string,
  template: StudioTemplateSummary,
  theme: string,
  goal: string
) {
  return [
    `Use the ${template.name} starter for ${projectTitle}.`,
    `Theme: ${theme}.`,
    `Player goal: ${goal}.`,
    template.starterPrompt,
    "Give me a Roblox-first starter world with a one-line pitch, a three-scene map, three mechanics, one helper NPC, one reward loop, the key Luau tasks, and the exact Roblox Studio places or services to touch next."
  ].join(" ");
}

function buildWorldName(template: StudioTemplateSummary, theme: string) {
  return `${theme} ${template.name}`;
}

export function TemplatesTab({
  summary,
  onJumpToTab,
  onSendToCoach,
  onRefreshSummary
}: {
  summary: WorkspaceSummary | null;
  onJumpToTab?: (tab: "chat" | "worlds" | "assets") => void;
  onSendToCoach?: (prompt: string) => void;
  onRefreshSummary?: () => void | Promise<void>;
}) {
  const projectTitle = summary?.studioProject?.title ?? summary?.workspace.name ?? "Launchpad Project";
  const templates = summary?.studioProject?.availableTemplates ?? [];
  const currentTemplateSlug = summary?.studioProject?.templatePack?.slug ?? templates[0]?.slug ?? null;
  const [selectedTemplateSlug, setSelectedTemplateSlug] = React.useState<string | null>(
    currentTemplateSlug
  );
  const [status, setStatus] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [projectName, setProjectName] = React.useState(projectTitle);

  React.useEffect(() => {
    if (!templates.length) return;
    setSelectedTemplateSlug(currentTemplateSlug ?? templates[0]?.slug ?? null);
  }, [currentTemplateSlug, summary?.studioProject?.updatedAt, templates]);

  const themeChoices = React.useMemo(() => {
    const currentTheme = summary?.studioProject?.theme;
    if (currentTheme && !BASE_THEMES.includes(currentTheme)) {
      return [currentTheme, ...BASE_THEMES];
    }
    return BASE_THEMES;
  }, [summary?.studioProject?.theme]);

  const [selectedTheme, setSelectedTheme] = React.useState(
    summary?.studioProject?.theme ?? themeChoices[0] ?? "Candy sky"
  );

  React.useEffect(() => {
    setSelectedTheme(summary?.studioProject?.theme ?? themeChoices[0] ?? "Candy sky");
  }, [summary?.studioProject?.theme, summary?.studioProject?.updatedAt, themeChoices]);

  const selectedTemplate =
    templates.find((template) => template.slug === selectedTemplateSlug) ?? templates[0] ?? null;
  const goalChoices = React.useMemo(() => goalsForTemplate(selectedTemplate), [selectedTemplate]);
  const [selectedGoal, setSelectedGoal] = React.useState(
    summary?.studioProject?.heroGoal ?? goalChoices[0] ?? "Reach the golden flag"
  );

  React.useEffect(() => {
    setSelectedGoal(summary?.studioProject?.heroGoal ?? goalChoices[0] ?? "Reach the golden flag");
  }, [goalChoices, summary?.studioProject?.heroGoal, summary?.studioProject?.updatedAt]);

  React.useEffect(() => {
    setProjectName(summary?.studioProject?.title ?? projectTitle);
  }, [projectTitle, summary?.studioProject?.title, summary?.studioProject?.updatedAt]);

  const starterWorldName = selectedTemplate ? buildWorldName(selectedTemplate, selectedTheme) : "--";
  const resolvedProjectName = projectName.trim() || starterWorldName;
  const starterPrompt = selectedTemplate
    ? buildStarterPrompt(resolvedProjectName, selectedTemplate, selectedTheme, selectedGoal)
    : null;
  const collaboratorCount = summary?.workspace.collaboratorCount ?? 1;
  const lastEditedBy = summary?.studioProject?.lastEditedBy?.username ?? "a teammate";

  const saveStarter = React.useCallback(
    async (options?: { sendToCoach?: boolean; openAssets?: boolean; openWorlds?: boolean }) => {
      if (!selectedTemplate) return;

      setSaving(true);
      setStatus("Saving shared starter...");

      const response = await fetch("/api/studio/project", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: resolvedProjectName,
          templatePackSlug: selectedTemplate.slug,
          theme: selectedTheme,
          heroGoal: selectedGoal
        })
      }).catch(() => null);

      setSaving(false);

      if (!response) {
        setStatus("Could not save the starter right now.");
        return;
      }

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        setStatus(text || "Could not save the starter right now.");
        return;
      }

      await Promise.resolve(onRefreshSummary?.());
      setStatus(`Starter saved for ${collaboratorCount} co-builders.`);

      if (options?.openAssets) {
        onJumpToTab?.("assets");
      }

      if (options?.openWorlds) {
        onJumpToTab?.("worlds");
      }

      if (options?.sendToCoach && starterPrompt) {
        onSendToCoach?.(starterPrompt);
      }
    },
    [
      collaboratorCount,
      onJumpToTab,
      onRefreshSummary,
      onSendToCoach,
      resolvedProjectName,
      selectedGoal,
      selectedTemplate,
      selectedTheme,
      starterPrompt
    ]
  );

  return (
    <div className="mt-6 space-y-4">
      <Card className="intro-rise p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.3em] text-ink-400">Templates</div>
            <div className="mt-2 text-2xl font-semibold text-ink-50">
              Save a shared Roblox starter, then build on top of it together
            </div>
            <p className="mt-2 max-w-3xl text-sm text-ink-300">
              The starter choice should persist for the whole studio. Everyone should see the same
              template, theme, goal, and build direction when they open the app.
            </p>
          </div>

          <div className="flex flex-wrap gap-2 text-xs">
            <Badge variant="neutral">1 Pick a starter</Badge>
            <Badge variant="neutral">2 Pick a theme</Badge>
            <Badge variant="neutral">3 Pick a goal</Badge>
            <Badge variant="glow">{collaboratorCount} co-builders</Badge>
          </div>
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          <Card className="p-5">
            <div className="text-xs uppercase tracking-[0.3em] text-ink-400">Step 1</div>
            <div className="mt-2 text-lg font-semibold text-ink-50">Pick a Roblox game feeling</div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {templates.map((template) => {
                const isSelected = template.slug === selectedTemplate?.slug;
                const isCurrent = template.slug === currentTemplateSlug;
                return (
                  <button
                    key={template.slug}
                    type="button"
                    onClick={() => setSelectedTemplateSlug(template.slug)}
                    className={`rounded-3xl border p-4 text-left transition ${
                      isSelected
                        ? "border-glow-500/40 bg-glow-500/12 shadow-glow"
                        : "border-ink-800 bg-ink-950/70 hover:border-ink-600"
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-lg font-semibold text-ink-100">{template.name}</div>
                      {isCurrent ? <Badge variant="glow">Saved starter</Badge> : null}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.16em] text-ink-500">
                      <span>{template.genre}</span>
                      <span>{template.ageBand}</span>
                      <span>{template.difficulty}</span>
                    </div>
                    <div className="mt-3 text-sm text-ink-300">{template.summary}</div>
                    <div className="mt-4 text-[10px] uppercase tracking-[0.22em] text-glow-300">
                      Roblox starter mechanics
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
                  </button>
                );
              })}
            </div>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="p-5">
              <div className="text-xs uppercase tracking-[0.3em] text-ink-400">Step 2</div>
              <div className="mt-2 text-lg font-semibold text-ink-50">Pick a theme</div>
              <div className="mt-4 flex flex-wrap gap-2">
                {themeChoices.map((theme) => (
                  <button
                    key={theme}
                    type="button"
                    onClick={() => setSelectedTheme(theme)}
                    className={`rounded-full border px-3 py-2 text-sm transition ${
                      selectedTheme === theme
                        ? "border-glow-500/40 bg-glow-500/12 text-ink-50"
                        : "border-ink-800 bg-ink-950/70 text-ink-300 hover:border-ink-600"
                    }`}
                  >
                    {theme}
                  </button>
                ))}
              </div>
            </Card>

            <Card className="p-5">
              <div className="text-xs uppercase tracking-[0.3em] text-ink-400">Step 3</div>
              <div className="mt-2 text-lg font-semibold text-ink-50">Pick one hero goal</div>
              <div className="mt-4 space-y-2">
                {goalChoices.map((goal) => (
                  <button
                    key={goal}
                    type="button"
                    onClick={() => setSelectedGoal(goal)}
                    className={`w-full rounded-2xl border px-3 py-3 text-left text-sm transition ${
                      selectedGoal === goal
                        ? "border-glow-500/40 bg-glow-500/12 text-ink-50"
                        : "border-ink-800 bg-ink-950/70 text-ink-300 hover:border-ink-600"
                    }`}
                  >
                    {goal}
                  </button>
                ))}
              </div>
            </Card>
          </div>
        </div>

        <div className="space-y-4">
          <Card className="p-5">
            <div className="text-xs uppercase tracking-[0.3em] text-ink-400">Shared starter</div>
            <div className="mt-2 text-xl font-semibold text-ink-50">{starterWorldName}</div>
            <div className="mt-2 text-sm text-ink-300">
              {selectedTemplate?.summary ??
                "Pick a starter to see the fast path from idea to playable Roblox world."}
            </div>

            <div className="mt-4 space-y-3">
              <div>
                <div className="mb-2 text-[10px] uppercase tracking-[0.24em] text-ink-500">World name</div>
                <Input
                  value={projectName}
                  onChange={(event) => setProjectName(event.target.value)}
                  placeholder={starterWorldName}
                />
              </div>
            </div>

            <div className="mt-4 space-y-3 text-sm text-ink-300">
              <div className="rounded-2xl border border-ink-800 bg-ink-950/70 px-4 py-3">
                <div className="text-[10px] uppercase tracking-[0.24em] text-ink-500">Core loop</div>
                <div className="mt-2">
                  {selectedTemplate
                    ? `${selectedTemplate.genre} play with ${selectedTemplate.primaryMechanics
                        .slice(0, 2)
                        .join(" and ")}.`
                    : "Choose a starter first."}
                </div>
              </div>
              <div className="rounded-2xl border border-ink-800 bg-ink-950/70 px-4 py-3">
                <div className="text-[10px] uppercase tracking-[0.24em] text-ink-500">Scene board</div>
                <div className="mt-2 space-y-2">
                  {selectedTemplate?.starterScenes?.length ? (
                    selectedTemplate.starterScenes.map((scene) => <div key={scene}>{scene}</div>)
                  ) : (
                    <div>Scenes will appear here.</div>
                  )}
                </div>
              </div>
              <div className="rounded-2xl border border-ink-800 bg-ink-950/70 px-4 py-3">
                <div className="text-[10px] uppercase tracking-[0.24em] text-ink-500">Goal</div>
                <div className="mt-2">{selectedGoal}</div>
              </div>
              <div className="rounded-2xl border border-ink-800 bg-ink-950/70 px-4 py-3">
                <div className="text-[10px] uppercase tracking-[0.24em] text-ink-500">Collaboration</div>
                <div className="mt-2">Last saved by {lastEditedBy}. Everyone in this studio sees the same starter.</div>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              <Button
                variant="outline"
                className="w-full"
                onClick={() => void saveStarter()}
                disabled={!selectedTemplate || saving}
              >
                {saving ? "Saving starter..." : "Save shared starter"}
              </Button>
              <Button
                variant="glow"
                className="w-full"
                onClick={() => void saveStarter({ sendToCoach: true })}
                disabled={!starterPrompt || saving}
              >
                Save and send to game coach
              </Button>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => void saveStarter({ openWorlds: true })}
                disabled={!selectedTemplate || saving}
              >
                Save and shape the world
              </Button>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => void saveStarter({ openAssets: true })}
                disabled={!selectedTemplate || saving}
              >
                Save and open asset shelf
              </Button>
            </div>

            {status ? (
              <div className="mt-4 rounded-2xl border border-ink-800 bg-ink-950/70 px-3 py-3 text-sm text-ink-300">
                {status}
              </div>
            ) : null}
          </Card>
        </div>
      </div>
    </div>
  );
}
