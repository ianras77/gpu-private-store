"use client";

import * as React from "react";
import { Download, PackageCheck, ShieldCheck, Wrench } from "lucide-react";
import type { WorkspaceSummary } from "@/lib/workspace/types";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type ExportPreview = {
  filename: string;
  manifest: {
    handoffMode: string;
    project: {
      title: string;
      template: string;
      theme: string;
      heroGoal?: string | null;
      worldRecipe?: string | null;
    };
    studioBoundary: {
      robloxAuth: string;
      publish: string;
      launchpadWritesTo: string;
    };
    counts: {
      zones: number;
      assetItems: number;
      codePackages: number;
      scripts: number;
    };
  };
  checks: Array<{
    label: string;
    status: "passed" | "warning";
    detail: string;
  }>;
  entries: Array<{
    name: string;
    bytes: number;
  }>;
};

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  return `${Math.round(bytes / 102.4) / 10} KB`;
}

export function StudioHandoffTab({ summary }: { summary: WorkspaceSummary | null }) {
  const [preview, setPreview] = React.useState<ExportPreview | null>(null);
  const [status, setStatus] = React.useState("Preparing Rojo package preview...");

  React.useEffect(() => {
    let active = true;

    const loadPreview = async () => {
      setStatus("Preparing Rojo package preview...");
      const response = await fetch("/api/studio/rojo-export?format=json").catch(() => null);

      if (!active) return;

      if (!response) {
        setStatus("Could not reach the Rojo export route.");
        return;
      }

      if (!response.ok) {
        setStatus(
          response.status === 401
            ? "Sign in again to export this project."
            : "Rojo export preview failed."
        );
        return;
      }

      const data = (await response.json()) as ExportPreview;
      setPreview(data);
      setStatus("Rojo package preview ready.");
    };

    void loadPreview();
    return () => {
      active = false;
    };
  }, [summary?.studioProject?.updatedAt]);

  const project = summary?.studioProject;
  const downloadHref = "/api/studio/rojo-export";
  const visibleEntries = preview?.entries.slice(0, 8) ?? [];

  return (
    <div className="mt-6 space-y-4">
      <Card className="intro-rise p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.3em] text-ink-400">Studio Handoff</div>
            <div className="mt-2 text-2xl font-semibold text-ink-50">
              Export one Rojo project package for Roblox Studio
            </div>
            <p className="mt-2 max-w-3xl text-sm text-ink-300">
              Launchpad makes the game plan, reviewed Luau, asset manifest, and build notes. Roblox
              Studio handles account login, place selection, Rojo sync, review, and publish.
            </p>
          </div>

          <div className="flex flex-wrap gap-2 text-xs">
            <Badge variant="glow">Rojo handoff</Badge>
            <Badge variant="neutral">Studio-owned publish</Badge>
            <Badge variant="neutral">One active project</Badge>
          </div>
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <Card className="p-5">
            <div className="flex items-start gap-3">
              <PackageCheck className="mt-1 h-5 w-5 text-glow-300" />
              <div>
                <div className="text-lg font-semibold text-ink-50">Current package</div>
                <div className="mt-1 text-sm text-ink-300">{status}</div>
              </div>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-4">
              <div className="rounded-2xl border border-ink-800 bg-ink-950/70 px-4 py-3">
                <div className="text-[10px] uppercase tracking-[0.24em] text-ink-500">Project</div>
                <div className="mt-1 text-sm font-semibold text-ink-100">
                  {preview?.manifest.project.title ?? project?.title ?? "Launchpad Project"}
                </div>
              </div>
              <div className="rounded-2xl border border-ink-800 bg-ink-950/70 px-4 py-3">
                <div className="text-[10px] uppercase tracking-[0.24em] text-ink-500">Template</div>
                <div className="mt-1 text-sm font-semibold text-ink-100">
                  {preview?.manifest.project.template ?? project?.templatePack?.name ?? "Starter"}
                </div>
              </div>
              <div className="rounded-2xl border border-ink-800 bg-ink-950/70 px-4 py-3">
                <div className="text-[10px] uppercase tracking-[0.24em] text-ink-500">Zones</div>
                <div className="mt-1 text-lg font-semibold text-ink-100">
                  {preview?.manifest.counts.zones ??
                    project?.worldRecipe?.zoneSequence.length ??
                    "--"}
                </div>
              </div>
              <div className="rounded-2xl border border-ink-800 bg-ink-950/70 px-4 py-3">
                <div className="text-[10px] uppercase tracking-[0.24em] text-ink-500">Modules</div>
                <div className="mt-1 text-lg font-semibold text-ink-100">
                  {preview?.manifest.counts.codePackages ??
                    project?.approvedCodePackages.length ??
                    "--"}
                </div>
              </div>
            </div>

            <div className="mt-5 rounded-3xl border border-ink-800 bg-ink-950/70 p-4">
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-1 h-5 w-5 text-glow-300" />
                <div>
                  <div className="text-sm font-semibold text-ink-100">
                    Roblox connection boundary
                  </div>
                  <div className="mt-2 text-sm text-ink-300">
                    {preview?.manifest.studioBoundary.robloxAuth ?? "Roblox Studio handles login."}{" "}
                    {preview?.manifest.studioBoundary.publish ?? "Roblox Studio handles publish."}
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-5">
              <a
                href={downloadHref}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-glow-500 px-5 text-base font-semibold text-ink-900 shadow-glow transition hover:bg-glow-400"
              >
                <Download className="h-5 w-5" />
                Download Rojo package
              </a>
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-start gap-3">
              <Wrench className="mt-1 h-5 w-5 text-ember-300" />
              <div>
                <div className="text-lg font-semibold text-ink-50">What Studio receives</div>
                <div className="mt-1 text-sm text-ink-300">
                  The package keeps generated content inside a Launchpad namespace so Studio edits
                  stay reviewable and easy to remove.
                </div>
              </div>
            </div>

            <div className="mt-4 space-y-2">
              {visibleEntries.length ? (
                visibleEntries.map((entry) => (
                  <div
                    key={entry.name}
                    className="flex items-center justify-between gap-4 rounded-2xl border border-ink-800 bg-ink-950/70 px-3 py-2 text-xs"
                  >
                    <span className="truncate text-ink-200">{entry.name}</span>
                    <span className="shrink-0 text-ink-500">{formatBytes(entry.bytes)}</span>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-ink-800 bg-ink-950/70 px-3 py-3 text-sm text-ink-400">
                  Package files will appear after the preview route responds.
                </div>
              )}
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="p-5">
            <div className="text-xs uppercase tracking-[0.3em] text-ink-400">Readiness</div>
            <div className="mt-2 text-lg font-semibold text-ink-50">Export checks</div>
            <div className="mt-4 space-y-3">
              {(preview?.checks ?? []).map((check) => (
                <div
                  key={check.label}
                  className="rounded-2xl border border-ink-800 bg-ink-950/70 px-3 py-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-ink-100">{check.label}</div>
                    <Badge variant={check.status === "passed" ? "glow" : "ember"}>
                      {check.status}
                    </Badge>
                  </div>
                  <div className="mt-2 text-xs text-ink-300">{check.detail}</div>
                </div>
              ))}
              {!preview?.checks.length ? (
                <div className="rounded-2xl border border-ink-800 bg-ink-950/70 px-3 py-3 text-sm text-ink-400">
                  Waiting for export checks.
                </div>
              ) : null}
            </div>
          </Card>

          <Card className="p-5">
            <div className="text-xs uppercase tracking-[0.3em] text-ink-400">Use in Studio</div>
            <div className="mt-3 space-y-2 text-sm text-ink-300">
              <div className="rounded-2xl border border-ink-800 bg-ink-950/70 px-3 py-3">
                Run <span className="font-semibold text-ink-100">rojo serve</span> from the exported
                folder.
              </div>
              <div className="rounded-2xl border border-ink-800 bg-ink-950/70 px-3 py-3">
                Connect the Rojo Studio plugin while signed in to the right Roblox account.
              </div>
              <div className="rounded-2xl border border-ink-800 bg-ink-950/70 px-3 py-3">
                Publish from Studio only after reviewing the Launchpad namespace and build notes.
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
