"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";
import {
  ArrowUpRight,
  MessageCircleMore,
  Pause,
  Play,
  Radio,
  ThumbsDown,
  ThumbsUp,
  Volume2,
} from "lucide-react";
import {
  usePersistentRadioPlayer,
  type RadioTrack,
} from "./PersistentRadioPlayerProvider";
import HomeLiveLine from "./HomeLiveLine";
import { useRadioHome } from "../lib/radio-home";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { formatRadioMood } from "../lib/radio-mood";
import type { RadioNote } from "../lib/radio-notes";
import { formatTimeAgo } from "../lib/utils";

type FeedbackSummary = {
  score?: number;
  totals?: {
    up?: number;
    down?: number;
  };
};

const fetcher = async <T,>(url: string): Promise<T> => {
  const response = await fetch(url, { cache: "no-store" });
  const payload = await response.json().catch(() => null);
  return (payload ?? {}) as T;
};

const formatTrackMeta = (track?: RadioTrack | null) =>
  [track?.album, track?.year, track?.genres?.filter(Boolean).slice(0, 2).join(" / ")]
    .filter(Boolean)
    .join(" · ");

const formatTrackStamp = (track?: RadioTrack | null) => {
  if (!track?.title) return "Mr Rassy is cueing the room.";
  const artist = track.artist ? ` by ${track.artist}` : "";
  const album = track.album ? ` off ${track.album}` : "";
  const year = track.year ? ` (${track.year})` : "";
  return `${track.title}${artist}${album}${year}`;
};

const shorten = (value?: string | null, maxLength = 180) => {
  const cleaned = value?.replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  if (cleaned.length <= maxLength) return cleaned;
  return `${cleaned.slice(0, maxLength).replace(/\s+\S*$/, "")}...`;
};

