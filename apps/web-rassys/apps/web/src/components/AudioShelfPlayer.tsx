"use client";

import Image from "next/image";
import { useDeferredValue, useEffect, useRef, useState } from "react";
import {
  BookAudio,
  Headphones,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  Search,
  SkipBack,
  SkipForward,
  Sparkles,
  Waves,
} from "lucide-react";
import { Button } from "./ui/button";

export type AudioShelfItem = {
  id: string;
  title: string;
  subtitle: string;
  description?: string;
  streamUrl?: string;
  artworkUrl?: string;
  meta?: string;
  badges?: string[];
};

export type AudioShelfSection = {
  id: string;
  label: string;
  title: string;
  description?: string;
  items: AudioShelfItem[];
};

type AudioShelfPlayerProps = {
  eyebrow: string;
  title: string;
  description: string;
  sections: AudioShelfSection[];
  emptyState: string;
  maxVisibleItems?: number;
};

const formatClock = (value: number) => {
  if (!Number.isFinite(value) || value < 0) return "0:00";
  const whole = Math.floor(value);
  const minutes = Math.floor(whole / 60);
  const seconds = whole % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
};

const coverIconFor = (item?: AudioShelfItem | null) => {
  if (!item) return Headphones;
  return item.badges?.some((badge) => /episode|chapter/i.test(badge))
    ? BookAudio
    : Waves;
};

const shorten = (value?: string, maxLength = 180) => {
  const cleaned = value?.replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  if (cleaned.length <= maxLength) return cleaned;
  return `${cleaned.slice(0, maxLength).replace(/\s+\S*$/, "")}...`;
};

