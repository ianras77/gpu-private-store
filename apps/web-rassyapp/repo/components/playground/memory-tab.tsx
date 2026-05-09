"use client";

import * as React from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type MemoryPoint = {
  id?: string;
  content?: string;
  metadata?: Record<string, unknown>;
  vector?: number[];
};

export function MemoryTab() {
  const [collection, setCollection] = React.useState("episodic");
  const [points, setPoints] = React.useState<MemoryPoint[]>([]);
  const [content, setContent] = React.useState("");
  const [metadataText, setMetadataText] = React.useState("{}");
  const [recallQuery, setRecallQuery] = React.useState("");
  const [recallResults, setRecallResults] = React.useState<MemoryPoint[]>([]);
  const [status, setStatus] = React.useState<string | null>(null);

  const loadPoints = React.useCallback(async () => {
    if (!collection.trim()) return;
    const res = await fetch(`/api/cat/memory/collections/${encodeURIComponent(collection)}`);
    if (!res.ok) return;
    const data = (await res.json()) as { points?: MemoryPoint[] } | MemoryPoint[];
    const list = Array.isArray(data) ? data : (data.points ?? []);
    setPoints(list);
  }, [collection]);

  const addPoint = async () => {
    if (!collection.trim() || !content.trim()) return;
    let metadata: Record<string, unknown> = {};
    try {
      metadata = metadataText.trim() ? (JSON.parse(metadataText) as Record<string, unknown>) : {};
    } catch {
      setStatus("Invalid metadata JSON");
      return;
    }

    const res = await fetch(`/api/cat/memory/collections/${encodeURIComponent(collection)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: content.trim(), metadata })
    });
    if (!res.ok) {
      const text = await res.text();
      setStatus(text || "Unable to add memory point");
      return;
    }
    setStatus("Memory point added");
    setContent("");
    setMetadataText("{}");
    loadPoints();
  };

  const wipeCollection = async () => {
    if (!collection.trim()) return;
    const res = await fetch(`/api/cat/memory/collections/${encodeURIComponent(collection)}`, {
      method: "DELETE"
    });
    if (!res.ok) {
      const text = await res.text();
      setStatus(text || "Unable to wipe collection");
      return;
    }
    setStatus("Collection wiped");
    setPoints([]);
  };

  const runRecall = async () => {
    if (!recallQuery.trim()) return;
    const params = new URLSearchParams({ text: recallQuery.trim() });
    const res = await fetch(`/api/cat/memory/recall?${params.toString()}`);
    if (!res.ok) return;
    const data = (await res.json()) as { results?: MemoryPoint[] } | MemoryPoint[];
    const list = Array.isArray(data) ? data : (data.results ?? []);
    setRecallResults(list);
  };

  return (
    <div className="mt-6 space-y-4">
      <Card className="intro-rise">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-[0.3em] text-ink-400">Idea Vault</div>
            <div className="mt-2 text-2xl font-semibold text-ink-50">Project memory and remix recall</div>
            <p className="mt-2 max-w-2xl text-sm text-ink-300">
              Save quest ideas, scene beats, reusable phrases, and project references, then pull
              them back with semantic recall when the next build session needs them.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={loadPoints}>
            Refresh vault
          </Button>
        </div>
        <div className="mt-4 grid gap-2 md:grid-cols-4">
          <div className="rounded-xl border border-ink-800 bg-ink-950/60 px-3 py-2 text-xs">
            <div className="uppercase tracking-[0.2em] text-ink-500">Vault</div>
            <div className="mt-1 font-semibold text-ink-100">{collection || "episodic"}</div>
          </div>
          <div className="rounded-xl border border-ink-800 bg-ink-950/60 px-3 py-2 text-xs">
            <div className="uppercase tracking-[0.2em] text-ink-500">Saved notes</div>
            <div className="mt-1 font-semibold text-ink-100">{points.length}</div>
          </div>
          <div className="rounded-xl border border-ink-800 bg-ink-950/60 px-3 py-2 text-xs">
            <div className="uppercase tracking-[0.2em] text-ink-500">Recall hits</div>
            <div className="mt-1 font-semibold text-ink-100">{recallResults.length}</div>
          </div>
          <div className="rounded-xl border border-ink-800 bg-ink-950/60 px-3 py-2 text-xs">
            <div className="uppercase tracking-[0.2em] text-ink-500">Status</div>
            <div className="mt-1 truncate font-semibold text-ink-100">{status ?? "Idle"}</div>
          </div>
        </div>
      </Card>

      <Card>
        <div className="text-xs uppercase tracking-[0.3em] text-ink-400">Overview</div>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-ink-800 bg-ink-950/60 px-3 py-2">
            <div className="text-[10px] uppercase tracking-[0.2em] text-ink-500">Collection</div>
            <div className="mt-1 text-sm font-semibold text-ink-100">{collection || "episodic"}</div>
          </div>
          <div className="rounded-xl border border-ink-800 bg-ink-950/60 px-3 py-2">
            <div className="text-[10px] uppercase tracking-[0.2em] text-ink-500">Loaded points</div>
            <div className="mt-1 text-sm font-semibold text-ink-100">{points.length}</div>
          </div>
          <div className="rounded-xl border border-ink-800 bg-ink-950/60 px-3 py-2">
            <div className="text-[10px] uppercase tracking-[0.2em] text-ink-500">Recall hits</div>
            <div className="mt-1 text-sm font-semibold text-ink-100">{recallResults.length}</div>
          </div>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
        <div className="space-y-4">
          <Card>
            <div className="text-xs uppercase tracking-[0.3em] text-ink-400">Actions</div>
            <div className="mt-4 space-y-3">
              <Input
                placeholder="Vault name"
                value={collection}
                onChange={(event) => setCollection(event.target.value)}
              />
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={loadPoints}>
                  Load notes
                </Button>
                <Button variant="ghost" onClick={wipeCollection}>
                  Clear vault
                </Button>
              </div>
              <Input
                placeholder="What are you trying to remember?"
                value={recallQuery}
                onChange={(event) => setRecallQuery(event.target.value)}
              />
              <Button variant="outline" onClick={runRecall}>
                Search recall
              </Button>
              <Textarea
                placeholder="Save an idea, quest note, scene beat, or useful phrase"
                value={content}
                onChange={(event) => setContent(event.target.value)}
              />
              <Textarea
                placeholder="Metadata JSON (optional)"
                value={metadataText}
                onChange={(event) => setMetadataText(event.target.value)}
              />
              <Button variant="glow" onClick={addPoint}>
                Save idea
              </Button>
              <div className="text-xs text-ink-400">
                Vault names and memory behavior still depend on your Cat configuration today.
              </div>
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <div className="text-xs uppercase tracking-[0.3em] text-ink-400">Output</div>
            {status ? (
              <div className="mt-3 rounded-xl border border-ink-800 bg-ink-950/60 px-3 py-2 text-xs text-ink-300">
                {status}
              </div>
            ) : (
              <div className="mt-3 text-xs text-ink-400">No recent action message.</div>
            )}
            <div className="mt-4">
              <div className="text-[11px] uppercase tracking-[0.2em] text-ink-500">Recall results</div>
              <div className="mt-2 space-y-2">
                {recallResults.length ? (
                  recallResults.map((doc, index) => (
                    <div
                      key={doc.id ?? index}
                      className="rounded-2xl border border-ink-800 bg-ink-950/60 p-3 text-xs text-ink-300"
                    >
                      {(doc.content ?? "").slice(0, 180) || "(empty)"}
                    </div>
                  ))
                ) : (
                  <div className="text-xs text-ink-400">No recall results yet.</div>
                )}
              </div>
            </div>
          </Card>

          <Card>
            <div className="text-xs uppercase tracking-[0.3em] text-ink-400">Collection points</div>
            <div className="mt-3 space-y-3">
              {points.length === 0 ? (
                <div className="text-sm text-ink-400">No memory points loaded.</div>
              ) : (
                points.map((point, index) => (
                  <div
                    key={point.id ?? index}
                    className="rounded-2xl border border-ink-800 bg-ink-950/60 p-3"
                  >
                    <div className="text-[11px] uppercase tracking-[0.2em] text-ink-500">
                      Point {point.id ?? index + 1}
                    </div>
                    <div className="mt-2 whitespace-pre-wrap text-sm text-ink-100">
                      {point.content ?? "(empty)"}
                    </div>
                    {point.metadata ? (
                      <pre className="mt-3 whitespace-pre-wrap rounded-2xl border border-ink-800 bg-ink-900/70 p-3 text-[11px] text-ink-300">
                        {JSON.stringify(point.metadata, null, 2)}
                      </pre>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
