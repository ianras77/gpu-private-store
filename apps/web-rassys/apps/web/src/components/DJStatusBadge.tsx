"use client";

import useSWR from "swr";
import { formatRadioMood } from "../lib/radio-mood";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export function DJStatusBadge() {
  const { data } = useSWR("/api/radio/status", fetcher, { refreshInterval: 15000 });
  const mode = data?.djMode ?? "unknown";
  const queueDepth = Number(data?.queueDepth ?? 0);
  const rawMood = typeof data?.mood === "string" ? data.mood : "";
  const mood = rawMood ? formatRadioMood(rawMood) : "";
  const label =
    mode === "fallback"
      ? "Ian by feel"
      : mode === "unknown"
        ? "Signal warming"
        : "Mr Rassy live";
  const tone =
    mode === "fallback"
      ? "border-comet/20 bg-comet/10 text-comet"
      : mode === "unknown"
        ? "border-white/10 bg-white/5 text-cloud/75"
        : "border-glow/20 bg-glow/10 text-glow";
  const dotTone =
    mode === "fallback"
      ? "bg-comet shadow-[0_0_12px_rgba(255,111,145,0.55)]"
      : mode === "unknown"
        ? "bg-white/45 shadow-[0_0_10px_rgba(255,255,255,0.2)]"
        : "bg-glow shadow-[0_0_14px_rgba(255,230,109,0.55)]";
  const queueLabel =
    mode === "fallback"
      ? queueDepth > 0
        ? `${queueDepth} on deck`
        : "Setting the room"
      : mood
        ? `Ian Rasmussen · ${mood}`
        : "Ian Rasmussen";

  return (
    <div className="flex items-center gap-2">
      <span
        className={`rave-chip inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.3em] ${tone}`}
      >
        <span className={`h-2 w-2 rounded-full ${dotTone}`} />
        {label}
      </span>
      <span
        className="rave-chip hidden rounded-full px-3 py-1 text-[10px] uppercase tracking-[0.3em] text-cloud/70 md:inline-flex"
      >
        {queueLabel}
      </span>
    </div>
  );
}
