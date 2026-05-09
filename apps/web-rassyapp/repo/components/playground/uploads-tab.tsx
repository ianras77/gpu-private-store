"use client";

import * as React from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export function FilesTab() {
  const [file, setFile] = React.useState<File | null>(null);
  const [batchFiles, setBatchFiles] = React.useState<File[]>([]);
  const [memoryFile, setMemoryFile] = React.useState<File | null>(null);
  const [fileMetadata, setFileMetadata] = React.useState("{}");
  const [chunkSize, setChunkSize] = React.useState("");
  const [chunkOverlap, setChunkOverlap] = React.useState("");
  const [url, setUrl] = React.useState("");
  const [urlMetadata, setUrlMetadata] = React.useState("{}");
  const [status, setStatus] = React.useState<string | null>(null);
  const [allowedTypes, setAllowedTypes] = React.useState<string[]>([]);

  const loadAllowed = React.useCallback(async () => {
    const res = await fetch("/api/cat/rabbithole/allowed-mimetypes");
    if (!res.ok) return;
    const data = (await res.json()) as { mimetypes?: string[] } | Record<string, unknown>;
    const raw = (data as any).mimetypes ?? (data as any).allowed_mimetypes ?? data;
    const list = Array.isArray(raw) ? raw : [];
    setAllowedTypes(list);
  }, []);

  React.useEffect(() => {
    loadAllowed();
  }, [loadAllowed]);

  const uploadFile = async () => {
    if (!file) return;
    setStatus("Uploading file...");

    const form = new FormData();
    form.append("file", file);
    if (chunkSize.trim()) form.append("chunk_size", chunkSize.trim());
    if (chunkOverlap.trim()) form.append("chunk_overlap", chunkOverlap.trim());
    if (fileMetadata.trim()) form.append("metadata", fileMetadata.trim());

    const res = await fetch("/api/cat/rabbithole/file", {
      method: "POST",
      body: form
    });

    if (!res.ok) {
      const text = await res.text();
      setStatus(text || "Upload failed");
      return;
    }

    setStatus("File ingested");
    setFile(null);
  };

  const ingestUrl = async () => {
    if (!url.trim()) return;
    setStatus("Ingesting URL...");

    let metadata: Record<string, unknown> = {};
    try {
      metadata = urlMetadata.trim() ? (JSON.parse(urlMetadata) as Record<string, unknown>) : {};
    } catch {
      setStatus("Invalid URL metadata JSON");
      return;
    }

    const body: Record<string, unknown> = { url: url.trim() };
    if (chunkSize.trim()) body.chunk_size = Number(chunkSize);
    if (chunkOverlap.trim()) body.chunk_overlap = Number(chunkOverlap);
    if (Object.keys(metadata).length) body.metadata = metadata;

    const res = await fetch("/api/cat/rabbithole/web", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const text = await res.text();
      setStatus(text || "URL ingest failed");
      return;
    }

    setStatus("URL ingested");
    setUrl("");
  };

  const uploadBatch = async () => {
    if (batchFiles.length === 0) return;
    setStatus("Uploading batch...");

    const form = new FormData();
    for (const nextFile of batchFiles) {
      form.append("files", nextFile);
    }
    if (chunkSize.trim()) form.append("chunk_size", chunkSize.trim());
    if (chunkOverlap.trim()) form.append("chunk_overlap", chunkOverlap.trim());
    if (fileMetadata.trim()) form.append("metadata", fileMetadata.trim());

    const res = await fetch("/api/cat/rabbithole/batch", {
      method: "POST",
      body: form
    });

    if (!res.ok) {
      const text = await res.text();
      setStatus(text || "Batch upload failed");
      return;
    }

    setStatus("Batch ingested");
    setBatchFiles([]);
  };

  const uploadMemory = async () => {
    if (!memoryFile) return;
    setStatus("Uploading memory file...");

    const form = new FormData();
    form.append("file", memoryFile);

    const res = await fetch("/api/cat/rabbithole/memory", {
      method: "POST",
      body: form
    });

    if (!res.ok) {
      const text = await res.text();
      setStatus(text || "Memory upload failed");
      return;
    }

    setStatus("Memory uploaded");
    setMemoryFile(null);
  };

  return (
    <div className="mt-6 space-y-4">
      <Card className="intro-rise">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-[0.3em] text-ink-400">Inspiration Board</div>
            <div className="mt-2 text-2xl font-semibold text-ink-50">Feed the coach sketches, docs, and reference packs</div>
            <p className="mt-2 max-w-2xl text-sm text-ink-300">
              Route inspiration into Cheshire Cat through single files, batch uploads, URLs, and
              raw memory file ingestion with chunk and metadata controls.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={loadAllowed}>
            Refresh upload formats
          </Button>
        </div>
        <div className="mt-4 grid gap-2 md:grid-cols-4">
          <div className="rounded-xl border border-ink-800 bg-ink-950/60 px-3 py-2 text-xs">
            <div className="uppercase tracking-[0.2em] text-ink-500">Single file</div>
            <div className="mt-1 font-semibold text-ink-100">{file ? file.name : "Not selected"}</div>
          </div>
          <div className="rounded-xl border border-ink-800 bg-ink-950/60 px-3 py-2 text-xs">
            <div className="uppercase tracking-[0.2em] text-ink-500">Batch queue</div>
            <div className="mt-1 font-semibold text-ink-100">{batchFiles.length} files</div>
          </div>
          <div className="rounded-xl border border-ink-800 bg-ink-950/60 px-3 py-2 text-xs">
            <div className="uppercase tracking-[0.2em] text-ink-500">Reference URL</div>
            <div className="mt-1 truncate font-semibold text-ink-100">{url.trim() || "No URL set"}</div>
          </div>
          <div className="rounded-xl border border-ink-800 bg-ink-950/60 px-3 py-2 text-xs">
            <div className="uppercase tracking-[0.2em] text-ink-500">Allowed types</div>
            <div className="mt-1 font-semibold text-ink-100">{allowedTypes.length}</div>
          </div>
        </div>
      </Card>

      <Card>
        <div className="text-xs uppercase tracking-[0.3em] text-ink-400">Overview</div>
        <div className="mt-3 grid gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-ink-800 bg-ink-950/60 px-3 py-2">
            <div className="text-[10px] uppercase tracking-[0.2em] text-ink-500">Allowed types</div>
            <div className="mt-1 text-sm font-semibold text-ink-100">{allowedTypes.length}</div>
          </div>
          <div className="rounded-xl border border-ink-800 bg-ink-950/60 px-3 py-2">
            <div className="text-[10px] uppercase tracking-[0.2em] text-ink-500">Single file</div>
            <div className="mt-1 text-sm font-semibold text-ink-100">{file ? "Ready" : "None"}</div>
          </div>
          <div className="rounded-xl border border-ink-800 bg-ink-950/60 px-3 py-2">
            <div className="text-[10px] uppercase tracking-[0.2em] text-ink-500">Batch files</div>
            <div className="mt-1 text-sm font-semibold text-ink-100">{batchFiles.length}</div>
          </div>
          <div className="rounded-xl border border-ink-800 bg-ink-950/60 px-3 py-2">
            <div className="text-[10px] uppercase tracking-[0.2em] text-ink-500">URL target</div>
            <div className="mt-1 truncate text-sm font-semibold text-ink-100">
              {url.trim() || "Not set"}
            </div>
          </div>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
        <div className="space-y-4">
          <Card>
            <div className="text-xs uppercase tracking-[0.3em] text-ink-400">Inspiration actions</div>
            <div className="mt-4 space-y-3 text-sm text-ink-300">
              <input
                type="file"
                className="w-full rounded-xl border border-ink-800 bg-ink-900/60 px-3 py-2 text-xs text-ink-200"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
              <div className="grid gap-2 sm:grid-cols-2">
                <Input
                  placeholder="Chunk size"
                  value={chunkSize}
                  onChange={(event) => setChunkSize(event.target.value)}
                />
                <Input
                  placeholder="Chunk overlap"
                  value={chunkOverlap}
                  onChange={(event) => setChunkOverlap(event.target.value)}
                />
              </div>
              <Textarea
                placeholder="Metadata JSON (optional)"
                value={fileMetadata}
                onChange={(event) => setFileMetadata(event.target.value)}
              />
              <Button variant="glow" onClick={uploadFile}>
                Upload inspiration file
              </Button>

              <input
                type="file"
                multiple
                className="w-full rounded-xl border border-ink-800 bg-ink-900/60 px-3 py-2 text-xs text-ink-200"
                onChange={(event) => setBatchFiles(Array.from(event.target.files ?? []))}
              />
              <Button variant="outline" onClick={uploadBatch}>
                Upload inspiration pack
              </Button>

              <Input
                placeholder="https://example.com"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
              />
              <Textarea
                placeholder="URL metadata JSON (optional)"
                value={urlMetadata}
                onChange={(event) => setUrlMetadata(event.target.value)}
              />
              <Button variant="outline" onClick={ingestUrl}>
                Ingest URL
              </Button>

              <input
                type="file"
                className="w-full rounded-xl border border-ink-800 bg-ink-900/60 px-3 py-2 text-xs text-ink-200"
                onChange={(event) => setMemoryFile(event.target.files?.[0] ?? null)}
              />
              <Button variant="ghost" onClick={uploadMemory}>
                Upload memory file
              </Button>
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <div className="text-xs uppercase tracking-[0.3em] text-ink-400">Ingestion Output</div>
            {status ? (
              <div className="mt-3 rounded-xl border border-ink-800 bg-ink-950/60 px-3 py-2 text-sm text-ink-300">
                {status}
              </div>
            ) : (
              <div className="mt-3 text-xs text-ink-400">No recent ingest action message.</div>
            )}
            <div className="mt-4 text-xs text-ink-400">
              Batch selected: {batchFiles.length} · Memory file: {memoryFile ? memoryFile.name : "none"}
            </div>
          </Card>

          <Card>
            <div className="text-xs uppercase tracking-[0.3em] text-ink-400">Allowed mimetypes</div>
            <div className="mt-3 max-h-[420px] space-y-2 overflow-y-auto pr-1 text-xs text-ink-300">
              {allowedTypes.length ? (
                allowedTypes.map((type) => (
                  <div
                    key={type}
                    className="rounded-xl border border-ink-800 bg-ink-950/60 px-3 py-2"
                  >
                    {type}
                  </div>
                ))
              ) : (
                <div className="text-xs text-ink-400">No list available.</div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
