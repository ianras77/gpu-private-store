"use client";

import * as React from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";

function extractModelNames(data: unknown): string[] {
  if (!data) return [];
  if (Array.isArray(data)) {
    return data.map((item) => (typeof item === "string" ? item : item?.name)).filter(Boolean);
  }
  if (typeof data === "object") {
    const obj = data as Record<string, unknown>;
    if (Array.isArray(obj.models)) {
      return obj.models
        .map((item) => (typeof item === "string" ? item : (item as any)?.name))
        .filter(Boolean);
    }
    return Object.keys(obj);
  }
  return [];
}

function JsonEditor({
  label,
  model,
  onModelChange,
  value,
  onSave
}: {
  label: string;
  model: string;
  onModelChange: (next: string) => void;
  value: Record<string, unknown> | null;
  onSave: (next: Record<string, unknown>) => Promise<void>;
}) {
  const [draft, setDraft] = React.useState("{}");
  const [status, setStatus] = React.useState<string | null>(null);

  React.useEffect(() => {
    setDraft(JSON.stringify(value ?? {}, null, 2));
  }, [value]);

  const handleSave = async () => {
    try {
      const parsed = JSON.parse(draft) as Record<string, unknown>;
      setStatus(null);
      await onSave(parsed);
      setStatus("Saved");
    } catch (error) {
      setStatus("Invalid JSON");
    }
  };

  return (
    <Card>
      <div className="text-xs uppercase tracking-[0.3em] text-ink-400">{label}</div>
      <div className="mt-4 space-y-3">
        <Input
          placeholder="Model name"
          value={model}
          onChange={(event) => onModelChange(event.target.value)}
        />
        <Textarea value={draft} onChange={(event) => setDraft(event.target.value)} rows={10} />
        <Button variant="glow" onClick={handleSave} disabled={!model.trim()}>
          Save
        </Button>
        {status ? <div className="text-xs text-ink-300">{status}</div> : null}
      </div>
    </Card>
  );
}

