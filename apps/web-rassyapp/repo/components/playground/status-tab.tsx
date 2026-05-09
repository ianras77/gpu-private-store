"use client";

import * as React from "react";
import type { StudioProjectSummary } from "@/lib/studio/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

function writerTone(status: string) {
  if (status === "Passed" || status === "Running") return "glow" as const;
  if (status === "Failed") return "ember" as const;
  return "neutral" as const;
}

export function StatusTab() {
  const [status, setStatus] = React.useState<Record<string, unknown> | null>(null);
  const [project, setProject] = React.useState<StudioProjectSummary | null>(null);

  const loadStatus = React.useCallback(async () => {
    const [engineRes, projectRes] = await Promise.all([
      fetch("/api/cat/status"),
      fetch("/api/studio/summary")
    ]);

    if (engineRes.ok) {
      const data = (await engineRes.json()) as Record<string, unknown>;
      setStatus(data);
    }

    if (projectRes.ok) {
      const data = (await projectRes.json()) as { project?: StudioProjectSummary };
      setProject(data.project ?? null);
    }
  }, []);

  React.useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const buildPlan = project?.buildPlan;
  const publishTarget = project?.publishTarget;
  const writerStages = project?.writerStages ?? [];

  return (
    <div className="mt-6 space-y-4">
      <Card>
        <div className="text-xs uppercase tracking-[0.3em] text-ink-400">Studio Pulse</div>
        <div className="mt-3 grid gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-ink-800 bg-ink-950/60 px-3 py-2">
            <div className="text-[10px] uppercase tracking-[0.2em] text-ink-500">Engine status</div>
            <div className="mt-1 text-sm font-semibold text-ink-100">
              {status ? String(status.status ?? "Available") : "Unknown"}
            </div>
          </div>
          <div className="rounded-xl border border-ink-800 bg-ink-950/60 px-3 py-2">
            <div className="text-[10px] uppercase tracking-[0.2em] text-ink-500">Template</div>
            <div className="mt-1 text-sm font-semibold text-ink-100">
              {project?.templatePack?.name ?? "--"}
            </div>
          </div>
          <div className="rounded-xl border border-ink-800 bg-ink-950/60 px-3 py-2">
            <div className="text-[10px] uppercase tracking-[0.2em] text-ink-500">Connection</div>
            <div className="mt-1 text-sm font-semibold text-ink-100">
              {project?.connectionStatus ?? "--"}
            </div>
          </div>
          <div className="rounded-xl border border-ink-800 bg-ink-950/60 px-3 py-2">
            <div className="text-[10px] uppercase tracking-[0.2em] text-ink-500">Publish</div>
            <div className="mt-1 text-sm font-semibold text-ink-100">
              {project?.publishReadiness ?? "--"}
            </div>
          </div>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
        <div className="space-y-4">
          <Card>
            <div className="text-xs uppercase tracking-[0.3em] text-ink-400">Actions</div>
            <div className="mt-4 space-y-3">
              <Button variant="outline" onClick={loadStatus}>
                Refresh studio pulse
              </Button>
              <div className="text-xs text-ink-400">
                This lane now combines engine health with project connection and publish scaffolding.
              </div>
            </div>
          </Card>

          <Card>
            <div className="text-xs uppercase tracking-[0.3em] text-ink-400">Project scaffold</div>
            <div className="mt-4 space-y-3 text-sm text-ink-300">
              <div className="rounded-2xl border border-ink-800 bg-ink-950/70 px-4 py-3">
                <div className="text-[10px] uppercase tracking-[0.24em] text-ink-500">Project</div>
                <div className="mt-1 font-semibold text-ink-100">{project?.title ?? "Loading..."}</div>
                <div className="mt-1 text-xs text-ink-400">{project?.theme ?? "No theme yet"}</div>
              </div>
              <div className="rounded-2xl border border-ink-800 bg-ink-950/70 px-4 py-3">
                <div className="text-[10px] uppercase tracking-[0.24em] text-ink-500">Hero goal</div>
                <div className="mt-1 font-semibold text-ink-100">
                  {project?.heroGoal ?? "Choose one clear player goal"}
                </div>
              </div>
              <div className="rounded-2xl border border-ink-800 bg-ink-950/70 px-4 py-3">
                <div className="text-[10px] uppercase tracking-[0.24em] text-ink-500">World recipe</div>
                <div className="mt-1 font-semibold text-ink-100">
                  {project?.worldRecipe?.headline ?? "Pick a world vibe and map pattern"}
                </div>
                <div className="mt-1 text-[11px] text-ink-400">
                  {project?.worldProfile?.title ?? "--"} · {project?.mapPattern?.title ?? "--"}
                </div>
              </div>
              <div className="rounded-2xl border border-ink-800 bg-ink-950/70 px-4 py-3">
                <div className="text-[10px] uppercase tracking-[0.24em] text-ink-500">Saved shelves</div>
                <div className="mt-1 font-semibold text-ink-100">
                  {project?.selectedAssetPackSlugs?.length
                    ? project.selectedAssetPackSlugs.join(", ")
                    : "No approved shelves yet"}
                </div>
                <div className="mt-1 text-[11px] text-ink-400">
                  {project?.selectedAssetItems?.length ?? 0} local manifests ·{" "}
                  {project?.approvedCodePackages?.length ?? 0} module kits
                </div>
              </div>
              <div className="rounded-2xl border border-ink-800 bg-ink-950/70 px-4 py-3">
                <div className="text-[10px] uppercase tracking-[0.24em] text-ink-500">Collaboration</div>
                <div className="mt-1 font-semibold text-ink-100">
                  {project?.lastEditedBy?.username
                    ? `Last saved by ${project.lastEditedBy.username}`
                    : "Waiting for a teammate save"}
                </div>
              </div>
            </div>
          </Card>

          <Card>
            <div className="text-xs uppercase tracking-[0.3em] text-ink-400">Next actions</div>
            <div className="mt-4 space-y-2">
              {project?.nextActions?.length ? (
                project.nextActions.map((action) => (
                  <div
                    key={action}
                    className="rounded-2xl border border-ink-800 bg-ink-950/70 px-4 py-3 text-sm text-ink-300"
                  >
                    {action}
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-ink-800 bg-ink-950/70 px-4 py-3 text-sm text-ink-400">
                  No project guidance available yet.
                </div>
              )}
            </div>
          </Card>

          <Card>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-[0.3em] text-ink-400">Writer room</div>
                <div className="mt-2 text-lg font-semibold text-ink-50">
                  World-building agents move the project forward in passes
                </div>
                <div className="mt-2 text-sm text-ink-300">
                  Terrain, landmarks, and scenery get their own stages so kids can see the world take shape before we lean too hard on deeper logic.
                </div>
              </div>
              <Badge variant={writerStages.length ? "glow" : "neutral"}>
                {writerStages.length ? `${writerStages.length} stages` : "No stages yet"}
              </Badge>
            </div>

            <div className="mt-4 space-y-3">
              {writerStages.length ? (
                writerStages.map((stage) => (
                  <div
                    key={stage.stageKey}
                    className="rounded-2xl border border-ink-800 bg-ink-950/70 px-4 py-3"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={writerTone(stage.status)}>{stage.status}</Badge>
                      <Badge variant="neutral">{stage.engineProfile}</Badge>
                    </div>
                    <div className="mt-2 text-sm font-semibold text-ink-100">{stage.title}</div>
                    <div className="mt-1 text-xs text-ink-300">{stage.mission}</div>
                    <div className="mt-2 text-[11px] text-ink-400">
                      Output: {stage.outputLabel}. Handoff: {stage.handoffLabel}.
                    </div>
                    <div className="mt-1 text-[11px] text-ink-400">{stage.engineLabel}</div>
                    {stage.latestRunPreview ? (
                      <div className="mt-2 rounded-2xl border border-ink-800 bg-ink-900/60 px-3 py-2 text-[11px] text-ink-300">
                        {stage.latestRunPreview}
                      </div>
                    ) : null}
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-ink-800 bg-ink-950/70 px-4 py-3 text-sm text-ink-400">
                  Promote a thread into a writer room to create the world-building pipeline.
                </div>
              )}
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-[0.3em] text-ink-400">Build plan</div>
                <div className="mt-2 text-lg font-semibold text-ink-50">
                  {buildPlan?.oneLiner ?? "Starter plan loading"}
                </div>
              </div>
              {buildPlan ? <Badge variant="glow">{buildPlan.status}</Badge> : null}
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-ink-800 bg-ink-950/70 p-4">
                <div className="text-[10px] uppercase tracking-[0.24em] text-ink-500">Core loop</div>
                <div className="mt-2 text-sm text-ink-300">{buildPlan?.coreLoop ?? "Not set yet."}</div>
              </div>
              <div className="rounded-2xl border border-ink-800 bg-ink-950/70 p-4">
                <div className="text-[10px] uppercase tracking-[0.24em] text-ink-500">Art direction</div>
                <div className="mt-2 text-sm text-ink-300">
                  {buildPlan?.artDirection?.look
                    ? String(buildPlan.artDirection.look)
                    : project?.templatePack?.artDirection ?? "Not set yet."}
                </div>
              </div>
              <div className="rounded-2xl border border-ink-800 bg-ink-950/70 p-4">
                <div className="text-[10px] uppercase tracking-[0.24em] text-ink-500">Scenes</div>
                <div className="mt-2 space-y-2 text-sm text-ink-300">
                  {buildPlan?.scenes?.length ? (
                    buildPlan.scenes.map((scene) => <div key={scene}>{scene}</div>)
                  ) : (
                    <div>No scenes scaffolded yet.</div>
                  )}
                </div>
              </div>
              <div className="rounded-2xl border border-ink-800 bg-ink-950/70 p-4">
                <div className="text-[10px] uppercase tracking-[0.24em] text-ink-500">Mechanics</div>
                <div className="mt-2 space-y-2 text-sm text-ink-300">
                  {buildPlan?.mechanics?.length ? (
                    buildPlan.mechanics.map((mechanic) => <div key={mechanic}>{mechanic}</div>)
                  ) : (
                    <div>No mechanics scaffolded yet.</div>
                  )}
                </div>
              </div>
              <div className="rounded-2xl border border-ink-800 bg-ink-950/70 p-4">
                <div className="text-[10px] uppercase tracking-[0.24em] text-ink-500">World crew</div>
                <div className="mt-2 space-y-2 text-sm text-ink-300">
                  {project?.worldRecipe?.crewLines?.length ? (
                    project.worldRecipe.crewLines.slice(0, 4).map((line) => <div key={line}>{line}</div>)
                  ) : (
                    <div>No world-building crew recipe yet.</div>
                  )}
                </div>
              </div>
            </div>
          </Card>

          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-[0.3em] text-ink-400">Publish bridge</div>
                <div className="mt-2 text-lg font-semibold text-ink-50">
                  Account-link and publish scaffolding
                </div>
              </div>
              {publishTarget ? <Badge variant="ember">{publishTarget.reviewStatus}</Badge> : null}
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-ink-800 bg-ink-950/70 p-4 text-sm text-ink-300">
                <div className="text-[10px] uppercase tracking-[0.24em] text-ink-500">Auth mode</div>
                <div className="mt-2 font-semibold text-ink-100">{publishTarget?.authMode ?? "--"}</div>
                <div className="mt-2">{publishTarget?.creatorLabel ?? "Waiting for connection scaffolding."}</div>
              </div>
              <div className="rounded-2xl border border-ink-800 bg-ink-950/70 p-4 text-sm text-ink-300">
                <div className="text-[10px] uppercase tracking-[0.24em] text-ink-500">Target place</div>
                <div className="mt-2 font-semibold text-ink-100">
                  {publishTarget?.placeId ? `Place ${publishTarget.placeId}` : "Not linked yet"}
                </div>
                <div className="mt-2">
                  {publishTarget?.universeId ? `Universe ${publishTarget.universeId}` : "Choose a universe after parent sign-in."}
                </div>
              </div>
            </div>

            <pre className="mt-4 whitespace-pre-wrap rounded-2xl border border-ink-800 bg-ink-950/60 p-4 text-xs text-ink-200">
              {status ? JSON.stringify(status, null, 2) : "No engine status available."}
            </pre>
          </Card>
        </div>
      </div>
    </div>
  );
}
