"use client";

import Link from "next/link";
import useSWR from "swr";
import {
  BrainCircuit,
  NotebookText,
  Pause,
  Play,
  Radio,
  Sparkles,
} from "lucide-react";
import { formatRadioMood } from "../lib/radio-mood";
import { formatTimeAgo } from "../lib/utils";
import { usePersistentRadioPlayer } from "./PersistentRadioPlayerProvider";
import { Button } from "./ui/button";

type RadioSnapshot = {
  available?: boolean;
  now?: {
    title?: string;
    artist?: string;
    album?: string;
    year?: number;
  } | null;
  status?: {
    mood?: string;
    queueDepth?: number;
    requestLineDepth?: number;
    libraryTracks?: number;
    llmDirector?: {
      active?: boolean;
      driving?: boolean;
      model?: string;
    } | null;
  } | null;
  hears?: {
    headline?: string;
    intro?: string;
    source?: string;
    at?: number;
  } | null;
  latestNote?: {
    id?: string;
    title?: string;
    excerpt?: string;
    createdAt?: string;
  } | null;
};

const fetcher = (url: string) =>
  fetch(url, { cache: "no-store" }).then(async (res) => {
    if (!res.ok) {
      throw new Error(`radio_snapshot_failed_${res.status}`);
    }
    return res.json() as Promise<RadioSnapshot>;
  });

const formatTrackLabel = (track?: RadioSnapshot["now"]) => {
  if (!track?.title) return "The booth is warming up";
  return track.artist ? `${track.title} · ${track.artist}` : track.title;
};

const formatTrackMeta = (track?: RadioSnapshot["now"]) =>
  [track?.album, track?.year].filter(Boolean).join(" · ");

const shorten = (value?: string | null, maxLength = 170) => {
  const cleaned = value?.replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  if (cleaned.length <= maxLength) return cleaned;
  return `${cleaned.slice(0, maxLength).replace(/\s+\S*$/, "")}...`;
};

