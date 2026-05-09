"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRadioHome } from "../lib/radio-home";
import { Button } from "./ui/button";
import {
  usePersistentRadioPlayer,
  type RadioTrack,
} from "./PersistentRadioPlayerProvider";
import { formatTimeAgo } from "../lib/utils";

type RadioNoteTrack = {
  id?: string;
  title: string;
  artist: string;
  album?: string;
  albumArtUrl?: string;
  year?: number;
  genres?: string[];
  energy?: number;
  duration?: number;
};

type RadioNote = {
  id: string;
  title: string;
  excerpt: string;
  mood?: string | null;
  reason?: string | null;
  trackIds?: string[];
  currentTrack?: RadioNoteTrack | null;
  setlist: RadioNoteTrack[];
  boothDossier?: {
    headline?: string | null;
    intro?: string | null;
    deepCut?: string | null;
    nextMove?: string | null;
    sections?: {
      lineup?: {
        title?: string | null;
        body?: string | null;
      } | null;
      context?: {
        title?: string | null;
        body?: string | null;
      } | null;
      listenFor?: {
        title?: string | null;
        body?: string | null;
      } | null;
    } | null;
    sessionTracks?: Array<{
      trackId?: string;
      title: string;
      artist: string;
      slot: number;
      role?: "now" | "next" | "later";
      whyItFits: string;
      context: string;
      listenFor: string;
      playbackMode?: "full" | "clip";
      playbackReason?: string;
    }> | null;
    programming?: {
      label?: string | null;
      description?: string | null;
    } | null;
  } | null;
  createdAt: string;
};

const formatRadioMood = (value?: string | null) => {
  const trimmed = value?.trim();
  if (!trimmed) return "after-hours";
  const cleaned = trimmed.replace(/[_-]+/g, " ");
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
};

const trackMeta = (
  track?: {
    album?: string;
    year?: number;
    genres?: string[];
  } | null,
) =>
  [track?.album, track?.year, track?.genres?.slice(0, 2).join(" / ")]
    .filter(Boolean)
    .join(" · ");

const shorten = (value?: string | null, maxLength = 170) => {
  const cleaned = value?.replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  if (cleaned.length <= maxLength) return cleaned;
  return `${cleaned.slice(0, maxLength).replace(/\s+\S*$/, "")}...`;
};

type TrackLike = Partial<RadioTrack | RadioNoteTrack>;

const formatTrackStamp = (track?: RadioNoteTrack | null) => {
  if (!track?.title) return "the live record";
  const artist = track.artist ? ` by ${track.artist}` : "";
  const album = track.album ? ` off ${track.album}` : "";
  const year = track.year ? ` (${track.year})` : "";
  return `${track.title}${artist}${album}${year}`;
};

