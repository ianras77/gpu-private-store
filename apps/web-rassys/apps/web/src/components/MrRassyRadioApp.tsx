"use client";

import Image from "next/image";
import Link from "next/link";
import useSWR from "swr";
import {
  ArrowUpRight,
  Pause,
  Play,
  Radio,
  Sparkles,
  Volume2,
} from "lucide-react";
import {
  usePersistentRadioPlayer,
  type RadioTrack,
} from "./PersistentRadioPlayerProvider";
import { radioApiLinks } from "../lib/radio-links";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { formatRadioMood } from "../lib/radio-mood";
import { formatTimeAgo } from "../lib/utils";

const fetcher = async <T,>(url: string): Promise<T> => {
  const response = await fetch(url, { cache: "no-store" });
  const payload = await response.json().catch(() => null);
  return (payload ?? {}) as T;
};

type DJPayload = {
  script?: string | null;
  mood?: string | null;
  reason?: string | null;
  at?: number | null;
};

type BoothDossierCard = {
  label?: string;
  title?: string;
  body?: string;
};

type BoothDossierPayload = {
  headline?: string | null;
  intro?: string | null;
  tags?: string[];
  cards?: BoothDossierCard[];
  deepCut?: string | null;
  nextMove?: string | null;
  at?: number | null;
  source?: string | null;
};

type RadioNote = {
  id: string;
  title: string;
  excerpt: string;
  mood?: string | null;
  reason?: string | null;
  createdAt: string;
  currentTrack?: RadioTrack | null;
  setlist: RadioTrack[];
  boothDossier?: BoothDossierPayload | null;
};

type RadioNotesPayload = {
  notes?: RadioNote[];
};

type EasterEggPayload = {
  badge?: string;
  title?: string;
  body?: string;
  cta?: string;
};

const fallbackCurio: Required<EasterEggPayload> = {
  badge: "Cat Signal",
  title: "Fresh room tone",
  body: "Mr Rassy is still prowling the booth, leaving new odd little delights in the margins.",
  cta: "Keep listening",
};

const formatTrackStamp = (track?: RadioTrack | null) => {
  if (!track?.title) return "Mr Rassy is cueing the room.";
  const artist = track.artist ? ` by ${track.artist}` : "";
  const album = track.album ? ` off ${track.album}` : "";
  const year = track.year ? ` (${track.year})` : "";
  return `${track.title}${artist}${album}${year}`;
};

const formatTrackMeta = (track?: RadioTrack | null) =>
  [track?.album, track?.year, track?.genres?.slice(0, 2).join(" / ")]
    .filter(Boolean)
    .join(" · ");

const describeEnergy = (value?: number) => {
  if (typeof value !== "number") return "soft-glow pressure";
  if (value < 0.3) return "low-slung and intimate";
  if (value < 0.6) return "steady pulse";
  return "high voltage";
};