export function AudioShelfPlayer({
  eyebrow,
  title,
  description,
  sections,
  emptyState,
  maxVisibleItems = 250,
}: AudioShelfPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [selectedSectionId, setSelectedSectionId] = useState(
    sections.find((section) => section.items.length > 0)?.id ??
      sections[0]?.id ??
      "",
  );
  const [selectedItemId, setSelectedItemId] = useState<string | null>(
    sections[0]?.items[0]?.id ?? null,
  );
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [autoplayId, setAutoplayId] = useState<string | null>(null);

  const normalizedQuery = deferredQuery.trim().toLowerCase();
  const selectedSection =
    sections.find((section) => section.id === selectedSectionId) ??
    sections.find((section) => section.items.length > 0) ??
    sections[0] ??
    null;

  useEffect(() => {
    if (!sections.length) return;
    if (sections.some((section) => section.id === selectedSectionId)) return;
    setSelectedSectionId(
      sections.find((section) => section.items.length > 0)?.id ??
        sections[0]?.id ??
        "",
    );
  }, [sections, selectedSectionId]);

  const visibleItems = (selectedSection?.items ?? []).filter((item) => {
    if (!normalizedQuery) return true;
    return [item.title, item.subtitle, item.description, item.meta]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(normalizedQuery);
  });
  const displayItems = visibleItems.slice(0, maxVisibleItems);
  const hiddenItemCount = Math.max(
    0,
    visibleItems.length - displayItems.length,
  );

  useEffect(() => {
    if (!selectedSection) return;
    if (visibleItems.some((item) => item.id === selectedItemId)) return;
    setSelectedItemId(
      visibleItems[0]?.id ?? selectedSection.items[0]?.id ?? null,
    );
  }, [selectedItemId, selectedSection, visibleItems]);

  const activeItem =
    visibleItems.find((item) => item.id === selectedItemId) ??
    selectedSection?.items.find((item) => item.id === selectedItemId) ??
    visibleItems[0] ??
    selectedSection?.items[0] ??
    null;

  const activeIndex = visibleItems.findIndex(
    (item) => item.id === activeItem?.id,
  );
  const canGoPrevious = activeIndex > 0;
  const canGoNext = activeIndex >= 0 && activeIndex < visibleItems.length - 1;
  const CoverIcon = coverIconFor(activeItem);

  useEffect(() => {
    if (!audioRef.current) return;
    audioRef.current.playbackRate = speed;
  }, [speed]);

  useEffect(() => {
    if (!audioRef.current) return;
    setError(null);
    setCurrentTime(0);
    setDuration(0);
    audioRef.current.pause();
    audioRef.current.load();
    setPlaying(false);
  }, [activeItem?.id]);

  useEffect(() => {
    if (!autoplayId || !activeItem?.id || autoplayId !== activeItem.id) return;
    void (async () => {
      if (!audioRef.current || !activeItem.streamUrl) return;
      try {
        setError(null);
        await audioRef.current.play();
        setPlaying(true);
      } catch {
        setPlaying(false);
        setError("That file needs another tap before it opens.");
      } finally {
        setAutoplayId(null);
      }
    })();
  }, [activeItem?.id, activeItem?.streamUrl, autoplayId]);

  const playCurrent = async () => {
    if (!audioRef.current || !activeItem?.streamUrl) return;
    try {
      setError(null);
      await audioRef.current.play();
      setPlaying(true);
    } catch {
      setPlaying(false);
      setError("That file needs another tap before it opens.");
    }
  };

  const togglePlayback = async () => {
    if (!audioRef.current || !activeItem?.streamUrl) return;
    if (playing) {
      audioRef.current.pause();
      setPlaying(false);
      return;
    }
    await playCurrent();
  };

  const selectItem = async (itemId: string) => {
    setSelectedItemId(itemId);
    setAutoplayId(itemId);
  };

  const shiftSelection = async (direction: -1 | 1) => {
    if (activeIndex < 0) return;
    const next = visibleItems[activeIndex + direction];
    if (!next) return;
    await selectItem(next.id);
  };

  const nudge = (seconds: number) => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = Math.max(
      0,
      Math.min(
        audioRef.current.duration || Number.POSITIVE_INFINITY,
        audioRef.current.currentTime + seconds,
      ),
    );
  };

  const cycleSpeed = () => {
    const speeds = [1, 1.25, 1.5, 2];
    const currentIndex = speeds.findIndex((value) => value === speed);
    const nextSpeed = speeds[(currentIndex + 1) % speeds.length] ?? 1;
    setSpeed(nextSpeed);
  };

  return (
    <section className="glass-panel relative overflow-hidden rounded-[36px] p-6 md:p-8">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(66,245,255,0.12),transparent_26%),radial-gradient(circle_at_85%_10%,rgba(255,79,216,0.16),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(255,230,109,0.12),transparent_28%)]" />
      <div className="relative flex flex-col gap-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="text-[11px] uppercase tracking-[0.4em] text-cloud/60">
              {eyebrow}
            </div>
            <h2 className="mt-3 text-3xl font-semibold text-white md:text-4xl">
              {title}
            </h2>
            <p className="mt-3 text-sm leading-7 text-cloud/78 md:text-base">
              {description}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.28em] text-cloud/60">
            <span className="rave-chip rounded-full px-3 py-2">Settle in</span>
            <span className="rave-chip rounded-full px-3 py-2">
              Pick something
            </span>
            <span className="rave-chip rounded-full px-3 py-2">
              Stay a while
            </span>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
          <div className="min-w-0 rave-panel rounded-[30px] p-5 md:p-6">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[11px] uppercase tracking-[0.32em] text-cloud/55">
                  Now holding
                </div>
                <div className="mt-2 break-words text-2xl font-semibold leading-tight text-white">
                  {activeItem?.title ?? "Choose a shelf"}
                </div>
                <div className="mt-1 break-words text-sm text-cloud/70">
                  {activeItem?.subtitle ?? "Nothing selected yet."}
                </div>
              </div>
              <div className="rounded-full border border-white/10 bg-black/20 p-3 text-glow">
                <Sparkles size={18} />
              </div>
            </div>

            <div className="mt-5 grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
              <div className="relative aspect-square overflow-hidden rounded-[26px] border border-white/10 bg-[radial-gradient(circle_at_30%_20%,rgba(66,245,255,0.16),transparent_30%),radial-gradient(circle_at_70%_30%,rgba(255,79,216,0.16),transparent_32%),linear-gradient(145deg,rgba(7,8,18,0.95),rgba(25,9,36,0.92))]">
                {activeItem?.artworkUrl ? (
                  <Image
                    src={activeItem.artworkUrl}
                    alt={activeItem.title}
                    fill
                    className="object-cover"
                    unoptimized
                  />
                ) : (
                  <div className="flex h-full flex-col items-center justify-center gap-4 text-cloud/72">
                    <div className="rounded-full border border-white/10 bg-black/20 p-5 text-glow">
                      <CoverIcon size={30} />
                    </div>
                    <div className="text-[10px] uppercase tracking-[0.32em] text-cloud/55">
                      {selectedSection?.label ?? "Audio shelf"}
                    </div>
                  </div>
                )}
              </div>

              <div className="min-w-0 flex flex-col justify-between gap-5">
                <div className="space-y-3">
                  <p className="break-words text-sm leading-7 text-cloud/78 md:text-[15px]">
                    {shorten(
                      activeItem?.description ??
                        "Pick something and let it sit in the room for a while.",
                      260,
                    )}
                  </p>
                  <div className="flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.2em] text-cloud/62">
                    {(activeItem?.badges ?? []).map((badge) => (
                      <span
                        key={badge}
                        className="rave-chip rounded-full px-3 py-2"
                      >
                        {badge}
                      </span>
                    ))}
                  </div>
                  {activeItem?.meta ? (
                    <div className="rounded-[20px] border border-white/10 bg-black/20 px-4 py-3 text-sm text-cloud/76">
                      {activeItem.meta}
                    </div>
                  ) : null}
                </div>

                <div className="space-y-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant="secondary"
                      onClick={() => void shiftSelection(-1)}
                      disabled={!canGoPrevious}
                    >
                      <SkipBack size={16} />
                    </Button>
                    <Button
                      onClick={() => void togglePlayback()}
                      disabled={!activeItem?.streamUrl}
                    >
                      {playing ? <Pause size={16} /> : <Play size={16} />}
                      <span className="ml-2">{playing ? "Pause" : "Play"}</span>
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => void shiftSelection(1)}
                      disabled={!canGoNext}
                    >
                      <SkipForward size={16} />
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => nudge(-15)}
                      disabled={!activeItem?.streamUrl}
                    >
                      <RotateCcw size={16} />
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => nudge(15)}
                      disabled={!activeItem?.streamUrl}
                    >
                      <RotateCw size={16} />
                    </Button>
                    <Button variant="secondary" onClick={cycleSpeed}>
                      {speed}x
                    </Button>
                  </div>

                  <div className="space-y-2">
                    <input
                      type="range"
                      min={0}
                      max={Math.max(duration, 1)}
                      step={1}
                      value={Math.min(currentTime, duration || 0)}
                      onChange={(event) => {
                        if (!audioRef.current) return;
                        const nextTime = Number(event.target.value);
                        audioRef.current.currentTime = nextTime;
                        setCurrentTime(nextTime);
                      }}
                      className="w-full accent-glow"
                    />
                    <div className="flex items-center justify-between text-xs text-cloud/60">
                      <span>{formatClock(currentTime)}</span>
                      <span>{formatClock(duration)}</span>
                    </div>
                  </div>

                  {error ? (
                    <div className="text-sm text-comet">{error}</div>
                  ) : null}

                  <audio
                    ref={audioRef}
                    preload="metadata"
                    src={activeItem?.streamUrl}
                    onPlay={() => setPlaying(true)}
                    onPause={() => setPlaying(false)}
                    onEnded={() => {
                      setPlaying(false);
                      if (canGoNext) {
                        void shiftSelection(1);
                      }
                    }}
                    onTimeUpdate={() =>
                      setCurrentTime(audioRef.current?.currentTime ?? 0)
                    }
                    onLoadedMetadata={() =>
                      setDuration(audioRef.current?.duration ?? 0)
                    }
                    onError={() => {
                      setPlaying(false);
                      setError(
                        "That file slipped on load. Try another shelf or tap it again.",
                      );
                    }}
                    className="hidden"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="min-w-0 space-y-4">
            <div className="overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <div className="flex min-w-max gap-2">
                {sections.map((section) => (
                  <button
                    key={section.id}
                    type="button"
                    onClick={() => setSelectedSectionId(section.id)}
                    className={`rounded-full px-4 py-2 text-[11px] uppercase tracking-[0.28em] transition ${
                      section.id === selectedSectionId
                        ? "bg-white text-ink shadow-[0_14px_30px_rgba(255,255,255,0.15)]"
                        : "rave-chip text-cloud/72 hover:text-white"
                    }`}
                  >
                    {section.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="min-w-0 rave-panel rounded-[30px] p-5 md:p-6">
              <div className="flex flex-col gap-4 border-b border-white/10 pb-4 lg:flex-row lg:items-end lg:justify-between">
                <div className="min-w-0">
                  <div className="text-[11px] uppercase tracking-[0.32em] text-cloud/55">
                    {selectedSection?.label ?? "Shelf"}
                  </div>
                  <div className="mt-2 break-words text-2xl font-semibold leading-tight text-white">
                    {selectedSection?.title ?? "The shelves are quiet"}
                  </div>
                  <p className="mt-2 max-w-2xl text-sm leading-7 text-cloud/76">
                    {shorten(selectedSection?.description ?? emptyState, 220)}
                  </p>
                </div>
                <label className="relative block w-full lg:w-[260px]">
                  <Search
                    size={16}
                    className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-cloud/45"
                  />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search this shelf"
                    className="rave-input w-full rounded-full py-3 pl-11 pr-4 text-sm"
                  />
                </label>
              </div>

              <div className="mt-4 space-y-3">
                {visibleItems.length ? (
                  displayItems.map((item, index) => {
                    const isActive = item.id === activeItem?.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => void selectItem(item.id)}
                      className={`group grid w-full gap-3 rounded-[24px] border px-4 py-4 text-left transition md:grid-cols-[minmax(0,1fr)_auto] md:items-start ${
                          isActive
                            ? "border-glow/40 bg-glow/10 shadow-[0_18px_40px_rgba(66,245,255,0.12)]"
                            : "border-white/10 bg-black/15 hover:border-white/20 hover:bg-white/5"
                        }`}
                      >
                        <div className="flex min-w-0 flex-1 items-start gap-4">
                          <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-black/25 text-cloud/72">
                            <span className="text-xs font-semibold">
                              {String(index + 1).padStart(2, "0")}
                            </span>
                          </div>
                          <div className="min-w-0">
                            <div className="break-words text-base font-semibold leading-6 text-white">
                              {item.title}
                            </div>
                            <div className="mt-1 break-words text-sm text-cloud/72">
                              {item.subtitle}
                            </div>
                            {item.meta ? (
                              <div className="mt-2 break-words text-xs leading-5 text-cloud/58">
                                {item.meta}
                              </div>
                            ) : null}
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 md:max-w-[20rem] md:justify-end">
                          {(item.badges ?? []).slice(0, 4).map((badge) => (
                            <span
                              key={badge}
                              className="rave-chip rounded-full px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-cloud/62"
                            >
                              {badge}
                            </span>
                          ))}
                          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/20 px-3 py-2 text-[11px] uppercase tracking-[0.24em] text-cloud/72">
                            {isActive && playing ? (
                              <Pause size={14} />
                            ) : (
                              <Play size={14} />
                            )}
                            {isActive ? "Loaded" : "Cue"}
                          </span>
                        </div>
                      </button>
                    );
                  })
                ) : (
                  <div className="rounded-[24px] border border-dashed border-white/12 bg-black/10 px-5 py-10 text-center text-sm text-cloud/62">
                    {emptyState}
                  </div>
                )}
                {hiddenItemCount > 0 ? (
                  <div className="rounded-[20px] border border-dashed border-white/10 bg-black/10 px-4 py-4 text-sm text-cloud/62">
                    Showing the first {displayItems.length} matches. Narrow the
                    search to pull the rest of this shelf into view.
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