const normalizeTrackText = (value?: string | null) =>
  value
    ?.toLowerCase()
    .replace(/^\s*\d+\s*[\s._-]+/, "")
    .replace(/[^\w\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim() ?? "";

const noteMatchesTrack = (note: RadioNote | null | undefined, track?: RadioNoteTrack | null) => {
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
  ].filter(Boolean) as RadioNoteTrack[];

  return candidates.some((candidate) => {
    const candidateTitle = normalizeTrackText(candidate.title);
    const candidateArtist = normalizeTrackText(candidate.artist);
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

const toNoteTrack = (track?: TrackLike | null): RadioNoteTrack | null => {
  if (!track) return null;
  const title = track.title?.trim();
  if (!title) return null;
  return {
    id: track.id,
    title,
    artist: track.artist?.trim() || "Mr Rassy",
    album: track.album,
    albumArtUrl: track.albumArtUrl,
    year: track.year,
    genres: track.genres,
    energy: track.energy,
    duration: "duration" in track ? track.duration : undefined,
  };
};

const buildLiveSessionTracks = (
  currentTrack: RadioNoteTrack,
  queueTracks: RadioNoteTrack[],
) =>
  [currentTrack, ...queueTracks]
    .filter((track, index, tracks) => {
      const key = track.id ?? `${track.title}-${track.artist}`;
      return (
        tracks.findIndex(
          (candidate) => (candidate.id ?? `${candidate.title}-${candidate.artist}`) === key,
        ) === index
      );
    })
    .slice(0, 4)
    .map((track, index) => ({
      trackId: track.id,
      title: track.title,
      artist: track.artist,
      slot: index + 1,
      role: index === 0 ? ("now" as const) : index === 1 ? ("next" as const) : ("later" as const),
      whyItFits:
        index === 0
          ? `${track.title} is the record actually in the room now, so the live note is following the speakers instead of the archive.`
          : `${track.title} is sitting close enough to shape the next handoff.`,
      context: trackMeta(track) || "The deeper note is still catching up to this turn.",
      listenFor:
        index === 0
          ? "Listen for how this record changes the pressure in the room before the next move arrives."
          : "Listen for the handoff it can make from the current record.",
    }));

const buildLiveFallbackNote = (options: {
  currentTrack: RadioNoteTrack | null;
  queueTracks: RadioNoteTrack[];
  mood?: string | null;
  fetchedAt?: string | null;
}): RadioNote | null => {
  const { currentTrack, queueTracks, mood, fetchedAt } = options;
  if (!currentTrack) return null;

  const nextTrack = queueTracks.find((track) => track.id !== currentTrack.id) ?? null;
  const liveDeck = buildLiveSessionTracks(currentTrack, queueTracks);
  const headline = `${currentTrack.title}${currentTrack.artist ? ` // ${currentTrack.artist}` : ""}`;
  const intro = `${formatTrackStamp(currentTrack)} is the record in the room now. The written booth note is catching up, but the live read has moved with the song.`;
  const nextMove = nextTrack
    ? `${formatTrackStamp(nextTrack)} is the next move sitting near the fader.`
    : "The next move is still taking shape near the fader.";

  return {
    id: `live-${currentTrack.id ?? `${currentTrack.artist}-${currentTrack.title}`}`,
    title: headline,
    excerpt: intro,
    mood,
    reason: `${currentTrack.title} is live now, so stale booth copy is being held back until a matching note arrives.`,
    trackIds: liveDeck
      .map((track) => track.trackId)
      .filter((trackId): trackId is string => Boolean(trackId)),
    currentTrack,
    setlist: [currentTrack, ...queueTracks].slice(0, 4),
    boothDossier: {
      headline,
      intro,
      deepCut: trackMeta(currentTrack) || "The record has the room; the archive note is still being written.",
      nextMove,
      sections: {
        lineup: {
          title: "Live turn",
          body: intro,
        },
        context: {
          title: "Record in the room",
          body: trackMeta(currentTrack) || `${currentTrack.artist} is carrying this turn.`,
        },
        listenFor: {
          title: "Next move",
          body: nextMove,
        },
      },
      sessionTracks: liveDeck,
      programming: {
        label: "Live read",
        description:
          "This panel is following the actual on-air song while the longer written booth note catches up.",
      },
    },
    createdAt: fetchedAt ?? new Date().toISOString(),
  };
};

type FocusSectionKey = "lineup" | "context" | "listen";

export function MrRassyNotesPanel() {
  const { displayNow, queueItems, featuredItems } = usePersistentRadioPlayer();
  const { data } = useRadioHome();
  const notes = (Array.isArray(data?.notes) ? data.notes : []) as RadioNote[];
  const liveTrack =
    toNoteTrack(displayNow) ??
    toNoteTrack(data?.status?.nowPlaying) ??
    toNoteTrack(notes[0]?.currentTrack) ??
    toNoteTrack(notes[0]?.setlist[0]) ??
    null;
  const liveQueueTracks = [
    ...queueItems.map(toNoteTrack),
    ...featuredItems.map(toNoteTrack),
  ].filter((track): track is RadioNoteTrack => Boolean(track));
  const matchedNote = notes.find((note) => noteMatchesTrack(note, liveTrack)) ?? null;
  const fallbackNote = buildLiveFallbackNote({
    currentTrack: liveTrack,
    queueTracks: liveQueueTracks,
    mood: data?.status?.mood ?? data?.dj?.mood ?? null,
    fetchedAt: data?.fetchedAt,
  });
  const currentNote = matchedNote ?? fallbackNote ?? (liveTrack ? null : notes[0] ?? null);
  const isLiveFallbackNote = Boolean(currentNote && !matchedNote && liveTrack);
  const historyNotes = currentNote
    ? notes.filter((note) => note.id !== matchedNote?.id).slice(0, 4)
    : notes.slice(0, 4);
  const currentTrack = liveTrack ?? currentNote?.currentTrack ?? currentNote?.setlist[0] ?? null;
  const lineupSection = currentNote?.boothDossier?.sections?.lineup;
  const contextSection = currentNote?.boothDossier?.sections?.context;
  const listenForSection = currentNote?.boothDossier?.sections?.listenFor;
  const sessionTracks = currentNote?.boothDossier?.sessionTracks ?? [];
  const focusSections = [
    {
      id: "lineup" as const,
      label: "Lineup",
      title: lineupSection?.title ?? currentNote?.title ?? "Lineup note",
      body:
        lineupSection?.body ??
        currentNote?.reason ??
        "The booth copy is warm and the note is still settling.",
    },
    {
      id: "context" as const,
      label: "Track context",
      title: contextSection?.title ?? "Inside the record",
      body:
        contextSection?.body ??
        currentNote?.boothDossier?.deepCut ??
        "The room has the outline. The deeper note is catching up.",
    },
    {
      id: "listen" as const,
      label: "Listen for",
      title: listenForSection?.title ?? "What to catch",
      body:
        listenForSection?.body ??
        currentNote?.boothDossier?.nextMove ??
        currentNote?.boothDossier?.deepCut ??
        "The next turn is still taking shape.",
    },
  ];
  const firstFocusSection =
    focusSections.find((section) => section.body.trim().length > 0) ?? focusSections[0];
  const visibleSessionTracks = sessionTracks.slice(0, 4);
  const firstSessionTrackSlot = visibleSessionTracks[0]?.slot ?? null;
  const [activeFocus, setActiveFocus] = useState<FocusSectionKey>(
    firstFocusSection?.id ?? "lineup",
  );
  const [activeTrackSlot, setActiveTrackSlot] = useState<number | null>(
    firstSessionTrackSlot,
  );

  useEffect(() => {
    setActiveFocus(firstFocusSection?.id ?? "lineup");
    setActiveTrackSlot(firstSessionTrackSlot);
  }, [currentNote?.id, firstFocusSection?.id, firstSessionTrackSlot]);

  const selectedFocus =
    focusSections.find((section) => section.id === activeFocus) ??
    firstFocusSection;
  const selectedSessionTrack =
    visibleSessionTracks.find((track) => track.slot === activeTrackSlot) ??
    visibleSessionTracks[0] ??
    null;
  const spotlightSections: Array<{ label: string; body: string }> = selectedSessionTrack
    ? [
        {
          label: "Why it fits",
          body: selectedSessionTrack.whyItFits,
        },
        {
          label: "Track context",
          body: selectedSessionTrack.context,
        },
        {
          label: "Listen for",
          body: selectedSessionTrack.listenFor,
        },
        selectedSessionTrack.playbackReason
          ? {
              label:
                selectedSessionTrack.playbackMode === "clip"
                  ? "Playback move"
                  : "How it plays",
              body: selectedSessionTrack.playbackReason,
            }
          : null,
      ].filter((section): section is { label: string; body: string } => Boolean(section))
    : [];

  return (
    <section
      id="radio-notes"
      className="mx-auto max-w-6xl scroll-mt-28 px-6 py-10"
    >
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="max-w-3xl">
          <div className="text-[11px] uppercase tracking-[0.38em] text-cloud/58">
            Booth Notes
          </div>
          <h2 className="mt-3 text-3xl font-semibold text-white md:text-4xl">
            What I&apos;m hearing right now.
          </h2>
        </div>
        <Button variant="secondary" asChild>
          <Link href="/radio/notes">Open full archive</Link>
        </Button>
      </div>

      {!currentNote ? (
        <div className="rounded-[30px] border border-white/10 bg-black/20 p-6 text-sm text-cloud/72">
          The next booth note will land here as soon as Mr Rassy writes one.
        </div>
      ) : (
        <div className="grid gap-6">
          {currentNote && (
            <div className="rounded-[34px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(255,230,109,0.14),transparent_28%),radial-gradient(circle_at_82%_16%,rgba(66,245,255,0.14),transparent_30%),linear-gradient(150deg,rgba(10,14,30,0.96),rgba(42,9,44,0.88))] p-6 shadow-[0_26px_80px_rgba(0,0,0,0.32)] md:p-7">
              <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-cloud/58">
                <span className="rave-chip rounded-full px-3 py-2">
                  {isLiveFallbackNote ? "Live read" : "Latest note"}
                </span>
                <span className="rave-chip rounded-full px-3 py-2">
                  {formatRadioMood(currentNote.mood)}
                </span>
                <span className="rave-chip rounded-full px-3 py-2">
                  {formatTimeAgo(currentNote.createdAt) || "recent"}
                </span>
              </div>

              <h3 className="mt-5 max-w-4xl break-words text-3xl font-semibold leading-tight text-white md:text-4xl">
                {currentNote.boothDossier?.headline ?? currentNote.title}
              </h3>
              <p className="mt-4 max-w-3xl text-base leading-7 text-cloud/84 md:text-lg">
                {shorten(currentNote.boothDossier?.intro ?? currentNote.excerpt, 260)}
              </p>

              <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
                <div className="min-w-0 rounded-[28px] border border-white/10 bg-black/18 p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="text-[10px] uppercase tracking-[0.28em] text-cloud/55">
                      Booth focus
                    </div>
                    <div className="text-xs text-cloud/50">
                      One thought at a time
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {focusSections.map((section) => (
                      <button
                        key={`${currentNote.id}-${section.id}`}
                        type="button"
                        onClick={() => setActiveFocus(section.id)}
                        className={`rounded-full border px-3 py-2 text-[10px] uppercase tracking-[0.22em] transition ${
                          selectedFocus?.id === section.id
                            ? "border-white/22 bg-white/10 text-white"
                            : "border-white/10 bg-black/18 text-cloud/66 hover:text-white"
                        }`}
                      >
                        {section.label}
                      </button>
                    ))}
                  </div>

                  {selectedFocus && (
                    <div className="mt-4 min-w-0 rounded-[24px] border border-white/10 bg-[linear-gradient(155deg,rgba(8,15,34,0.92),rgba(26,10,44,0.82))] p-5">
                      <div className="text-[10px] uppercase tracking-[0.24em] text-cloud/48">
                        {selectedFocus.label}
                      </div>
                      <div className="mt-3 break-words text-xl font-semibold text-white">
                        {selectedFocus.title}
                      </div>
                      <p className="mt-3 break-words text-sm leading-7 text-cloud/80 md:text-[15px]">
                        {selectedFocus.body}
                      </p>
                    </div>
                  )}
                </div>

                <div className="grid gap-4 lg:self-start">
                  <div className="rounded-[28px] border border-white/10 bg-black/25 p-5">
                    <div className="text-[10px] uppercase tracking-[0.28em] text-cloud/55">
                      Record in the room
                    </div>
                    <div className="mt-4 flex items-center gap-4">
                      <div className="relative h-24 w-24 overflow-hidden rounded-2xl border border-white/10 bg-black/40">
                        {currentTrack?.albumArtUrl ? (
                          <Image
                            src={currentTrack.albumArtUrl}
                            alt={currentTrack.title}
                            fill
                            sizes="96px"
                            className="object-cover"
                            unoptimized
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center text-[10px] uppercase tracking-[0.2em] text-cloud/55">
                            No Art
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="break-words text-base font-semibold text-white">
                          {currentTrack?.title ?? "The booth is listening"}
                        </div>
                        <div className="break-words text-sm text-cloud/70">
                          {currentTrack?.artist ?? "Mr Rassy"}
                        </div>
                        <div className="mt-2 text-xs leading-6 text-cloud/58">
                          {trackMeta(currentTrack)}
                        </div>
                      </div>
                    </div>
                  </div>

                  {(currentNote.boothDossier?.deepCut ||
                    currentNote.boothDossier?.programming?.description) && (
                    <div className="rounded-[28px] border border-white/10 bg-black/20 p-5">
                      <div className="text-[10px] uppercase tracking-[0.28em] text-cloud/55">
                        Booth detail
                      </div>
                      <p className="mt-3 break-words text-sm leading-7 text-cloud/78 md:text-[15px]">
                        {shorten(
                          currentNote.boothDossier?.programming?.description ??
                            currentNote.boothDossier?.deepCut,
                          180,
                        )}
                      </p>
                    </div>
                  )}

                  <Button asChild>
                    <Link href={isLiveFallbackNote ? "/radio/notes" : `/radio/notes#${currentNote.id}`}>
                      {isLiveFallbackNote ? "Open archive" : "Open this note"}
                    </Link>
                  </Button>
                </div>
              </div>

              <div className="mt-4 min-w-0 rounded-[28px] border border-white/10 bg-[linear-gradient(155deg,rgba(7,16,34,0.94),rgba(20,9,37,0.88))] p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="text-[10px] uppercase tracking-[0.28em] text-cloud/55">
                    Session deck
                  </div>
                  {currentNote.boothDossier?.programming?.label && (
                    <div className="text-[10px] uppercase tracking-[0.22em] text-cloud/50">
                      {currentNote.boothDossier.programming.label}
                    </div>
                  )}
                </div>

                {visibleSessionTracks.length > 0 ? (
                  <>
                    <div className="mt-4 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                      <div className="flex min-w-max gap-3">
                        {visibleSessionTracks.map((track) => (
                          <button
                            key={`${currentNote.id}-${track.trackId ?? `${track.artist}-${track.title}`}-${track.slot}`}
                            type="button"
                            onClick={() => setActiveTrackSlot(track.slot)}
                            className={`w-[220px] rounded-[20px] border p-4 text-left transition ${
                              selectedSessionTrack?.slot === track.slot
                                ? "border-white/20 bg-white/10"
                                : "border-white/10 bg-black/18 hover:border-white/18"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-3 text-[10px] uppercase tracking-[0.22em] text-cloud/48">
                              <span>{String(track.slot).padStart(2, "0")}</span>
                              <span>{track.role ?? "set"}</span>
                            </div>
                            <div className="mt-3 line-clamp-2 break-words text-sm font-semibold leading-6 text-white">
                              {track.title}
                            </div>
                            <div className="mt-1 line-clamp-2 text-xs leading-5 text-cloud/70">
                              {track.artist}
                            </div>
                            {track.playbackMode && (
                              <div className="mt-2 text-[10px] uppercase tracking-[0.22em] text-cloud/46">
                                {track.playbackMode === "clip"
                                  ? "Excerpted play"
                                  : "Full play"}
                              </div>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>

                    {selectedSessionTrack && (
                      <div className="mt-4 min-w-0 rounded-[24px] border border-white/10 bg-black/16 p-5">
                        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/10 pb-4">
                          <div className="min-w-0 flex-1">
                            <div className="text-[10px] uppercase tracking-[0.24em] text-cloud/50">
                              Track spotlight
                            </div>
                            <div className="mt-2 break-words text-lg font-semibold leading-7 text-white md:text-xl">
                              {selectedSessionTrack.title}
                            </div>
                            <div className="mt-1 break-words text-sm text-cloud/70">
                              {selectedSessionTrack.artist}
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.22em] text-cloud/48">
                            <span className="rave-chip rounded-full px-3 py-2">
                              {selectedSessionTrack.role ?? "set"}
                            </span>
                            {selectedSessionTrack.playbackMode && (
                              <span className="rave-chip rounded-full px-3 py-2">
                                {selectedSessionTrack.playbackMode === "clip"
                                  ? "Excerpted play"
                                  : "Full play"}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="mt-4 grid gap-3">
                          {spotlightSections.map((section) => (
                            <div
                              key={`${currentNote.id}-${selectedSessionTrack.slot}-${section.label}`}
                              className="min-w-0 rounded-[20px] border border-white/10 bg-black/22 p-4 sm:grid sm:grid-cols-[124px_minmax(0,1fr)] sm:items-start sm:gap-4"
                            >
                              <div className="text-[10px] uppercase tracking-[0.22em] text-cloud/46 sm:pt-1">
                                {section.label}
                              </div>
                              <p className="mt-2 break-words text-sm leading-7 text-cloud/82 sm:mt-0 md:text-[15px]">
                                {section.body}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                ) : currentNote.setlist.length > 0 ? (
                  <div className="mt-4 divide-y divide-white/10">
                    {currentNote.setlist.slice(0, 4).map((track, index) => (
                      <div
                        key={`${currentNote.id}-${track.id ?? `${track.title}-${index}`}`}
                        className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0"
                      >
                        <div className="min-w-0">
                          <div className="text-[10px] uppercase tracking-[0.24em] text-cloud/45">
                            {index === 0 ? "On deck" : `Then ${index + 1}`}
                          </div>
                          <div className="mt-2 truncate text-sm font-semibold text-white">
                            {track.title}
                          </div>
                          <div className="truncate text-xs text-cloud/70">
                            {track.artist}
                          </div>
                        </div>
                        <div className="max-w-[48%] text-right text-[11px] leading-5 text-cloud/58">
                          {trackMeta(track)}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-4 rounded-[22px] border border-dashed border-white/10 bg-black/20 p-4 text-sm text-cloud/65">
                    This turn is carrying booth writing first.
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="rounded-[34px] border border-white/10 bg-[linear-gradient(150deg,rgba(11,16,30,0.94),rgba(30,8,48,0.84))] p-5 shadow-[0_22px_60px_rgba(0,0,0,0.28)]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-[11px] uppercase tracking-[0.38em] text-cloud/58">
                  History
                </div>
                <div className="mt-2 text-lg font-semibold text-white">
                  A few recent booth turns.
                </div>
              </div>
              <div className="text-xs text-cloud/55">
                {historyNotes.length
                  ? `${historyNotes.length} more turns`
                  : "Archive open"}
              </div>
            </div>

            {historyNotes.length > 0 ? (
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {historyNotes.map((note) => (
                  <Link
                    key={note.id}
                    href={`/radio/notes#${note.id}`}
                    className="group block min-w-0 rounded-[24px] border border-white/10 bg-black/20 px-4 py-4 transition duration-300 hover:-translate-y-0.5 hover:border-white/20"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] uppercase tracking-[0.22em] text-cloud/50">
                      <span>{formatRadioMood(note.mood)}</span>
                      <span>{formatTimeAgo(note.createdAt) || "recent"}</span>
                    </div>
                    <div className="mt-3 line-clamp-3 break-words text-base font-semibold leading-6 text-white transition group-hover:text-glow">
                      {note.boothDossier?.headline ?? note.title}
                    </div>
                    <p className="mt-2 text-sm leading-6 text-cloud/74">
                      {shorten(note.boothDossier?.intro ?? note.excerpt, 120)}
                    </p>
                    <div className="mt-3 break-words text-xs leading-5 text-cloud/58">
                      {note.currentTrack?.title
                        ? `On air: ${note.currentTrack.title}`
                        : note.setlist[0]
                          ? `Set lead: ${note.setlist[0].title}`
                          : "Saved booth turn"}
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="mt-4 rounded-[24px] border border-dashed border-white/10 bg-black/20 p-4 text-sm text-cloud/70">
                The archive will fill in here as the night keeps moving.
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