const normalizeTrackText = (value?: string | null) =>
  value
    ?.toLowerCase()
    .replace(/^\s*\d+\s*[\s._-]+/, "")
    .replace(/[^\w\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim() ?? "";

const noteMatchesTrack = (note: RadioNote | null | undefined, track?: RadioTrack | null) => {
  if (!note || !track) return false;
  if (track.id && note.trackIds?.includes(track.id)) return true;

  const title = normalizeTrackText(track.title);
  const artist = normalizeTrackText(track.artist);
  const candidates = [
    note.currentTrack,
    ...note.setlist,
    ...(note.boothDossier?.sessionTracks?.map((sessionTrack) => ({
      id: sessionTrack.trackId,
      title: sessionTrack.title,
      artist: sessionTrack.artist,
    })) ?? []),
  ].filter(Boolean);

  return candidates.some((candidate) => {
    const candidateTitle = normalizeTrackText(candidate?.title);
    const candidateArtist = normalizeTrackText(candidate?.artist);
    const titleMatches =
      title &&
      candidateTitle &&
      (title === candidateTitle ||
        (title.length > 4 && candidateTitle.includes(title)) ||
        (candidateTitle.length > 4 && title.includes(candidateTitle)));
    const artistMatches =
      !artist ||
      !candidateArtist ||
      artist === candidateArtist ||
      artist.includes(candidateArtist) ||
      candidateArtist.includes(artist);
    return Boolean(titleMatches && artistMatches);
  });
};

const describeSignal = (options: {
  buffering: boolean;
  liveSourceMode: "direct" | "relay";
  liveHealthOk?: boolean;
  playing: boolean;
  useFallback: boolean;
}) => {
  if (options.useFallback) return "Stacks keeping the room warm";
  if (options.buffering) return "Catching the signal";
  if (options.liveSourceMode === "direct") {
    return options.liveHealthOk === false
      ? "Direct line is shaky"
      : "Direct station line";
  }
  if (options.playing) return "Stable live line";
  return "Ready to go live";
};

export function RadioHeroPlayer() {
  const [voteStatus, setVoteStatus] = useState<string | null>(null);
  const [voting, setVoting] = useState<"up" | "down" | null>(null);
  const {
    activeLiveQuality,
    buffering,
    canFallback,
    directLosslessUrl,
    directMp3Url,
    displayNow,
    featuredItems,
    liveHealth,
    liveSourceMode,
    playStatus,
    playing,
    queueItems,
    streamError,
    toggle,
    toggleFallback,
    toggleLiveSourceMode,
    useFallback,
  } = usePersistentRadioPlayer();

  const { data: home } = useRadioHome();
  const dj = home?.dj;
  const notes = Array.isArray(home?.notes) ? home.notes : [];
  const latestNote = home?.latestNote ?? null;
  const homeNowPlaying = home?.status?.nowPlaying ?? null;
  const currentTrack =
    displayNow ??
    homeNowPlaying ??
    latestNote?.currentTrack ??
    latestNote?.setlist[0] ??
    queueItems[0] ??
    featuredItems[0] ??
    null;
  const currentNote =
    notes.find((note) => noteMatchesTrack(note, currentTrack)) ??
    (noteMatchesTrack(latestNote, currentTrack) ? latestNote : null);
  const nextTrack =
    queueItems.find((track) => track?.id && track.id !== currentTrack?.id) ??
    featuredItems.find((track) => track?.id && track.id !== currentTrack?.id) ??
    null;

  const feedbackTrackId = currentTrack?.id ?? null;
  const { data: feedbackSummary, mutate: mutateFeedback } = useSWR<FeedbackSummary>(
    feedbackTrackId ? `/api/radio/feedback?trackId=${feedbackTrackId}` : null,
    fetcher,
    { refreshInterval: 20000 },
  );

  const moodLabel = formatRadioMood(
    dj?.mood ?? currentTrack?.genres?.[0] ?? "after-hours",
  );
  const qualityLabel =
    activeLiveQuality === "lossless" ? "Lossless line" : "MP3 line";
  const signalLabel = describeSignal({
    buffering,
    liveSourceMode,
    liveHealthOk: liveHealth?.ok,
    playing,
    useFallback,
  });
  const playLabel = playing
    ? "Pause"
    : playStatus === "loading" || buffering
      ? "Connecting..."
      : "Play Live";
  const totalUp = feedbackSummary?.totals?.up ?? 0;
  const totalDown = feedbackSummary?.totals?.down ?? 0;
  const crowdScore = feedbackSummary?.score ?? totalUp - totalDown;
  const noteAge = currentNote?.createdAt
    ? formatTimeAgo(currentNote.createdAt)
    : "Fresh";
  const djMatchesCurrentTrack =
    Boolean(currentTrack?.id && dj?.trackIds?.includes(currentTrack.id)) ||
    Boolean(
      currentTrack?.title &&
        dj?.script?.toLowerCase().includes(currentTrack.title.toLowerCase()),
    );
  const liveDjScript = djMatchesCurrentTrack ? dj?.script : null;
  const liveDjReason = djMatchesCurrentTrack ? dj?.reason : null;
  const roomLine = shorten(
    currentNote?.boothDossier?.sections?.lineup?.body ??
      currentNote?.excerpt ??
      liveDjScript ??
      (currentTrack?.title
        ? `${formatTrackStamp(currentTrack)} is in the room now, and Mr Rassy is letting the current record reset the air before the next turn.`
        : "Start the station and the room will settle around whatever is in the air right now."),
  );
  const whyLine = shorten(
    currentNote?.reason ??
      currentNote?.boothDossier?.sections?.lineup?.body ??
      liveDjReason ??
      currentNote?.boothDossier?.intro ??
      (currentTrack?.title
        ? `${currentTrack.title} is the live anchor, so this read is following the speakers until a deeper booth note catches up.`
        : "Mr Rassy is reading the room and making the next turn feel deliberate."),
    150,
  );
  const nextMove = shorten(
    currentNote?.boothDossier?.sections?.listenFor?.body ??
      currentNote?.boothDossier?.nextMove ??
      currentNote?.boothDossier?.deepCut ??
      (nextTrack ? formatTrackStamp(nextTrack) : "The next move is still forming."),
    120,
  );

  const sendVote = async (vote: "up" | "down") => {
    if (!currentTrack?.title && !currentTrack?.id) return;
    setVoting(vote);
    setVoteStatus(null);

    try {
      const response = await fetch("/api/radio/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vote,
          trackId: currentTrack?.id,
          title: currentTrack?.title,
          artist: currentTrack?.artist,
        }),
      });

      if (!response.ok) {
        setVoteStatus("Vote failed. Try it again in a second.");
        return;
      }

      await mutateFeedback();
      setVoteStatus(
        vote === "up"
          ? "Saved. Mr Rassy heard that."
          : "Saved. Mr Rassy will pull away from it.",
      );
    } catch {
      setVoteStatus("Vote failed. Try it again in a second.");
    } finally {
      setVoting(null);
    }
  };

  const statusCards = [
    {
      label: "Up next",
      value: nextTrack?.title ?? "Still sketching",
      meta: nextTrack?.artist ?? "Mr Rassy is listening for the seam",
    },
    {
      label: "Crowd score",
      value: `${crowdScore >= 0 ? "+" : ""}${crowdScore}`,
      meta: `${totalUp} up · ${totalDown} down`,
    },
    {
      label: "Notebook",
      value:
        currentNote?.boothDossier?.programming?.label ??
        currentNote?.title ??
        "Live read pending",
      meta: noteAge === "Fresh" ? "Ready now" : noteAge,
    },
    {
      label: "Signal",
      value: signalLabel,
      meta: useFallback
        ? "Held by the nearby stacks"
        : liveSourceMode === "direct"
          ? `${qualityLabel} · raw station line`
          : `${qualityLabel} · stable site line`,
    },
  ];

  return (
    <>
      <section
        id="live-radio-player"
        className="mx-auto max-w-6xl scroll-mt-28 px-6 py-10"
      >
        <div className="relative overflow-hidden rounded-[40px] border border-white/12 bg-[radial-gradient(circle_at_top_left,rgba(255,230,109,0.18),transparent_24%),radial-gradient(circle_at_84%_16%,rgba(66,245,255,0.18),transparent_30%),radial-gradient(circle_at_60%_100%,rgba(255,79,216,0.18),transparent_40%),linear-gradient(155deg,rgba(7,11,27,0.98),rgba(32,8,44,0.94))] shadow-[0_34px_110px_rgba(0,0,0,0.42)]">
          <div className="absolute inset-0 noise opacity-40" aria-hidden="true" />

          <div className="relative grid gap-8 p-6 md:p-8 lg:grid-cols-[360px_minmax(0,1fr)] lg:items-center">
            <div className="flex min-w-0 flex-col gap-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="border-white/15 bg-black/30 text-white">
                  <Radio size={12} />
                  Live
                </Badge>
                <Badge className="border-white/15 bg-black/30 text-white">
                  {moodLabel}
                </Badge>
              </div>

              <div className="relative aspect-square overflow-hidden rounded-[32px] border border-white/12 bg-black/30 shadow-[0_18px_60px_rgba(0,0,0,0.32)]">
                {currentTrack?.albumArtUrl ? (
                  <Image
                    src={currentTrack.albumArtUrl}
                    alt={currentTrack.title ?? "Album art"}
                    fill
                    sizes="(max-width: 1024px) 100vw, 360px"
                    className="object-cover"
                    unoptimized
                  />
                ) : (
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,rgba(255,255,255,0.22),transparent_18%),radial-gradient(circle_at_50%_50%,transparent_0,transparent_26%,rgba(255,255,255,0.08)_27%,transparent_28%),radial-gradient(circle_at_50%_50%,transparent_0,transparent_41%,rgba(255,255,255,0.08)_42%,transparent_43%),linear-gradient(145deg,rgba(16,10,38,0.98),rgba(10,36,50,0.86))]" />
                )}
              </div>

              <div className="rounded-[24px] border border-white/10 bg-black/28 p-4 backdrop-blur-md">
                <div className="text-[10px] uppercase tracking-[0.28em] text-cloud/55">
                  On air now
                </div>
                <div className="mt-2 break-words text-[1.75rem] font-semibold leading-tight text-white">
                  {currentTrack?.title ?? "Needle in the air"}
                </div>
                <div className="mt-2 break-words text-base text-cloud/80">
                  {currentTrack?.artist ?? "Mr Rassy"}
                </div>
                <div className="mt-4 flex items-end gap-1">
                  {[0, 1, 2, 3, 4].map((bar) => (
                    <span
                      key={bar}
                      className={`w-1.5 rounded-full bg-white/80 ${
                        playing
                          ? "animate-[equalizerPulse_1s_ease-in-out_infinite]"
                          : "opacity-35"
                      }`}
                      style={{
                        height: `${18 + bar * 5}px`,
                        animationDelay: `${bar * 120}ms`,
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="min-w-0">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3 text-[11px] uppercase tracking-[0.36em] text-cloud/58">
                  <span className="glow-dot h-2.5 w-2.5 rounded-full" />
                  Ian Rasmussen // Mr Rassy Radio
                </div>
                <Button variant="ghost" className="px-4 py-2 text-xs" asChild>
                  <Link href="/radio/notes">
                    Booth notes <ArrowUpRight size={14} />
                  </Link>
                </Button>
              </div>

            <div className="mt-5">
              <div className="text-[10px] uppercase tracking-[0.3em] text-cloud/50">
                Current room
              </div>
              <h2 className="mt-3 break-words text-3xl font-semibold leading-tight text-white md:text-5xl">
                {currentTrack?.title ?? "Needle in the air"}
              </h2>
              <div className="mt-2 break-words text-xl text-cloud/82 md:text-2xl">
                {currentTrack?.artist ?? "Mr Rassy"}
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.2em] text-cloud/62">
              <span className="rave-chip rounded-full px-3 py-2">
                {formatTrackMeta(currentTrack) || "Live radio cut"}
              </span>
              <span className="rave-chip rounded-full px-3 py-2">
                {signalLabel}
              </span>
              <span className="rave-chip rounded-full px-3 py-2">
                Crowd {crowdScore >= 0 ? `+${crowdScore}` : crowdScore}
              </span>
            </div>

            <div className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_300px]">
              <div className="rounded-[28px] border border-white/10 bg-black/20 p-5">
                <div className="text-[10px] uppercase tracking-[0.28em] text-cloud/55">
                  In the booth now
                </div>
                <p className="mt-3 text-base leading-8 text-cloud/88 md:text-lg">
                  {roomLine}
                </p>
              </div>

              <div className="grid gap-3">
                <div className="rounded-[24px] border border-white/10 bg-black/18 p-4">
                  <div className="text-[10px] uppercase tracking-[0.24em] text-cloud/55">
                    Why it landed
                  </div>
                  <p className="mt-3 text-sm leading-7 text-cloud/80">
                    {whyLine}
                  </p>
                </div>
                <div className="rounded-[24px] border border-white/10 bg-black/18 p-4">
                  <div className="text-[10px] uppercase tracking-[0.24em] text-cloud/55">
                    Next move
                  </div>
                  <p className="mt-3 text-sm leading-7 text-cloud/80">
                    {nextMove}
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <Button
                className="h-14 min-w-[11.5rem] justify-center text-base md:text-lg"
                onClick={() => void toggle()}
                disabled={playStatus === "loading"}
              >
                {playing ? <Pause size={18} /> : <Play size={18} />}
                {playLabel}
              </Button>
              <Button
                variant="secondary"
                className="h-14 px-5"
                onClick={() => void sendVote("up")}
                disabled={voting !== null}
              >
                <ThumbsUp size={16} />
                {voting === "up" ? "Sending..." : `Love this · ${totalUp}`}
              </Button>
              <Button
                variant="secondary"
                className="h-14 px-5"
                onClick={() => void sendVote("down")}
                disabled={voting !== null}
              >
                <ThumbsDown size={16} />
                {voting === "down" ? "Sending..." : `Not this one · ${totalDown}`}
              </Button>
            </div>

            <div className="mt-3 flex flex-wrap gap-2.5">
              <Button variant="secondary" className="h-11 px-4" asChild>
                <Link href="/radio">
                  <Radio size={16} />
                  Full booth
                </Link>
              </Button>
              <Button variant="secondary" className="h-11 px-4" asChild>
                <Link href="/radio#booth-chat">
                  <MessageCircleMore size={16} />
                  Talk live
                </Link>
              </Button>
              <Button variant="ghost" className="h-11 px-4" asChild>
                <a href={directMp3Url} target="_blank" rel="noreferrer">
                  <Volume2 size={16} />
                  Live MP3
                </a>
              </Button>
              <Button variant="ghost" className="h-11 px-4" asChild>
                <a
                  href={directLosslessUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Volume2 size={16} />
                  Live lossless
                </a>
              </Button>
            </div>

            {(voteStatus || streamError) && (
              <div className="mt-3 text-sm text-cloud/70">
                {voteStatus ?? streamError}
              </div>
            )}

            <div className="mt-3 flex flex-wrap gap-3">
              <Button
                variant="ghost"
                className="px-4 py-2 text-xs"
                onClick={toggleFallback}
                disabled={!canFallback}
              >
                {useFallback ? "Back to live line" : "Hear the stacks"}
              </Button>
              {!useFallback && (
                <Button
                  variant="ghost"
                  className="px-4 py-2 text-xs"
                  onClick={toggleLiveSourceMode}
                >
                  {liveSourceMode === "direct"
                    ? "Use stable line"
                    : "Try direct line"}
                </Button>
              )}
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
              {statusCards.map((item) => (
                <div
                  key={item.label}
                  className="rounded-[24px] border border-white/10 bg-black/18 px-4 py-4"
                >
                  <div className="text-[10px] uppercase tracking-[0.24em] text-cloud/45">
                    {item.label}
                  </div>
                  <div className="mt-2 break-words text-sm font-semibold leading-5 text-white">
                    {item.value}
                  </div>
                  <div className="mt-2 text-xs leading-5 text-cloud/62">
                    {item.meta}
                  </div>
                </div>
              ))}
            </div>
            </div>
          </div>
        </div>
      </section>
      <HomeLiveLine />
    </>
  );
}