export function ModelsTab() {
  const [llmList, setLlmList] = React.useState<string[]>([]);
  const [embedderList, setEmbedderList] = React.useState<string[]>([]);
  const [llmModel, setLlmModel] = React.useState("");
  const [embedderModel, setEmbedderModel] = React.useState("");
  const [llmSettings, setLlmSettings] = React.useState<Record<string, unknown> | null>(null);
  const [embedderSettings, setEmbedderSettings] = React.useState<Record<string, unknown> | null>(
    null
  );

  const loadLlmList = React.useCallback(async () => {
    const res = await fetch("/api/cat/llm");
    if (!res.ok) return;
    const data = await res.json();
    const names = extractModelNames(data.models ?? data);
    setLlmList(names);
    if (!llmModel && names.length) {
      setLlmModel(names[0]);
    }
  }, [llmModel]);

  const loadEmbedderList = React.useCallback(async () => {
    const res = await fetch("/api/cat/embedder");
    if (!res.ok) return;
    const data = await res.json();
    const names = extractModelNames(data.models ?? data);
    setEmbedderList(names);
    if (!embedderModel && names.length) {
      setEmbedderModel(names[0]);
    }
  }, [embedderModel]);

  const loadLlmSettings = React.useCallback(async () => {
    if (!llmModel) return;
    const res = await fetch(`/api/cat/llm/settings?model=${encodeURIComponent(llmModel)}`);
    if (!res.ok) return;
    const data = (await res.json()) as
      | { settings?: Record<string, unknown> }
      | Record<string, unknown>;
    setLlmSettings((data as any).settings ?? data ?? null);
  }, [llmModel]);

  const loadEmbedderSettings = React.useCallback(async () => {
    if (!embedderModel) return;
    const res = await fetch(
      `/api/cat/embedder/settings?model=${encodeURIComponent(embedderModel)}`
    );
    if (!res.ok) return;
    const data = (await res.json()) as
      | { settings?: Record<string, unknown> }
      | Record<string, unknown>;
    setEmbedderSettings((data as any).settings ?? data ?? null);
  }, [embedderModel]);

  React.useEffect(() => {
    loadLlmList();
    loadEmbedderList();
  }, [loadLlmList, loadEmbedderList]);

  React.useEffect(() => {
    loadLlmSettings();
  }, [loadLlmSettings]);

  React.useEffect(() => {
    loadEmbedderSettings();
  }, [loadEmbedderSettings]);

  const refreshAll = React.useCallback(async () => {
    await Promise.all([loadLlmList(), loadEmbedderList()]);
    await Promise.all([loadLlmSettings(), loadEmbedderSettings()]);
  }, [loadEmbedderList, loadEmbedderSettings, loadLlmList, loadLlmSettings]);

  const saveLlm = async (next: Record<string, unknown>) => {
    await fetch(`/api/cat/llm/settings?model=${encodeURIComponent(llmModel)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next)
    });
    setLlmSettings(next);
  };

  const saveEmbedder = async (next: Record<string, unknown>) => {
    await fetch(`/api/cat/embedder/settings?model=${encodeURIComponent(embedderModel)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next)
    });
    setEmbedderSettings(next);
  };

  return (
    <div className="mt-6 space-y-4">
      <Card>
        <div className="text-xs uppercase tracking-[0.3em] text-ink-400">Overview</div>
        <div className="mt-3 grid gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-ink-800 bg-ink-950/60 px-3 py-2">
            <div className="text-[10px] uppercase tracking-[0.2em] text-ink-500">LLM providers</div>
            <div className="mt-1 text-sm font-semibold text-ink-100">{llmList.length}</div>
          </div>
          <div className="rounded-xl border border-ink-800 bg-ink-950/60 px-3 py-2">
            <div className="text-[10px] uppercase tracking-[0.2em] text-ink-500">Embedder providers</div>
            <div className="mt-1 text-sm font-semibold text-ink-100">{embedderList.length}</div>
          </div>
          <div className="rounded-xl border border-ink-800 bg-ink-950/60 px-3 py-2">
            <div className="text-[10px] uppercase tracking-[0.2em] text-ink-500">Selected LLM</div>
            <div className="mt-1 truncate text-sm font-semibold text-ink-100">{llmModel || "--"}</div>
          </div>
          <div className="rounded-xl border border-ink-800 bg-ink-950/60 px-3 py-2">
            <div className="text-[10px] uppercase tracking-[0.2em] text-ink-500">Selected embedder</div>
            <div className="mt-1 truncate text-sm font-semibold text-ink-100">
              {embedderModel || "--"}
            </div>
          </div>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
        <div className="space-y-4">
          <Card>
            <div className="text-xs uppercase tracking-[0.3em] text-ink-400">Actions</div>
            <div className="mt-4 space-y-3">
              <Button variant="outline" onClick={refreshAll}>
                Refresh providers
              </Button>
              <div className="rounded-xl border border-ink-800 bg-ink-950/60 p-3">
                <div className="text-[10px] uppercase tracking-[0.2em] text-ink-500">LLM models</div>
                <div className="mt-2 space-y-2">
                  {llmList.length === 0 ? (
                    <div className="text-sm text-ink-400">No LLMs reported.</div>
                  ) : (
                    llmList.map((item) => (
                      <button
                        key={item}
                        className={`w-full rounded-xl border px-3 py-2 text-left text-xs transition ${
                          llmModel === item
                            ? "border-ink-600 bg-ink-800 text-ink-50"
                            : "border-ink-800 bg-ink-900/60 text-ink-300 hover:border-ink-700"
                        }`}
                        onClick={() => setLlmModel(item)}
                      >
                        {item}
                      </button>
                    ))
                  )}
                </div>
              </div>
              <div className="rounded-xl border border-ink-800 bg-ink-950/60 p-3">
                <div className="text-[10px] uppercase tracking-[0.2em] text-ink-500">Embedder models</div>
                <div className="mt-2 space-y-2">
                  {embedderList.length === 0 ? (
                    <div className="text-sm text-ink-400">No embedders reported.</div>
                  ) : (
                    embedderList.map((item) => (
                      <button
                        key={item}
                        className={`w-full rounded-xl border px-3 py-2 text-left text-xs transition ${
                          embedderModel === item
                            ? "border-ink-600 bg-ink-800 text-ink-50"
                            : "border-ink-800 bg-ink-900/60 text-ink-300 hover:border-ink-700"
                        }`}
                        onClick={() => setEmbedderModel(item)}
                      >
                        {item}
                      </button>
                    ))
                  )}
                </div>
              </div>
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <div className="text-xs uppercase tracking-[0.3em] text-ink-400">Output</div>
            <div className="mt-3 text-xs text-ink-400">
              Edit provider JSON and save changes directly to Cheshire Cat.
            </div>
          </Card>
          <JsonEditor
            label="LLM settings"
            model={llmModel}
            onModelChange={setLlmModel}
            value={llmSettings}
            onSave={saveLlm}
          />
          <JsonEditor
            label="Embedder settings"
            model={embedderModel}
            onModelChange={setEmbedderModel}
            value={embedderSettings}
            onSave={saveEmbedder}
          />
        </div>
      </div>
    </div>
  );
}
