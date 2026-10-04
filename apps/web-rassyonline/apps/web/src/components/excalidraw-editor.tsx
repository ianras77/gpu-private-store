"use client";

import "@excalidraw/excalidraw/index.css";
import { Excalidraw, exportToBlob, exportToSvg, serializeAsJSON } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI, ExcalidrawInitialDataState } from "@excalidraw/excalidraw/types";
import { useMemo, useState } from "react";

declare global {
  interface Window {
    EXCALIDRAW_ASSET_PATH?: string;
  }
}

if (typeof window !== "undefined") window.EXCALIDRAW_ASSET_PATH = "/excalidraw-assets/";

function parseScene(sceneJson: string): ExcalidrawInitialDataState | null {
  try {
    const value: unknown = JSON.parse(sceneJson);
    if (!value || typeof value !== "object") return null;
    const scene = value as { elements?: unknown; appState?: unknown; files?: unknown };
    if (!Array.isArray(scene.elements)) return null;
    return {
      elements: scene.elements as ExcalidrawInitialDataState["elements"],
      appState: scene.appState && typeof scene.appState === "object" ? scene.appState as ExcalidrawInitialDataState["appState"] : undefined,
      files: scene.files && typeof scene.files === "object" ? scene.files as ExcalidrawInitialDataState["files"] : undefined
    };
  } catch {
    return null;
  }
}

function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export default function ExcalidrawEditor({ sceneJson, title, onClose }: { sceneJson: string; title: string; onClose: () => void }) {
  const initialData = useMemo(() => parseScene(sceneJson), [sceneJson]);
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState<"scene" | "svg" | "png" | "">("");
  const [elementCount, setElementCount] = useState(initialData?.elements?.length ?? 0);
  const baseName = title.trim().replace(/[^\p{L}\p{N}._-]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "Rassy-diagram";

  if (!initialData) return <div className="excalidraw-editor-backdrop"><section className="excalidraw-editor-dialog" role="alert"><p>This Excalidraw scene could not be opened.</p><button type="button" onClick={onClose}>Close</button></section></div>;

  const currentScene = () => {
    if (!api) throw new Error("The Excalidraw editor is still starting.");
    return { elements: api.getSceneElements(), appState: api.getAppState(), files: api.getFiles() };
  };
  const withBusy = async (action: typeof busy, run: () => Promise<void>) => {
    if (busy) return;
    setBusy(action);
    setNotice("");
    try { await run(); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Excalidraw could not complete that export."); }
    finally { setBusy(""); }
  };
  const saveScene = () => withBusy("scene", async () => {
    const scene = currentScene();
    const serialized = serializeAsJSON(scene.elements, scene.appState, scene.files, "local");
    downloadBlob(`${baseName}.excalidraw`, new Blob([serialized], { type: "application/json" }));
    setNotice("Latest edits saved as a native Excalidraw scene.");
  });
  const saveSvg = () => withBusy("svg", async () => {
    const scene = currentScene();
    const svg = await exportToSvg({ ...scene, appState: { ...scene.appState, exportBackground: true, exportWithDarkMode: scene.appState.theme === "dark" }, exportPadding: 24 });
    downloadBlob(`${baseName}.svg`, new Blob([svg.outerHTML], { type: "image/svg+xml;charset=utf-8" }));
    setNotice("SVG exported from the edited scene.");
  });
  const savePng = () => withBusy("png", async () => {
    const scene = currentScene();
    const png = await exportToBlob({ ...scene, appState: { ...scene.appState, exportBackground: true, exportWithDarkMode: scene.appState.theme === "dark" }, mimeType: "image/png", maxWidthOrHeight: 4096, exportPadding: 24 });
    downloadBlob(`${baseName}.png`, png);
    setNotice("High-resolution PNG exported from the edited scene.");
  });

  return <div className="excalidraw-editor-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="excalidraw-editor-dialog" role="dialog" aria-modal="true" aria-labelledby="excalidraw-editor-title">
      <header className="excalidraw-editor-heading">
        <div><strong id="excalidraw-editor-title">Edit with Excalidraw</strong><small>{title} · {elementCount} elements</small></div>
        <button type="button" className="excalidraw-editor-close" onClick={onClose} aria-label="Close Excalidraw editor">×</button>
      </header>
      <div className="excalidraw-editor-toolbar">
        <button type="button" onClick={() => api?.scrollToContent(undefined, { fitToViewport: true, animate: true })} disabled={!api}>Fit scene</button>
        <button type="button" onClick={saveScene} disabled={!api || Boolean(busy)}>{busy === "scene" ? "Saving…" : "Save .excalidraw"}</button>
        <button type="button" onClick={saveSvg} disabled={!api || Boolean(busy)}>{busy === "svg" ? "Exporting…" : "Export SVG"}</button>
        <button type="button" onClick={savePng} disabled={!api || Boolean(busy)}>{busy === "png" ? "Exporting…" : "Export PNG"}</button>
      </div>
      <div className="excalidraw-editor-canvas">
        <Excalidraw
          initialData={initialData}
          excalidrawAPI={setApi}
          onChange={(elements) => setElementCount(elements.length)}
          theme="dark"
          name={title}
        />
      </div>
      {notice ? <p className="excalidraw-editor-notice" role="status">{notice}</p> : null}
      <footer className="excalidraw-editor-footer">Edits stay in this browser session until you export the scene. Downloaded .excalidraw files also open in <a href="https://draw.rasies.com" target="_blank" rel="noopener noreferrer">your self-hosted Excalidraw service</a>.</footer>
    </section>
  </div>;
}
