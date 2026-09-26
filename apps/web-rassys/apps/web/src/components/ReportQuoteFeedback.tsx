"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

type Selection = { quote: string; start: number; end: number };

export function ReportQuoteFeedback({ reportId, markdown, children }: { reportId: string; markdown: string; children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [note, setNote] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");

  useEffect(() => {
    const onSelection = () => {
      const browserSelection = window.getSelection();
      if (!browserSelection || browserSelection.isCollapsed || !root.current?.contains(browserSelection.anchorNode)) return;
      const quote = browserSelection.toString().trim();
      if (!quote || quote.length > 1000) return;
      const start = markdown.indexOf(quote);
      if (start < 0 || markdown.indexOf(quote, start + quote.length) >= 0) return;
      setSelection({ quote, start, end: start + quote.length });
      setState("idle");
    };
    document.addEventListener("selectionchange", onSelection);
    return () => document.removeEventListener("selectionchange", onSelection);
  }, [markdown]);

  const submit = async (reaction: "useful" | "question") => {
    if (!selection) return;
    setState("sending");
    try {
      const response = await fetch(`/api/reports/${reportId}/feedback`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reaction, quote: selection.quote, start: selection.start, end: selection.end, note: note.trim() || undefined }),
      });
      if (!response.ok) throw new Error("feedback_failed");
      setState("sent");
      window.getSelection()?.removeAllRanges();
    } catch { setState("error"); }
  };

  return <div ref={root} className="relative">
    {children}
    {selection && <aside className="sticky bottom-4 z-20 mx-auto mt-4 max-w-xl rounded-2xl border border-glow/35 bg-[#20152c]/95 p-4 shadow-2xl backdrop-blur" aria-live="polite">
      <p className="text-xs text-cloud/75">Selected passage: “{selection.quote.slice(0, 180)}{selection.quote.length > 180 ? "…" : ""}”</p>
      <label className="mt-3 block text-xs text-cloud/70">Optional note
        <textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={600} rows={2} className="mt-1 w-full rounded-lg border border-white/15 bg-black/25 p-2 text-sm" placeholder="What should improve or stay useful?" />
      </label>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={() => submit("useful")} disabled={state === "sending" || state === "sent"} className="rounded-full bg-glow px-3 py-1.5 text-sm font-medium text-[#160c20] disabled:opacity-60">👍 Useful</button>
        <button type="button" onClick={() => submit("question")} disabled={state === "sending" || state === "sent"} className="rounded-full border border-white/25 px-3 py-1.5 text-sm disabled:opacity-60">? Question</button>
        <span className="self-center text-xs text-cloud/70">{state === "sending" ? "Sending…" : state === "sent" ? "Sent for review." : state === "error" ? "Could not send. Try again." : "Feedback is reviewed before it informs a later report."}</span>
      </div>
    </aside>}
  </div>;
}
