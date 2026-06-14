"use client";

import { Code2, Cuboid, MessageSquareText, PackageOpen } from "lucide-react";
import type { StudioGameSectionSummary } from "@/lib/studio/types";
import type { WorkspaceSummary } from "@/lib/workspace/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

function sectionTone(section: StudioGameSectionSummary) {
  if (section.status === "Ready to build") return "glow";
  if (section.status === "Needs code review") return "ember";
  return "neutral";
}

function sectionLabel(sectionType: StudioGameSectionSummary["sectionType"]) {
  if (sectionType === "spawn") return "Spawn";
  if (sectionType === "route") return "Route";
  if (sectionType === "finale") return "Finale";
  return "Systems";
}

function firstCodeLine(section: StudioGameSectionSummary) {
  return section.codeTasks[0] ?? "Ask the coach for the first Luau task.";
}

export function GameSectionsTab({
  summary,
  onSendToCoach,
  onJumpToTab
}: {
  summary: WorkspaceSummary | null;
  onSendToCoach?: (prompt: string) => void;
  onJumpToTab?: (tab: "worlds" | "assets" | "handoff") => void;
}) {
  const project = summary?.studioProject ?? null;
  const sections = project?.gameSections ?? [];
  const readyCount = sections.filter((section) => section.status === "Ready to build").length;
  const assetCount = sections.reduce((total, section) => total + section.linkedAssets.length, 0);
  const codeTaskCount = sections.reduce((total, section) => total + section.codeTasks.length, 0);
  const primarySection = sections[0] ?? null;

  return (
    <div className="mt-6 space-y-4">
      <Card className="intro-rise p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.3em] text-ink-400">Game Sections</div>
            <div className="mt-2 text-2xl font-semibold text-ink-50">
              Focus the next build pass on one Roblox section
            </div>
            <p className="mt-2 max-w-3xl text-sm text-ink-300">
              {project?.title ?? "Launchpad Project"} is split into Studio paths, visible world
              areas, linked shelves, and Luau tasks.
            </p>
          </div>

          <div className="flex flex-wrap gap-2 text-xs">
            <Badge variant="glow">{readyCount} ready</Badge>
            <Badge variant="neutral">{assetCount} linked assets</Badge>
            <Badge variant="neutral">{codeTaskCount} Luau tasks</Badge>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <div className="rounded-2xl border border-ink-800 bg-ink-950/60 px-4 py-3">
            <div className="text-[10px] uppercase tracking-[0.24em] text-ink-500">Template</div>
            <div className="mt-1 text-lg font-semibold text-ink-100">
              {project?.templatePack?.name ?? "Starter"}
            </div>
          </div>
          <div className="rounded-2xl border border-ink-800 bg-ink-950/60 px-4 py-3">
            <div className="text-[10px] uppercase tracking-[0.24em] text-ink-500">World</div>
            <div className="mt-1 text-sm font-semibold text-ink-100">
              {project?.worldRecipe?.headline ?? "Map Forge"}
            </div>
          </div>
          <div className="rounded-2xl border border-ink-800 bg-ink-950/60 px-4 py-3">
            <div className="text-[10px] uppercase tracking-[0.24em] text-ink-500">First path</div>
            <div className="mt-1 break-all text-sm font-semibold text-ink-100">
              {primarySection?.studioPath ?? "Workspace/LaunchpadWorld"}
            </div>
          </div>
          <div className="rounded-2xl border border-ink-800 bg-ink-950/60 px-4 py-3">
            <div className="text-[10px] uppercase tracking-[0.24em] text-ink-500">Export</div>
            <div className="mt-1 text-lg font-semibold text-ink-100">
              {project?.publishReadiness ?? "Planning"}
            </div>
          </div>
        </div>
      </Card>

      {sections.length ? (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="grid gap-4 lg:grid-cols-2">
            {sections.map((section) => (
              <Card key={section.slug} className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={sectionTone(section)}>{section.status}</Badge>
                      <Badge variant="neutral">{sectionLabel(section.sectionType)}</Badge>
                    </div>
                    <div className="mt-3 text-xl font-semibold text-ink-50">{section.title}</div>
                    <div className="mt-2 text-sm text-ink-300">{section.playerGoal}</div>
                  </div>
                  <Cuboid className="h-5 w-5 text-glow-300" />
                </div>

                <div className="mt-4 rounded-2xl border border-ink-800 bg-ink-950/70 px-3 py-3">
                  <div className="text-[10px] uppercase tracking-[0.22em] text-ink-500">
                    Studio path
                  </div>
                  <div className="mt-1 break-all text-sm font-semibold text-ink-100">
                    {section.studioPath}
                  </div>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="rounded-2xl border border-ink-800 bg-ink-950/70 px-3 py-3">
                    <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-ink-500">
                      <PackageOpen className="h-3.5 w-3.5" />
                      Assets
                    </div>
                    <div className="mt-2 space-y-2">
                      {section.linkedAssets.length ? (
                        section.linkedAssets.slice(0, 3).map((asset) => (
                          <div key={asset.slug} className="text-xs text-ink-300">
                            <span className="font-semibold text-ink-100">{asset.title}</span>
                            <div className="mt-0.5 text-[11px] text-ink-500">
                              {asset.localBundleKey}
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="text-xs text-ink-400">No shelf linked yet.</div>
                      )}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-ink-800 bg-ink-950/70 px-3 py-3">
                    <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-ink-500">
                      <Code2 className="h-3.5 w-3.5" />
                      Code
                    </div>
                    <div className="mt-2 break-words text-xs text-ink-300">
                      {firstCodeLine(section)}
                    </div>
                  </div>
                </div>

                {section.sceneBeats.length ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {section.sceneBeats.slice(0, 4).map((beat) => (
                      <span
                        key={beat}
                        className="rounded-full border border-ink-700 bg-ink-950/70 px-2 py-1 text-[11px] text-ink-300"
                      >
                        {beat}
                      </span>
                    ))}
                  </div>
                ) : null}

                <div className="mt-5 flex flex-wrap gap-2">
                  <Button
                    variant="glow"
                    size="sm"
                    onClick={() => onSendToCoach?.(section.coachPrompt)}
                  >
                    <MessageSquareText className="h-4 w-4" />
                    Ask coach
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => onJumpToTab?.("handoff")}>
                    Studio package
                  </Button>
                </div>
              </Card>
            ))}
          </div>

          <div className="space-y-4">
            <Card className="p-5">
              <div className="text-xs uppercase tracking-[0.3em] text-ink-400">Build order</div>
              <div className="mt-2 text-lg font-semibold text-ink-50">Roblox Studio paths</div>
              <div className="mt-4 space-y-2">
                {sections.map((section, index) => (
                  <div
                    key={section.slug}
                    className="rounded-2xl border border-ink-800 bg-ink-950/70 px-3 py-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-semibold text-ink-100">
                        {index + 1}. {section.title}
                      </div>
                      <Badge variant={sectionTone(section)}>
                        {sectionLabel(section.sectionType)}
                      </Badge>
                    </div>
                    <div className="mt-2 break-all text-xs text-ink-400">{section.studioPath}</div>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="p-5">
              <div className="text-xs uppercase tracking-[0.3em] text-ink-400">Next controls</div>
              <div className="mt-3 grid gap-2">
                <Button variant="outline" onClick={() => onJumpToTab?.("worlds")}>
                  Tune map
                </Button>
                <Button variant="outline" onClick={() => onJumpToTab?.("assets")}>
                  Change shelves
                </Button>
                <Button variant="glow" onClick={() => onJumpToTab?.("handoff")}>
                  Open Studio package
                </Button>
              </div>
            </Card>
          </div>
        </div>
      ) : (
        <Card className="p-5">
          <div className="text-lg font-semibold text-ink-50">No sections yet</div>
          <div className="mt-2 text-sm text-ink-300">
            Pick a starter and map recipe so Launchpad can split the game into Studio sections.
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => onJumpToTab?.("worlds")}>
              Shape the world
            </Button>
            <Button variant="outline" onClick={() => onJumpToTab?.("assets")}>
              Pick shelves
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