export function MrRassyRadioApp() {
  const { buffering, displayNow, playing, queueItems, streamError, toggle } =
    usePersistentRadioPlayer();
  const { data: dj } = useSWR<DJPayload>("/api/radio/dj", fetcher, {
    refreshInterval: 10000,
  });
  const { data: hears } = useSWR<BoothDossierPayload>(
    "/api/radio/hears",
    fetcher,
    {
      refreshInterval: 20000,
    },
  );
  const { data: notesData } = useSWR<RadioNotesPayload>(
    "/api/radio/notes?limit=5",
    fetcher,
    {
      refreshInterval: 60000,
    },
  );
  const { data: curioData } = useSWR<EasterEggPayload>(
    "/api/easter-eggs",
    fetcher,
    {
      refreshInterval: 15 * 60 * 1000,
    },
  );

  const queue = Array.isArray(queueItems) ? queueItems.filter(Boolean) : [];
  const notes = Array.isArray(notesData?.notes) ? notesData.notes : [];
  const leadNote = notes[0] ?? null;
  const visualTrack =
    displayNow ?? leadNote?.currentTrack ?? leadNote?.setlist[0];
  const boothMood = formatRadioMood(
    dj?.mood ?? leadNote?.mood ?? displayNow?.genres?.[0],
  );
  const boothThought =
    dj?.script ??
    leadNote?.excerpt ??
    "Mr Rassy is listening for the seam that opens the next turn.";
  const boothReason = dj?.reason ?? leadNote?.reason ?? null;
  const hearing = hears?.headline ? hears : (leadNote?.boothDossier ?? null);
  const hearingCards = (Array.isArray(hearing?.cards) ? hearing.cards : [])
    .filter((card) => card?.body)
    .slice(0, 3);
  const setFlow = [visualTrack, ...queue.slice(0, 3)].filter(
    (track): track is RadioTrack => Boolean(track?.title),
  );
  const curio = {
    badge: curioData?.badge?.trim() || fallbackCurio.badge,
    title: curioData?.title?.trim() || fallbackCurio.title,
    body: curioData?.body?.trim() || fallbackCurio.body,
    cta: curioData?.cta?.trim() || fallbackCurio.cta,
  };
  const noteAge = leadNote?.createdAt
    ? formatTimeAgo(leadNote.createdAt)
    : "Fresh";

  return (
    <div className="mr-rassy-hud min-h-screen px-3 pb-6 pt-4 md:px-6 md:py-10">
      <main className="mx-auto max-w-[460px]">
        <div className="relative overflow-hidden rounded-[42px] border border-white/12 bg-[radial-gradient(circle_at_top_left,rgba(255,230,109,0.14),transparent_26%),radial-gradient(circle_at_82%_18%,rgba(66,245,255,0.2),transparent_30%),radial-gradient(circle_at_50%_100%,rgba(255,79,216,0.22),transparent_38%),linear-gradient(160deg,rgba(6,10,26,0.98),rgba(28,7,42,0.94))] shadow-[0_32px_100px_rgba(0,0,0,0.44)]">
          <div
            className="absolute inset-0 noise opacity-45"
            aria-hidden="true"
          />

          <div className="relative px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] sm:px-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[10px] uppercase tracking-[0.36em] text-cloud/58">
                  Mr Rassy Radio
                </div>
                <h1 className="section-title mt-3 text-[2rem] leading-none">
                  <span className="magical-text">Live</span> booth
                </h1>
                <p className="mt-3 max-w-[19rem] text-sm leading-7 text-cloud/78">
                  A phone-sized booth view built just for the record in the air,
                  the note behind it, and the next move in the set.
                </p>
              </div>

              <div className="flex flex-col items-end gap-2">
                <Badge className="border-aurora/25 bg-aurora/12 text-white">
                  <Radio size={12} />
                  Live
                </Badge>
                <Badge>{boothMood}</Badge>
              </div>
            </div>

            <div className="mt-4 rounded-[28px] border border-white/10 bg-black/20 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.28em] text-cloud/55">
                    {curio.badge}
                  </div>
                  <div className="mt-2 text-lg font-semibold text-white">
                    {curio.title}
                  </div>
                </div>
                <Sparkles size={16} className="mt-1 text-glow" />
              </div>
              <p className="mt-3 text-sm leading-7 text-cloud/78">
                {curio.body}
              </p>
              <div className="mt-3 text-[11px] uppercase tracking-[0.24em] text-cloud/52">
                {curio.cta}
              </div>
            </div>

            <section className="mt-4 overflow-hidden rounded-[34px] border border-white/10 bg-[linear-gradient(160deg,rgba(8,13,29,0.96),rgba(37,9,47,0.9))] p-4 shadow-[0_18px_50px_rgba(0,0,0,0.28)]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.3em] text-cloud/55">
                    On air now
                  </div>
                  <div className="mt-2 text-sm text-cloud/70">
                    {noteAge} from the latest booth save
                  </div>
                </div>
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.24em] text-cloud/55">
                  <span className="glow-dot h-2.5 w-2.5 rounded-full" />
                  {playing ? "Locked in" : buffering ? "Catching" : "Ready"}
                </div>
              </div>

              <div className="mt-4 relative aspect-square overflow-hidden rounded-[28px] border border-white/10 bg-black/35">
                {visualTrack?.albumArtUrl ? (
                  <Image
                    src={visualTrack.albumArtUrl}
                    alt={visualTrack.title ?? "Album art"}
                    fill
                    sizes="420px"
                    className="object-cover"
                    unoptimized
                  />
                ) : (
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(255,255,255,0.18),transparent_18%),radial-gradient(circle_at_50%_50%,transparent_0,transparent_26%,rgba(255,255,255,0.08)_27%,transparent_28%),radial-gradient(circle_at_50%_50%,transparent_0,transparent_41%,rgba(255,255,255,0.08)_42%,transparent_43%),linear-gradient(145deg,rgba(15,11,34,0.96),rgba(13,44,56,0.82))]" />
                )}

                <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(6,8,20,0.1),rgba(6,8,20,0.15),rgba(6,8,20,0.82))]" />

                <div className="absolute left-4 top-4 flex items-center gap-2">
                  <span className="rounded-full border border-white/12 bg-black/35 px-3 py-2 text-[10px] uppercase tracking-[0.24em] text-cloud/70">
                    {visualTrack?.year ?? "Live feed"}
                  </span>
                  <span className="rounded-full border border-white/12 bg-black/35 px-3 py-2 text-[10px] uppercase tracking-[0.24em] text-cloud/70">
                    {describeEnergy(visualTrack?.energy)}
                  </span>
                </div>

                <div className="absolute bottom-4 left-4 right-4">
                  <div className="flex items-end justify-between gap-4">
                    <div className="min-w-0">
                      <div className="truncate text-[1.8rem] font-semibold leading-none text-white">
                        {visualTrack?.title ?? "Needle in the air"}
                      </div>
                      <div className="mt-2 truncate text-base text-cloud/78">
                        {visualTrack?.artist ?? "Mr Rassy"}
                      </div>
                    </div>

                    <div className="flex items-end gap-1">
                      {[0, 1, 2, 3].map((bar) => (
                        <span
                          key={bar}
                          className={`w-1.5 rounded-full bg-white/80 ${
                            playing
                              ? "animate-[equalizerPulse_1s_ease-in-out_infinite]"
                              : "opacity-35"
                          }`}
                          style={{
                            height: `${16 + bar * 6}px`,
                            animationDelay: `${bar * 120}ms`,
                          }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.18em] text-cloud/58">
                {formatTrackMeta(visualTrack) ? (
                  <span className="rave-chip rounded-full px-3 py-2">
                    {formatTrackMeta(visualTrack)}
                  </span>
                ) : (
                  <span className="rave-chip rounded-full px-3 py-2">
                    Live radio cut
                  </span>
                )}
                <span className="rave-chip rounded-full px-3 py-2">
                  {formatTrackStamp(visualTrack)}
                </span>
              </div>

              <div className="mt-4 grid grid-cols-[minmax(0,1fr)_auto] gap-3">
                <Button
                  className="h-14 justify-center text-base"
                  onClick={() => void toggle()}
                >
                  {playing ? <Pause size={18} /> : <Play size={18} />}
                  {playing
                    ? "Pause the room"
                    : buffering
                      ? "Catching live"
                      : "Play live"}
                </Button>
                <Button variant="secondary" className="h-14 px-4" asChild>
                  <a
                    href={radioApiLinks.channel.xspf.mp3}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Volume2 size={16} />
                    Feed
                  </a>
                </Button>
              </div>

              {streamError && (
                <div className="mt-3 text-sm text-comet">{streamError}</div>
              )}

              <div className="mt-4 flex items-center justify-between gap-3 text-[11px] uppercase tracking-[0.24em] text-cloud/56">
                <Link
                  href="/radio"
                  className="inline-flex items-center gap-2 transition hover:text-white"
                >
                  Open full tower
                  <ArrowUpRight size={13} />
                </Link>
                <Link
                  href="/radio/notes"
                  className="inline-flex items-center gap-2 transition hover:text-white"
                >
                  Booth archive
                  <ArrowUpRight size={13} />
                </Link>
              </div>
            </section>

            <section className="mt-4 grid gap-4">
              <div className="rounded-[30px] border border-white/10 bg-[linear-gradient(160deg,rgba(10,16,35,0.96),rgba(19,39,53,0.82))] p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.3em] text-cloud/55">
                      Mr Rassy says
                    </div>
                    <div className="mt-3 text-[1.35rem] font-semibold leading-8 text-white">
                      {boothThought}
                    </div>
                  </div>
                  <Badge className="bg-black/20 text-cloud/85">Live note</Badge>
                </div>
                {boothReason && (
                  <p className="mt-4 text-sm leading-7 text-cloud/76">
                    {boothReason}
                  </p>
                )}
              </div>

              <div className="rounded-[30px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(255,230,109,0.12),transparent_24%),radial-gradient(circle_at_80%_18%,rgba(66,245,255,0.16),transparent_28%),linear-gradient(160deg,rgba(10,14,31,0.98),rgba(30,7,39,0.9))] p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.3em] text-cloud/55">
                      What he hears
                    </div>
                    <div className="mt-3 text-2xl font-semibold text-white">
                      {hearing?.headline ?? "The booth is still listening."}
                    </div>
                  </div>
                  <Badge className="bg-black/20 text-cloud/82">
                    {hearing?.source === "llm" ? "Long listen" : "Booth jot"}
                  </Badge>
                </div>

                <p className="mt-4 text-sm leading-7 text-cloud/82">
                  {hearing?.intro ??
                    "Every record gets a little more room here, so the feeling of the turn lands before the metadata does."}
                </p>

                {Array.isArray(hearing?.tags) && hearing.tags.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.22em] text-cloud/58">
                    {hearing.tags.slice(0, 5).map((tag) => (
                      <span
                        key={tag}
                        className="rave-chip rounded-full px-3 py-2"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                <div className="mt-4 grid gap-3">
                  {hearingCards.map((card) => (
                    <div
                      key={`${card.label}-${card.title}`}
                      className="rounded-[24px] border border-white/10 bg-black/20 p-4"
                    >
                      <div className="text-[10px] uppercase tracking-[0.28em] text-cloud/52">
                        {card.label}
                      </div>
                      <div className="mt-3 text-lg font-semibold text-white">
                        {card.title}
                      </div>
                      <p className="mt-3 text-sm leading-7 text-cloud/78">
                        {card.body}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-[24px] border border-white/10 bg-black/20 p-4">
                    <div className="text-[10px] uppercase tracking-[0.28em] text-cloud/52">
                      Deep cut
                    </div>
                    <p className="mt-3 text-sm leading-7 text-cloud/78">
                      {hearing?.deepCut ??
                        "Mr Rassy is keeping the close read warm for the next turn."}
                    </p>
                  </div>
                  <div className="rounded-[24px] border border-white/10 bg-black/20 p-4">
                    <div className="text-[10px] uppercase tracking-[0.28em] text-cloud/52">
                      Next move
                    </div>
                    <p className="mt-3 text-sm leading-7 text-cloud/78">
                      {hearing?.nextMove ??
                        (queue[0]?.title
                          ? formatTrackStamp(queue[0])
                          : "The next move is still sketching itself in the headphones.")}
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-[30px] border border-white/10 bg-[linear-gradient(160deg,rgba(10,11,28,0.96),rgba(21,7,43,0.86))] p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.3em] text-cloud/55">
                      Tonight&apos;s run
                    </div>
                    <div className="mt-2 text-sm text-cloud/70">
                      The current record and the next turns in one glance.
                    </div>
                  </div>
                  <Badge className="bg-black/20 text-cloud/82">
                    {setFlow.length} in frame
                  </Badge>
                </div>

                <ol className="mt-4 divide-y divide-white/10">
                  {setFlow.map((track, index) => (
                    <li
                      key={`${track.id ?? track.title}-${index}`}
                      className="grid grid-cols-[auto_minmax(0,1fr)] gap-4 py-4 first:pt-0 last:pb-0"
                    >
                      <div className="pt-1 text-[10px] uppercase tracking-[0.3em] text-cloud/45">
                        {index === 0
                          ? "On air"
                          : index === 1
                            ? "On deck"
                            : `Next ${index}`}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-base font-semibold text-white">
                          {track.title}
                        </div>
                        <div className="truncate text-sm text-cloud/72">
                          {track.artist ?? "Mr Rassy"}
                        </div>
                        <div className="mt-2 text-xs leading-6 text-cloud/56">
                          {formatTrackMeta(track) || "Current room texture"}
                        </div>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>

              <div className="rounded-[30px] border border-white/10 bg-[linear-gradient(160deg,rgba(8,15,33,0.96),rgba(12,39,47,0.82))] p-5">
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.3em] text-cloud/55">
                      Booth diary
                    </div>
                    <div className="mt-2 text-sm text-cloud/70">
                      Saved turns from the archive, ready to swipe through.
                    </div>
                  </div>
                  <Link
                    href="/radio/notes"
                    className="text-[11px] uppercase tracking-[0.24em] text-cloud/58 transition hover:text-white"
                  >
                    Full archive
                  </Link>
                </div>

                <div className="mt-4 flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {notes.map((note) => {
                    const noteTrack =
                      note.currentTrack ??
                      note.setlist[0] ??
                      visualTrack ??
                      null;

                    return (
                      <Link
                        key={note.id}
                        href={`/radio/notes#${note.id}`}
                        className="min-w-[255px] max-w-[255px] shrink-0 rounded-[26px] border border-white/10 bg-black/20 p-4 transition hover:-translate-y-1"
                      >
                        <div className="flex items-center gap-3">
                          <div className="relative h-16 w-16 overflow-hidden rounded-2xl border border-white/10 bg-black/30">
                            {noteTrack?.albumArtUrl ? (
                              <Image
                                src={noteTrack.albumArtUrl}
                                alt={noteTrack.title ?? "Album art"}
                                fill
                                sizes="64px"
                                className="object-cover"
                                unoptimized
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-[10px] uppercase tracking-[0.22em] text-cloud/52">
                                No Art
                              </div>
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="truncate text-[10px] uppercase tracking-[0.24em] text-cloud/52">
                              {formatTimeAgo(note.createdAt) || "recent"}
                            </div>
                            <div className="mt-1 truncate text-base font-semibold text-white">
                              {note.title}
                            </div>
                            <div className="truncate text-sm text-cloud/70">
                              {noteTrack?.title ?? "Booth note"}
                            </div>
                          </div>
                        </div>
                        <p className="mt-4 text-sm leading-7 text-cloud/78">
                          {note.excerpt}
                        </p>
                      </Link>
                    );
                  })}
                </div>
              </div>
            </section>

          </div>
        </div>
      </main>
    </div>
  );
}