export function SignalOverviewPanel() {
  const { data } = useSWR<RadioSnapshot>("/api/radio/snapshot", fetcher, {
    refreshInterval: 20000,
  });
  const { buffering, playStatus, playing, streamError, toggle, useFallback } =
    usePersistentRadioPlayer();

  const status = data?.status ?? null;
  const now = data?.now ?? null;
  const hears = data?.hears ?? null;
  const latestNote = data?.latestNote ?? null;
  const llmActive = status?.llmDirector?.active === true;
  const directionLabel =
    llmActive && status?.llmDirector?.driving !== false
      ? "LLM in the booth"
      : "Hand-guided booth";
  const noteHref = latestNote?.id ? `/radio/notes#${latestNote.id}` : "/radio/notes";
  const hearingTime =
    typeof hears?.at === "number"
      ? formatTimeAgo(new Date(hears.at).toISOString())
      : "";
  const libraryCount =
    typeof status?.libraryTracks === "number" ? status.libraryTracks : null;
  const requestDepth =
    typeof status?.requestLineDepth === "number" ? status.requestLineDepth : 0;
  const playLabel = playing
    ? "Pause Live Signal"
    : playStatus === "loading" || buffering
      ? "Connecting Live Signal..."
      : "Play Live Signal";
  const playHint = useFallback
    ? "The shared player is keeping the room warm from the shelves while the live line steadies."
    : playing
      ? "This is the same player used everywhere else on the site, so the stream keeps running while you move around."
      : "Starts the shared player immediately and keeps the booth running while you browse the rest of the site.";

  return (
    <div className="glass-panel overflow-hidden rounded-[32px] p-5 md:p-6">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,230,109,0.14),transparent_30%),radial-gradient(circle_at_82%_18%,rgba(66,245,255,0.18),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(255,79,216,0.16),transparent_34%)]" />
      <div className="relative flex flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-[11px] uppercase tracking-[0.36em] text-cloud/58">
            Live Signal
          </div>
          <div className="flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.22em] text-cloud/60">
            <span className="rave-chip rounded-full px-3 py-2">
              Ian Rasmussen
            </span>
            <span className="rave-chip rounded-full px-3 py-2">
              Mr Rassy live
            </span>
          </div>
        </div>

        <div>
          <h3 className="text-2xl font-semibold text-white md:text-[2rem]">
            Mr Rassy is live in the station right now.
          </h3>
          <p className="mt-3 text-sm leading-7 text-cloud/82">
            The radio is the quickest way into the whole place: live booth,
            request line, saved notes, and a running read on what the set is
            doing as it shifts.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(220px,0.9fr)]">
          <div className="rounded-[28px] border border-white/10 bg-[linear-gradient(155deg,rgba(9,16,33,0.94),rgba(20,41,56,0.78))] p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="text-[10px] uppercase tracking-[0.3em] text-cloud/55">
                On air now
              </div>
                <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/20 px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-cloud/68">
                  <span className="glow-dot h-2 w-2 rounded-full" />
                  {formatRadioMood(status?.mood)}
                </span>
              </div>
            <div className="mt-4 flex items-start gap-4">
              <div className="rave-chip flex h-12 w-12 items-center justify-center rounded-2xl text-glow">
                <Radio size={20} />
              </div>
              <div className="min-w-0">
                <div className="text-lg font-semibold text-white">
                  {formatTrackLabel(now)}
                </div>
                <p className="mt-2 text-sm leading-6 text-cloud/76">
                  {formatTrackMeta(now) ||
                    "The booth is still finding the exact seam in the room."}
                </p>
                <div className="mt-4 flex flex-col gap-3">
                  <Button
                    className="h-12 justify-center text-sm sm:max-w-[15rem]"
                    onClick={() => void toggle()}
                    disabled={playStatus === "loading"}
                  >
                    {playing ? <Pause size={16} /> : <Play size={16} />}
                    {playLabel}
                  </Button>
                  <p className="text-xs leading-6 text-cloud/62">{playHint}</p>
                  {streamError && (
                    <p className="text-xs leading-6 text-comet">{streamError}</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-[28px] border border-white/10 bg-black/25 p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="text-[10px] uppercase tracking-[0.3em] text-cloud/55">
                What Mr Rassy Hears
              </div>
              <span className="text-[10px] uppercase tracking-[0.22em] text-cloud/48">
                {hearingTime || "fresh"}
              </span>
            </div>
            <div className="mt-3 text-lg font-semibold text-white">
              {hears?.headline || "The booth notebook is warming up."}
            </div>
            <p className="mt-3 text-sm leading-7 text-cloud/80">
              {shorten(
                hears?.intro ||
                  latestNote?.excerpt ||
                  "The live booth notes keep a memory of the room while it is still changing.",
              )}
            </p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-[24px] border border-white/10 bg-black/18 p-4">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.28em] text-cloud/55">
              <BrainCircuit size={14} className="text-glow" />
              Booth direction
            </div>
            <div className="mt-3 text-sm font-semibold text-white">
              {directionLabel}
            </div>
            <p className="mt-2 text-sm leading-6 text-cloud/74">
              {llmActive
                ? "Mr Rassy is using the shared intelligence runtime to shape turns, answer the line, and keep the notes sharp."
                : "The booth is still holding together by hand while the live director catches up."}
            </p>
          </div>

          <div className="rounded-[24px] border border-white/10 bg-black/18 p-4">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.28em] text-cloud/55">
              <Sparkles size={14} className="text-glow" />
              Library in frame
            </div>
            <div className="mt-3 text-sm font-semibold text-white">
              {libraryCount ? `${libraryCount} shelf tracks` : "Whole shelf"}
            </div>
            <p className="mt-2 text-sm leading-6 text-cloud/74">
              The station and the listening room are pulling from the same
              shelves.
            </p>
          </div>

          <div className="rounded-[24px] border border-white/10 bg-black/18 p-4">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.28em] text-cloud/55">
              <NotebookText size={14} className="text-glow" />
              Latest note
            </div>
            <div className="mt-3 text-sm font-semibold text-white">
              {latestNote?.title || "Booth archive open"}
            </div>
            <p className="mt-2 text-sm leading-6 text-cloud/74">
              {requestDepth > 0
                ? `${requestDepth} request${requestDepth === 1 ? "" : "s"} are live on the line right now.`
                : "The notebook is keeping a running memory of the night instead of letting it evaporate."}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button asChild>
            <Link href="/radio#booth-chat">Ask Mr Rassy</Link>
          </Button>
          <Button variant="secondary" asChild>
            <Link href={noteHref}>Read booth notes</Link>
          </Button>
          <Button variant="secondary" asChild>
            <Link href="/listening-room">Browse the shelves</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
