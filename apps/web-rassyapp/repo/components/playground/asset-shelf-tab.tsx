"use client";

import * as React from "react";
import { CURATED_ASSET_PACKS, type ApprovedAssetPack } from "@/lib/studio/assets";
import type { WorkspaceSummary } from "@/lib/workspace/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

function buildAssetPrompt(
  projectTitle: string,
  templateName: string,
  pack: ApprovedAssetPack,
  worldHeadline?: string | null
) {
  return [
    `Use the ${pack.title} shelf in ${projectTitle}.`,
    `Current Roblox starter: ${templateName}.`,
    worldHeadline ? `Current world recipe: ${worldHeadline}.` : null,
    `Add these ideas where they fit best: ${pack.sampleItems.slice(0, 3).join(", ")}.`,
    `Use the local catalog bundles ${pack.items
      .slice(0, 3)
      .map((item) => item.localBundleKey)
      .join(", ")} where they make sense.`,
    "Keep the result simple to apply in Roblox Studio, kid-friendly in tone, and explicit about which scenes, objects, local bundles, and Luau tasks should change."
  ]
    .filter(Boolean)
    .join(" ");
}

export function AssetShelfTab({
  summary,
  onSendToCoach,
  onRefreshSummary
}: {
  summary: WorkspaceSummary | null;
  onSendToCoach?: (prompt: string) => void;
  onRefreshSummary?: () => void | Promise<void>;
}) {
  const [file, setFile] = React.useState<File | null>(null);
  const [batchFiles, setBatchFiles] = React.useState<File[]>([]);
  const [url, setUrl] = React.useState("");
  const [status, setStatus] = React.useState<string | null>(null);
  const [allowedTypes, setAllowedTypes] = React.useState<string[]>([]);
  const [saving, setSaving] = React.useState(false);

  const projectTitle = summary?.studioProject?.title ?? summary?.workspace.name ?? "Launchpad Project";
  const currentTemplateName = summary?.studioProject?.templatePack?.name ?? "Starter world";
  const currentTemplateSlug = summary?.studioProject?.templatePack?.slug ?? null;
  const currentWorldHeadline = summary?.studioProject?.worldRecipe?.headline ?? null;
  const savedAssetPackSlugs = summary?.studioProject?.selectedAssetPackSlugs ?? [];
  const savedAssetItemCount = summary?.studioProject?.selectedAssetItems.length ?? 0;
  const approvedCodePackageCount = summary?.studioProject?.approvedCodePackages.length ?? 0;
  const [selectedPackSlugs, setSelectedPackSlugs] = React.useState<string[]>(savedAssetPackSlugs);

  React.useEffect(() => {
    setSelectedPackSlugs(savedAssetPackSlugs);
  }, [savedAssetPackSlugs, summary?.studioProject?.updatedAt]);

  const recommendedPacks = React.useMemo(() => {
    const worldRecommended = summary?.studioProject?.worldRecipe?.recommendedAssetPackSlugs ?? [];
    const worldMatches = worldRecommended.length
      ? CURATED_ASSET_PACKS.filter((pack) => worldRecommended.includes(pack.slug))
      : [];
    if (worldMatches.length) {
      return worldMatches;
    }
    if (!currentTemplateSlug) {
      return CURATED_ASSET_PACKS;
    }
    const matches = CURATED_ASSET_PACKS.filter((pack) =>
      pack.recommendedTemplateSlugs.includes(currentTemplateSlug)
    );
    return matches.length ? matches : CURATED_ASSET_PACKS;
  }, [currentTemplateSlug, summary?.studioProject?.worldRecipe?.recommendedAssetPackSlugs]);

  const loadAllowed = React.useCallback(async () => {
    const res = await fetch("/api/cat/rabbithole/allowed-mimetypes");
    if (!res.ok) return;
    const data = (await res.json()) as { mimetypes?: string[] } | Record<string, unknown>;
    const raw =
      (data as { mimetypes?: unknown; allowed_mimetypes?: unknown }).mimetypes ??
      (data as { mimetypes?: unknown; allowed_mimetypes?: unknown }).allowed_mimetypes ??
      data;
    const list = Array.isArray(raw) ? raw : [];
    setAllowedTypes(list.filter((item): item is string => typeof item === "string"));
  }, []);

  React.useEffect(() => {
    loadAllowed();
  }, [loadAllowed]);

  const togglePack = React.useCallback((slug: string) => {
    setSelectedPackSlugs((current) =>
      current.includes(slug) ? current.filter((item) => item !== slug) : [...current, slug]
    );
  }, []);

  const saveSelectedShelves = React.useCallback(
    async (options?: { includePackSlug?: string; sendToCoachPack?: ApprovedAssetPack }) => {
      const nextSelection = options?.includePackSlug
        ? Array.from(new Set([...selectedPackSlugs, options.includePackSlug]))
        : selectedPackSlugs;

      setSaving(true);
      setStatus("Saving approved shelves...");

      const res = await fetch("/api/studio/project", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          selectedAssetPackSlugs: nextSelection
        })
      }).catch(() => null);

      setSaving(false);

      if (!res) {
        setStatus("Could not save approved shelves right now.");
        return;
      }

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        setStatus(text || "Could not save approved shelves right now.");
        return;
      }

      setSelectedPackSlugs(nextSelection);
      await Promise.resolve(onRefreshSummary?.());
      setStatus(`Approved shelves saved for ${summary?.workspace.collaboratorCount ?? 1} co-builders.`);

      if (options?.sendToCoachPack) {
        onSendToCoach?.(
          buildAssetPrompt(projectTitle, currentTemplateName, options.sendToCoachPack, currentWorldHeadline)
        );
      }
    },
    [
      currentTemplateName,
      currentWorldHeadline,
      onRefreshSummary,
      onSendToCoach,
      projectTitle,
      selectedPackSlugs,
      summary?.workspace.collaboratorCount
    ]
  );

  const uploadFile = async () => {
    if (!file) return;
    setStatus("Uploading inspiration...");

    const form = new FormData();
    form.append("file", file);

    const res = await fetch("/api/cat/rabbithole/file", {
      method: "POST",
      body: form
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      setStatus(text || "Upload failed");
      return;
    }

    setStatus("Inspiration added");
    setFile(null);
  };

  const uploadBatch = async () => {
    if (!batchFiles.length) return;
    setStatus("Uploading inspiration pack...");

    const form = new FormData();
    for (const nextFile of batchFiles) {
      form.append("files", nextFile);
    }

    const res = await fetch("/api/cat/rabbithole/batch", {
      method: "POST",
      body: form
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      setStatus(text || "Batch upload failed");
      return;
    }

    setStatus("Inspiration pack added");
    setBatchFiles([]);
  };

  const ingestUrl = async () => {
    if (!url.trim()) return;
    setStatus("Saving inspiration link...");

    const res = await fetch("/api/cat/rabbithole/web", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: url.trim() })
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      setStatus(text || "Link import failed");
      return;
    }

    setStatus("Inspiration link added");
    setUrl("");
  };

  return (
    <div className="mt-6 space-y-4">
      <Card className="intro-rise p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.3em] text-ink-400">Asset Shelf</div>
            <div className="mt-2 text-2xl font-semibold text-ink-50">
              Save approved Roblox shelves into the shared studio project
            </div>
            <p className="mt-2 max-w-3xl text-sm text-ink-300">
              Public resources should show up here as reviewed shelves. Kids pick from safe groups,
              and the whole team shares the same approved art direction and decoration packs.
            </p>
          </div>

          <div className="flex flex-wrap gap-2 text-xs">
            <Badge variant="neutral">{CURATED_ASSET_PACKS.length} approved shelves</Badge>
            <Badge variant="glow">{selectedPackSlugs.length} saved to project</Badge>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <div className="rounded-2xl border border-ink-800 bg-ink-950/60 px-4 py-3">
            <div className="text-[10px] uppercase tracking-[0.24em] text-ink-500">Current starter</div>
            <div className="mt-1 text-lg font-semibold text-ink-100">{currentTemplateName}</div>
          </div>
          <div className="rounded-2xl border border-ink-800 bg-ink-950/60 px-4 py-3">
            <div className="text-[10px] uppercase tracking-[0.24em] text-ink-500">World recipe</div>
            <div className="mt-1 text-sm font-semibold text-ink-100">
              {currentWorldHeadline ?? "Map Forge will sharpen recommendations"}
            </div>
          </div>
          <div className="rounded-2xl border border-ink-800 bg-ink-950/60 px-4 py-3">
            <div className="text-[10px] uppercase tracking-[0.24em] text-ink-500">Recommended now</div>
            <div className="mt-1 text-lg font-semibold text-ink-100">{recommendedPacks.length}</div>
          </div>
          <div className="rounded-2xl border border-ink-800 bg-ink-950/60 px-4 py-3">
            <div className="text-[10px] uppercase tracking-[0.24em] text-ink-500">Upload formats</div>
            <div className="mt-1 text-lg font-semibold text-ink-100">
              {allowedTypes.length ? allowedTypes.length : "--"}
            </div>
          </div>
          <div className="rounded-2xl border border-ink-800 bg-ink-950/60 px-4 py-3">
            <div className="text-[10px] uppercase tracking-[0.24em] text-ink-500">Safety rule</div>
            <div className="mt-1 text-sm font-semibold text-ink-100">Approved shelves only in shared kid mode</div>
          </div>
          <div className="rounded-2xl border border-ink-800 bg-ink-950/60 px-4 py-3">
            <div className="text-[10px] uppercase tracking-[0.24em] text-ink-500">Local manifests</div>
            <div className="mt-1 text-lg font-semibold text-ink-100">{savedAssetItemCount}</div>
            <div className="mt-1 text-[11px] text-ink-400">{approvedCodePackageCount} approved Luau modules</div>
          </div>
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          <Card className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-[0.3em] text-ink-400">Approved shelves</div>
                <div className="mt-2 text-lg font-semibold text-ink-50">
                  Pick shelves and keep them linked to the project
                </div>
              </div>
              <Badge variant="glow">Shared studio state</Badge>
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              {CURATED_ASSET_PACKS.map((pack) => {
                const recommended = currentTemplateSlug
                  ? pack.recommendedTemplateSlugs.includes(currentTemplateSlug)
                  : false;
                const selected = selectedPackSlugs.includes(pack.slug);

                return (
                  <div
                    key={pack.slug}
                    className={`rounded-3xl border p-4 ${
                      selected
                        ? "border-glow-500/40 bg-glow-500/12"
                        : recommended
                          ? "border-ink-700 bg-ink-900/70"
                          : "border-ink-800 bg-ink-950/70"
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="text-lg font-semibold text-ink-100">{pack.title}</div>
                        <div className="mt-1 text-xs uppercase tracking-[0.16em] text-ink-500">
                          {pack.shelf} · {pack.ageBand}
                        </div>
                      </div>
                      {selected ? (
                        <Badge variant="glow">Saved shelf</Badge>
                      ) : recommended ? (
                        <Badge variant="neutral">Best fit now</Badge>
                      ) : null}
                    </div>

                    <div className="mt-3 text-sm text-ink-300">{pack.summary}</div>

                    <div className="mt-4 flex flex-wrap gap-2 text-[11px] text-ink-300">
                      <Badge variant="neutral" className="font-medium">
                        {pack.sourceType}
                      </Badge>
                      <Badge variant="neutral" className="font-medium">
                        {pack.reviewMode}
                      </Badge>
                      <Badge variant="neutral" className="font-medium">
                        {pack.items.length} local items
                      </Badge>
                      <Badge variant="neutral" className="font-medium">
                        {pack.codePackageSlugs.length} module kits
                      </Badge>
                    </div>

                    <div className="mt-4 text-[10px] uppercase tracking-[0.22em] text-glow-300">
                      Shelf pieces
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {pack.sampleItems.map((item) => (
                        <span
                          key={item}
                          className="rounded-full border border-ink-700 bg-ink-900/80 px-2 py-1 text-[11px] text-ink-300"
                        >
                          {item}
                        </span>
                      ))}
                    </div>

                    <div className="mt-4 rounded-2xl border border-ink-800 bg-ink-900/70 px-3 py-3 text-xs text-ink-300">
                      <div className="font-semibold text-ink-100">Why this shelf is safe</div>
                      <div className="mt-1">{pack.safetyNote}</div>
                    </div>

                    <div className="mt-4 rounded-2xl border border-ink-800 bg-ink-900/60 px-3 py-3 text-xs text-ink-300">
                      <div className="font-semibold text-ink-100">Local manifest preview</div>
                      <div className="mt-2 space-y-2">
                        {pack.items.slice(0, 3).map((item) => (
                          <div key={item.slug} className="rounded-xl border border-ink-800 bg-ink-950/60 px-3 py-2">
                            <div className="font-medium text-ink-100">{item.title}</div>
                            <div className="mt-1 text-[11px] text-ink-400">
                              {item.targetPath} · {item.localBundleKey}
                            </div>
                            <div className="mt-1 text-[11px] text-ink-300">{item.placementHint}</div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button
                        variant={selected ? "outline" : "glow"}
                        size="sm"
                        onClick={() => togglePack(pack.slug)}
                      >
                        {selected ? "Remove shelf" : "Select shelf"}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          void saveSelectedShelves({
                            includePackSlug: pack.slug,
                            sendToCoachPack: pack
                          })
                        }
                        disabled={saving}
                      >
                        Save and use with coach
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="p-5">
            <div className="text-xs uppercase tracking-[0.3em] text-ink-400">Project shelves</div>
            <div className="mt-2 text-lg font-semibold text-ink-50">What the team has approved so far</div>
            <div className="mt-2 text-sm text-ink-300">
              Save shelves here so the coach and every collaborator are working from the same Roblox art direction, local bundles, and approved Luau helpers.
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {selectedPackSlugs.length ? (
                selectedPackSlugs.map((slug) => (
                  <span
                    key={slug}
                    className="rounded-full border border-ink-700 bg-ink-950/70 px-3 py-1.5 text-xs text-ink-200"
                  >
                    {CURATED_ASSET_PACKS.find((pack) => pack.slug === slug)?.title ?? slug}
                  </span>
                ))
              ) : (
                <div className="rounded-2xl border border-ink-800 bg-ink-950/70 px-3 py-3 text-sm text-ink-400">
                  No shelves saved yet. Pick one or two to anchor the Roblox look and feel.
                </div>
              )}
            </div>

            {summary?.studioProject?.selectedAssetItems.length ? (
              <div className="mt-4 rounded-2xl border border-ink-800 bg-ink-950/70 px-3 py-3">
                <div className="text-[10px] uppercase tracking-[0.22em] text-glow-300">Stored locally for the LLM</div>
                <div className="mt-2 space-y-2 text-xs text-ink-300">
                  {summary.studioProject.selectedAssetItems.slice(0, 6).map((item) => (
                    <div key={item.slug} className="rounded-xl border border-ink-800 bg-ink-900/60 px-3 py-2">
                      <div className="font-medium text-ink-100">{item.title}</div>
                      <div className="mt-1 text-[11px] text-ink-400">
                        {item.kind} · {item.targetPath} · {item.localBundleKey}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="mt-4 space-y-3">
              <Button
                variant="glow"
                className="w-full"
                onClick={() => void saveSelectedShelves()}
                disabled={saving}
              >
                {saving ? "Saving shelves..." : "Save approved shelves"}
              </Button>
              {status ? (
                <div className="rounded-2xl border border-ink-800 bg-ink-950/70 px-3 py-3 text-sm text-ink-300">
                  {status}
                </div>
              ) : null}
            </div>
          </Card>

          <Card className="p-5">
            <div className="text-xs uppercase tracking-[0.3em] text-ink-400">My inspiration</div>
            <div className="mt-2 text-lg font-semibold text-ink-50">Add a drawing, screenshot, or link</div>
            <div className="mt-2 text-sm text-ink-300">
              Keep the child flow simple. Use this to feed references to the coach without opening a
              huge import tool first.
            </div>

            <div className="mt-4 space-y-3">
              <input
                type="file"
                className="w-full rounded-xl border border-ink-800 bg-ink-900/60 px-3 py-2 text-xs text-ink-200"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
              <Button variant="glow" className="w-full" onClick={uploadFile} disabled={!file}>
                Upload one inspiration file
              </Button>

              <Input
                placeholder="Paste a kid-safe inspiration link"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
              />
              <Button variant="outline" className="w-full" onClick={ingestUrl} disabled={!url.trim()}>
                Save inspiration link
              </Button>
            </div>
          </Card>

          <details className="rounded-3xl border border-ink-800 bg-ink-900/70 p-5">
            <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.24em] text-ink-400">
              Coach import tools
            </summary>
            <div className="mt-4 space-y-3">
              <input
                type="file"
                multiple
                className="w-full rounded-xl border border-ink-800 bg-ink-950/70 px-3 py-2 text-xs text-ink-200"
                onChange={(event) => setBatchFiles(Array.from(event.target.files ?? []))}
              />
              <Button
                variant="outline"
                className="w-full"
                onClick={uploadBatch}
                disabled={!batchFiles.length}
              >
                Upload inspiration pack
              </Button>
              <div className="rounded-2xl border border-ink-800 bg-ink-950/70 px-3 py-3 text-sm text-ink-300">
                This is still useful for the team, but shelves should stay the main child-facing path.
              </div>
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}
