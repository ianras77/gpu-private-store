"use client";

import * as React from "react";
import type { WorkspaceSummary } from "@/lib/workspace/types";
import {
  buildWorldRecipe,
  listMapPatternsForTemplate,
  listWorldProfilesForTemplate
} from "@/lib/studio/worlds";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

function buildWorldPrompt(
  projectTitle: string,
  recipe:
    | {
        promptLines: string[];
        crewLines: string[];
      }
    | null
    | undefined
) {
  if (!recipe) return null;
  return [
    `Build the world for ${projectTitle}.`,
    recipe.promptLines.join(" "),
    `World crew: ${recipe.crewLines.slice(0, 3).join(" | ")}.`,
    "Give me a Roblox-first terrain pass, landmark pass, scenery pass, the exact Studio containers to touch, and the first visible build order."
  ].join(" ");
}

export function WorldForgeTab({
  summary,
  onJumpToTab,
  onSendToCoach,
  onRefreshSummary
}: {
  summary: WorkspaceSummary | null;
  onJumpToTab?: (tab: "chat" | "assets") => void;
  onSendToCoach?: (prompt: string) => void;
  onRefreshSummary?: () => void | Promise<void>;
}) {
  const projectTitle = summary?.studioProject?.title ?? summary?.workspace.name ?? "Launchpad Project";
  const savedProject = summary?.studioProject ?? null;
  const templateSlug = summary?.studioProject?.templatePack?.slug ?? null;
  const selectedAssetPackSlugs = summary?.studioProject?.selectedAssetPackSlugs ?? [];
  const currentProfileSlug = summary?.studioProject?.worldProfileSlug ?? null;
  const currentMapPatternSlug = summary?.studioProject?.mapPatternSlug ?? null;
  const [status, setStatus] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  const profileChoices = React.useMemo(
    () => listWorldProfilesForTemplate(templateSlug),
    [templateSlug]
  );
  const [selectedProfileSlug, setSelectedProfileSlug] = React.useState(
    currentProfileSlug ?? profileChoices[0]?.slug ?? null
  );

  React.useEffect(() => {
    setSelectedProfileSlug(currentProfileSlug ?? profileChoices[0]?.slug ?? null);
  }, [currentProfileSlug, profileChoices, summary?.studioProject?.updatedAt]);

  const patternChoices = React.useMemo(
    () =>
      listMapPatternsForTemplate({
        templateSlug,
        worldProfileSlug: selectedProfileSlug
      }),
    [selectedProfileSlug, templateSlug]
  );
  const [selectedMapPatternSlug, setSelectedMapPatternSlug] = React.useState(
    currentMapPatternSlug ?? patternChoices[0]?.slug ?? null
  );

  React.useEffect(() => {
    if (patternChoices.some((pattern) => pattern.slug === selectedMapPatternSlug)) return;
    const nextCurrent = patternChoices.some((pattern) => pattern.slug === currentMapPatternSlug)
      ? currentMapPatternSlug
      : null;
    setSelectedMapPatternSlug(nextCurrent ?? patternChoices[0]?.slug ?? null);
  }, [currentMapPatternSlug, patternChoices, selectedMapPatternSlug, summary?.studioProject?.updatedAt]);

  const previewRecipe = React.useMemo(() => {
    if (!selectedProfileSlug || !selectedMapPatternSlug) return null;
    return buildWorldRecipe({
      templateSlug,
      worldProfileSlug: selectedProfileSlug,
      mapPatternSlug: selectedMapPatternSlug,
      theme: summary?.studioProject?.theme ?? null,
      heroGoal: summary?.studioProject?.heroGoal ?? null,
      selectedAssetPackSlugs
    });
  }, [
    selectedAssetPackSlugs,
    selectedMapPatternSlug,
    selectedProfileSlug,
    summary?.studioProject?.heroGoal,
    summary?.studioProject?.theme,
    templateSlug
  ]);

  const saveWorld = React.useCallback(
    async (options?: { openAssets?: boolean; sendToCoach?: boolean }) => {
      if (!selectedProfileSlug || !selectedMapPatternSlug) return;

      setSaving(true);
      setStatus("Saving shared world recipe...");
      const response = await fetch("/api/studio/project", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          worldProfileSlug: selectedProfileSlug,
          mapPatternSlug: selectedMapPatternSlug
        })
      }).catch(() => null);
      setSaving(false);

      if (!response) {
        setStatus("Could not save the world recipe right now.");
        return;
      }

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        setStatus(text || "Could not save the world recipe right now.");
        return;
      }

      await Promise.resolve(onRefreshSummary?.());
      setStatus("Shared world recipe saved.");

      if (options?.openAssets) {
        onJumpToTab?.("assets");
      }

      if (options?.sendToCoach) {
        const recipeForCoach =
          savedProject?.worldRecipe &&
          savedProject.worldProfileSlug === selectedProfileSlug &&
          savedProject.mapPatternSlug === selectedMapPatternSlug
            ? savedProject.worldRecipe
            : previewRecipe;
        const prompt = buildWorldPrompt(projectTitle, recipeForCoach);
        if (prompt) {
          onSendToCoach?.(prompt);
        }
      }
    },
    [
      onJumpToTab,
      onRefreshSummary,
      onSendToCoach,
      previewRecipe,
      projectTitle,
      savedProject,
      selectedMapPatternSlug,
      selectedProfileSlug,
    ]
  );

  const savedProfileTitle = savedProject?.worldProfile?.title ?? "No saved world";
  const savedPatternTitle = savedProject?.mapPattern?.title ?? "No saved pattern";

  return (
    <div className="mt-6 space-y-4">
      <Card className="intro-rise p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.3em] text-ink-400">Map Forge</div>
            <div className="mt-2 text-2xl font-semibold text-ink-50">
              Lock the world vibe and route shape before the agents start building
            </div>
            <p className="mt-2 max-w-3xl text-sm text-ink-300">
              This shared recipe is the bridge between a kid idea and the terrain, landmark, and
              scenery crew. Save the biome and map pattern first, then let the studio build in passes.
            </p>
          </div>

          <div className="flex flex-wrap gap-2 text-xs">
            <Badge variant="neutral">{profileChoices.length} world profiles</Badge>
            <Badge variant="neutral">{patternChoices.length} map patterns</Badge>
            <Badge variant="glow">{selectedAssetPackSlugs.length} saved shelves</Badge>
          </div>
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <Card className="p-5">
            <div className="text-xs uppercase tracking-[0.3em] text-ink-400">Step 1</div>
            <div className="mt-2 text-lg font-semibold text-ink-50">Pick a world profile</div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {profileChoices.map((profile) => {
                const isSelected = profile.slug === selectedProfileSlug;
                const isCurrent = profile.slug === currentProfileSlug;
                return (
                  <button
                    key={profile.slug}
                    type="button"
                    onClick={() => setSelectedProfileSlug(profile.slug)}
                    className={`rounded-3xl border p-4 text-left transition ${
                      isSelected
                        ? "border-glow-500/40 bg-glow-500/12 shadow-glow"
                        : "border-ink-800 bg-ink-950/70 hover:border-ink-600"
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-lg font-semibold text-ink-100">{profile.title}</div>
                      {isCurrent ? <Badge variant="glow">Saved world</Badge> : null}
                    </div>
                    <div className="mt-2 text-sm text-ink-300">{profile.summary}</div>
                    <div className="mt-3 text-[11px] uppercase tracking-[0.18em] text-glow-300">
                      {profile.kidHook}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {profile.biomeTags.slice(0, 4).map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full border border-ink-700 bg-ink-900/80 px-2 py-1 text-[11px] text-ink-300"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </button>
                );
              })}
            </div>
          </Card>

          <Card className="p-5">
            <div className="text-xs uppercase tracking-[0.3em] text-ink-400">Step 2</div>
            <div className="mt-2 text-lg font-semibold text-ink-50">Pick a map pattern</div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {patternChoices.map((pattern) => {
                const isSelected = pattern.slug === selectedMapPatternSlug;
                const isCurrent = pattern.slug === currentMapPatternSlug;
                return (
                  <button
                    key={pattern.slug}
                    type="button"
                    onClick={() => setSelectedMapPatternSlug(pattern.slug)}
                    className={`rounded-3xl border p-4 text-left transition ${
                      isSelected
                        ? "border-glow-500/40 bg-glow-500/12 shadow-glow"
                        : "border-ink-800 bg-ink-950/70 hover:border-ink-600"
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-lg font-semibold text-ink-100">{pattern.title}</div>
                      {isCurrent ? <Badge variant="glow">Saved pattern</Badge> : null}
                    </div>
                    <div className="mt-2 text-sm text-ink-300">{pattern.summary}</div>
                    <div className="mt-3 text-[11px] text-ink-400">{pattern.spawnDescription}</div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {pattern.worldLayers.slice(0, 4).map((layer) => (
                        <span
                          key={layer}
                          className="rounded-full border border-ink-700 bg-ink-900/80 px-2 py-1 text-[11px] text-ink-300"
                        >
                          {layer}
                        </span>
                      ))}
                    </div>
                  </button>
                );
              })}
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="p-5">
            <div className="text-xs uppercase tracking-[0.3em] text-ink-400">Shared save</div>
            <div className="mt-2 text-lg font-semibold text-ink-50">{savedProfileTitle}</div>
            <div className="mt-1 text-sm text-ink-300">{savedPatternTitle}</div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button onClick={() => saveWorld()} disabled={saving || !selectedProfileSlug || !selectedMapPatternSlug}>
                {saving ? "Saving..." : "Save shared world"}
              </Button>
              <Button
                variant="outline"
                onClick={() => saveWorld({ openAssets: true })}
                disabled={saving || !selectedProfileSlug || !selectedMapPatternSlug}
              >
                Save and open shelves
              </Button>
              <Button
                variant="ghost"
                onClick={() => saveWorld({ sendToCoach: true })}
                disabled={saving || !selectedProfileSlug || !selectedMapPatternSlug}
              >
                Build my world
              </Button>
            </div>
            {status ? <div className="mt-3 text-sm text-ink-300">{status}</div> : null}
          </Card>

          <Card className="p-5">
            <div className="text-xs uppercase tracking-[0.3em] text-ink-400">Recipe preview</div>
            <div className="mt-2 text-lg font-semibold text-ink-50">
              {previewRecipe?.headline ?? "Choose a world profile and map pattern"}
            </div>
            {previewRecipe ? (
              <div className="mt-4 space-y-4 text-sm text-ink-300">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.22em] text-ink-500">Zone order</div>
                  <div className="mt-2 space-y-1">
                    {previewRecipe.zoneSequence.map((zone) => (
                      <div key={zone}>{zone}</div>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="text-[10px] uppercase tracking-[0.22em] text-ink-500">Hero landmarks</div>
                  <div className="mt-2 space-y-1">
                    {previewRecipe.landmarkQueue.slice(0, 4).map((line) => (
                      <div key={line}>{line}</div>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="text-[10px] uppercase tracking-[0.22em] text-ink-500">Recommended pack mix</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {previewRecipe.recommendedAssetPackTitles.slice(0, 8).map((title) => (
                      <Badge key={title} variant="neutral">
                        {title}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="text-[10px] uppercase tracking-[0.22em] text-ink-500">World crew</div>
                  <div className="mt-2 space-y-2">
                    {previewRecipe.crewLines.map((line) => (
                      <div
                        key={line}
                        className="rounded-2xl border border-ink-800 bg-ink-900/60 px-3 py-2 text-[12px]"
                      >
                        {line}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-4 text-sm text-ink-400">
                Pick a world profile to preview the terrain, landmark, and scenery recipe.
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
