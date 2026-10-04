"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import useSWRInfinite from "swr/infinite";
import {
  Camera,
  Clapperboard,
  Images,
  MapPin,
  Play,
  Search,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  type PhotoItem,
  type PhotoShelfPayload,
} from "../lib/media-controller";
import { PhotoSurface } from "./PhotoSurface";
import { Button } from "./ui/button";

const PHOTO_PAGE_SIZE = 60;

const fetcher = (url: string) =>
  fetch(url, { cache: "no-store" }).then(async (res) => {
    if (!res.ok) {
      throw new Error(`photo_fetch_failed_${res.status}`);
    }
    return res.json();
  });

const formatDate = (value?: string) => {
  if (!value) return "Recently";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "Recently";
  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const formatDuration = (seconds?: number) => {
  if (!seconds || seconds <= 0) return null;
  const wholeSeconds = Math.round(seconds);
  const minutes = Math.floor(wholeSeconds / 60);
  const remainder = wholeSeconds % 60;
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
};

const dateGroup = (value?: string) => {
  if (!value) return "Undated";
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime())
    ? String(parsed.getFullYear())
    : "Undated";
};

type PhotoSectionProps = {
  title: string;
  eyebrow: string;
  items: PhotoItem[];
  onSelect: (id: string) => void;
};

function PhotoSection({ title, eyebrow, items, onSelect }: PhotoSectionProps) {
  if (items.length === 0) return null;

  return (
    <section className="mx-auto max-w-6xl px-6 pb-8">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.34em] text-cloud/55">
            {eyebrow}
          </div>
          <h2 className="mt-3 text-2xl font-semibold text-white md:text-3xl">
            {title}
          </h2>
        </div>
        <div className="rounded-full border border-white/10 bg-black/20 px-4 py-2 text-[10px] uppercase tracking-[0.24em] text-cloud/62">
          {items.length} items
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {items.map((item, index) => {
          const isLarge = index === 0;
          const durationLabel = formatDuration(item.durationSeconds);

          return (
            <motion.article
              key={item.id}
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.45,
                delay: Math.min(index * 0.04, 0.24),
              }}
              className={`group overflow-hidden rounded-[30px] border border-white/10 bg-[linear-gradient(150deg,rgba(10,14,30,0.94),rgba(23,8,38,0.82))] shadow-[0_20px_60px_rgba(0,0,0,0.26)] ${
                isLarge ? "md:col-span-2 xl:col-span-2" : ""
              }`}
            >
              <button
                type="button"
                onClick={() => onSelect(item.id)}
                aria-label={`Open ${item.title}`}
                className="block w-full text-left"
              >
                <div
                  className={`relative ${isLarge ? "aspect-[16/10]" : index % 3 === 0 ? "aspect-[4/5]" : "aspect-[5/6]"}`}
                >
                  {item.kind === "video" ? (
                    <>
                      {item.posterUrl || item.previewUrl ? (
                        <Image
                          src={item.posterUrl ?? item.previewUrl ?? ""}
                          alt={item.title}
                          fill
                          sizes={
                            isLarge
                              ? "(max-width: 1280px) 100vw, 70vw"
                              : "(max-width: 1280px) 100vw, 33vw"
                          }
                          className="object-cover transition duration-700 group-hover:scale-[1.02]"
                          unoptimized
                        />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/35 text-cloud/55">
                          <Clapperboard size={28} aria-hidden="true" />
                        </div>
                      )}
                      <div className="pointer-events-none absolute left-4 top-4 rounded-full border border-white/10 bg-black/45 px-3 py-2 text-[10px] uppercase tracking-[0.24em] text-white/90">
                        Video
                      </div>
                      <div className="pointer-events-none absolute right-4 top-4 rounded-full border border-white/10 bg-black/45 p-3 text-white/90">
                        <Play size={16} />
                      </div>
                    </>
                  ) : (
                    <PhotoSurface
                      item={item}
                      alt={item.title}
                      sizes={
                        isLarge
                          ? "(max-width: 1280px) 100vw, 70vw"
                          : "(max-width: 1280px) 100vw, 33vw"
                      }
                      className="object-cover transition duration-700 group-hover:scale-[1.02]"
                    />
                  )}

                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent opacity-60 transition-opacity group-hover:opacity-100" />
                  {durationLabel && (
                    <div className="pointer-events-none absolute bottom-4 left-4 rounded-full border border-white/15 bg-black/45 px-3 py-2 text-[10px] uppercase tracking-[0.2em] text-white/85">
                      {durationLabel}
                    </div>
                  )}
                  <div className="pointer-events-none absolute bottom-4 right-4 rounded-full border border-white/15 bg-black/45 px-3 py-2 text-[10px] tracking-wide text-white/85">
                    {formatDate(item.capturedAt)}
                  </div>
                </div>
              </button>
            </motion.article>
          );
        })}
      </div>
    </section>
  );
}

export function PhotosGalleryPage() {
  const [sourceFilter, setSourceFilter] = useState<"all" | "immich" | "local">(
    "all",
  );
  const {
    data: pages,
    error,
    isLoading,
    size,
    setSize,
    isValidating,
  } = useSWRInfinite<PhotoShelfPayload>(
    (pageIndex, previousPage) => {
      if (previousPage && previousPage.items.length === 0) return null;
      const sourceQuery =
        sourceFilter === "all" ? "" : `&source=${sourceFilter}`;
      return `/api/photos?limit=${PHOTO_PAGE_SIZE}&offset=${pageIndex * PHOTO_PAGE_SIZE}${sourceQuery}`;
    },
    fetcher,
    { refreshInterval: 30000, revalidateFirstPage: true },
  );
  const data = pages?.[0];
  const items = useMemo(() => {
    const unique = new Map<string, PhotoItem>();
    for (const item of pages?.flatMap((page) => page.items) ?? []) {
      unique.set(item.id, item);
    }
    return Array.from(unique.values()).sort((left, right) => {
      const leftTime = new Date(left.capturedAt).getTime();
      const rightTime = new Date(right.capturedAt).getTime();
      return (
        (Number.isFinite(rightTime) ? rightTime : 0) -
        (Number.isFinite(leftTime) ? leftTime : 0)
      );
    });
  }, [pages]);
  const total = data?.total ?? 0;
  const sourceSummary = data?.sources;
  const allSourceTotal =
    (sourceSummary?.immich?.total ?? 0) + (sourceSummary?.local?.total ?? 0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<"all" | "image" | "video">(
    "all",
  );
  const [collectionFilter, setCollectionFilter] = useState("all");
  const collections = useMemo(
    () =>
      Array.from(
        new Set([
          ...items
            .map((item) => item.collection?.trim())
            .filter((value): value is string => Boolean(value)),
          ...(sourceFilter === "all" || sourceFilter === "immich"
            ? (data?.sources?.immich?.libraries ?? [])
            : []),
          ...(sourceFilter === "all" || sourceFilter === "local"
            ? (data?.sources?.local?.libraries ?? [])
            : []),
        ]),
      ).sort((left, right) => left.localeCompare(right)),
    [data?.sources, items, sourceFilter],
  );
  const visibleItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return items.filter((item) => {
      if (kindFilter !== "all" && item.kind !== kindFilter) return false;
      if (collectionFilter !== "all" && item.collection !== collectionFilter)
        return false;
      if (
        normalizedQuery &&
        ![
          item.title,
          item.collection,
          item.location,
          item.camera,
          item.relativePath,
        ]
          .filter(Boolean)
          .some((value) => value!.toLowerCase().includes(normalizedQuery))
      )
        return false;
      return true;
    });
  }, [collectionFilter, items, kindFilter, query]);
  const groups = useMemo(() => {
    const grouped = new Map<string, PhotoItem[]>();
    for (const item of visibleItems) {
      const key = dateGroup(item.capturedAt);
      grouped.set(key, [...(grouped.get(key) ?? []), item]);
    }
    return Array.from(grouped.entries()).sort((left, right) =>
      right[0].localeCompare(left[0], undefined, { numeric: true }),
    );
  }, [visibleItems]);
  const selectedIndex = visibleItems.findIndex(
    (item) => item.id === selectedId,
  );
  const selectedItem = selectedIndex >= 0 ? visibleItems[selectedIndex] : null;
  const hasMore = items.length < total;
  const loadingMore = isValidating && size > 1;

  useEffect(() => {
    if (selectedId && selectedIndex < 0) setSelectedId(null);
  }, [selectedId, selectedIndex]);

  useEffect(() => {
    if (!selectedItem) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectedId(null);
      } else if (event.key === "ArrowLeft" && visibleItems.length > 1) {
        event.preventDefault();
        setSelectedId(
          visibleItems[
            (selectedIndex - 1 + visibleItems.length) % visibleItems.length
          ]!.id,
        );
      } else if (event.key === "ArrowRight" && visibleItems.length > 1) {
        event.preventDefault();
        setSelectedId(
          visibleItems[(selectedIndex + 1) % visibleItems.length]!.id,
        );
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [selectedIndex, selectedItem, visibleItems]);

  const openAdjacent = (offset: -1 | 1) => {
    if (visibleItems.length < 2 || selectedIndex < 0) return;
    const nextIndex =
      (selectedIndex + offset + visibleItems.length) % visibleItems.length;
    setSelectedId(visibleItems[nextIndex]!.id);
  };

  return (
    <>
      <section className="mx-auto max-w-6xl px-6 py-12">
        <div className="relative overflow-hidden rounded-[36px] border border-white/12 bg-[radial-gradient(circle_at_top_left,rgba(255,232,150,0.16),transparent_24%),radial-gradient(circle_at_86%_16%,rgba(66,245,255,0.16),transparent_24%),radial-gradient(circle_at_70%_84%,rgba(255,79,216,0.14),transparent_34%),linear-gradient(145deg,rgba(8,12,28,0.96),rgba(22,8,39,0.92))] p-7 shadow-[0_30px_90px_rgba(0,0,0,0.38)] md:p-9">
          <div className="absolute -left-10 top-8 h-32 w-32 rounded-full bg-glow/15 blur-3xl" />
          <div className="absolute right-8 top-8 h-32 w-32 rounded-full bg-aurora/12 blur-3xl" />

          <div className="relative flex flex-col gap-5">
            <div>
              <div className="text-[10px] uppercase tracking-[0.36em] text-cloud/60">
                FAMILY LIBRARY
              </div>
              <h1 className="mt-3 text-4xl font-semibold text-white md:text-6xl">
                The moments we keep.
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-cloud/68">
                A shared album for photographs and little films from home.
                Browse by year, filter by collection, and open any frame to see
                it full size.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.22em] text-cloud/55">
              <span className="rave-chip rounded-full px-3 py-2">
                {total} family memories
              </span>
              <span className="rave-chip rounded-full px-3 py-2">
                {items.filter((item) => item.kind === "image").length} photos
              </span>
              <span className="rave-chip rounded-full px-3 py-2">
                {items.filter((item) => item.kind === "video").length} films in
                view
              </span>
            </div>
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_190px_220px]">
              <label className="relative block">
                <span className="sr-only">Search the family library</span>
                <Search
                  className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-cloud/45"
                  size={16}
                  aria-hidden="true"
                />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Find a place, person, or moment"
                  className="w-full rounded-2xl border border-white/12 bg-black/25 py-3 pl-11 pr-4 text-sm text-white outline-none placeholder:text-cloud/38 focus:border-aurora/55"
                />
              </label>
              <label>
                <span className="sr-only">Filter by media type</span>
                <select
                  value={kindFilter}
                  onChange={(event) =>
                    setKindFilter(
                      event.target.value as "all" | "image" | "video",
                    )
                  }
                  className="w-full rounded-2xl border border-white/12 bg-[#160e22] px-4 py-3 text-sm text-white outline-none focus:border-aurora/55"
                >
                  <option value="all">All memories</option>
                  <option value="image">Photos</option>
                  <option value="video">Videos</option>
                </select>
              </label>
              <label>
                <span className="sr-only">Filter by collection</span>
                <select
                  value={collectionFilter}
                  onChange={(event) => setCollectionFilter(event.target.value)}
                  className="w-full rounded-2xl border border-white/12 bg-[#160e22] px-4 py-3 text-sm text-white outline-none focus:border-aurora/55"
                >
                  <option value="all">Every collection</option>
                  {collections.map((collection) => (
                    <option key={collection} value={collection}>
                      {collection}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        </div>
      </section>

      {data?.sources && (
        <section className="mx-auto max-w-6xl px-6 pb-8">
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              {
                id: "all" as const,
                label: "All family media",
                total: allSourceTotal,
                libraries: ["Immich albums and local folders"],
              },
              {
                id: "immich" as const,
                label: "Immich albums",
                total: sourceSummary?.immich?.total ?? 0,
                libraries: sourceSummary?.immich?.libraries ?? [],
              },
              {
                id: "local" as const,
                label: "Local photo folders",
                total: sourceSummary?.local?.total ?? 0,
                libraries: sourceSummary?.local?.libraries ?? [],
              },
            ].map((source) => (
              <button
                key={source.id}
                type="button"
                aria-pressed={sourceFilter === source.id}
                onClick={() => {
                  setSourceFilter(source.id);
                  setCollectionFilter("all");
                  void setSize(1);
                }}
                className={`rounded-[24px] border p-4 text-left transition ${
                  sourceFilter === source.id
                    ? "border-aurora/55 bg-aurora/[0.08]"
                    : "border-white/10 bg-black/15 hover:border-white/25"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-semibold text-white">
                    {source.label}
                  </span>
                  <span className="text-[10px] uppercase tracking-[0.18em] text-cloud/55">
                    {source.total} items
                  </span>
                </div>
                <div className="mt-2 line-clamp-2 text-xs leading-5 text-cloud/60">
                  {source.libraries.length
                    ? source.libraries.slice(0, 3).join(" · ")
                    : source.id === "immich"
                      ? "No Immich albums indexed yet"
                      : source.id === "local"
                        ? "No local photo folders indexed yet"
                        : "Immich albums and local photo folders"}
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {error ? (
        <section className="mx-auto max-w-6xl px-6 pb-8">
          <div className="rounded-[28px] border border-comet/30 bg-black/20 px-5 py-4 text-sm text-cloud/78">
            The family library is unavailable right now. Try again in a moment.
          </div>
        </section>
      ) : null}

      {!items.length ? (
        <section className="mx-auto max-w-6xl px-6 pb-16">
          <div className="rounded-[30px] border border-dashed border-white/12 bg-black/10 px-6 py-8 text-sm text-cloud/70">
            {isLoading
              ? "Loading the Immich albums and local photo folders…"
              : error
                ? "The family library could not be reached."
                : sourceFilter === "immich"
                  ? "No photos or videos were found in the configured Immich albums."
                  : sourceFilter === "local"
                    ? "No photos or videos were found in the mounted local folders."
                    : "No family photos or videos are in the Immich albums or mounted local folders yet."}
          </div>
        </section>
      ) : (
        <>
          {!visibleItems.length ? (
            <section className="mx-auto max-w-6xl px-6 pb-8">
              <div className="rounded-[28px] border border-white/10 bg-black/20 p-6 text-sm text-cloud/72">
                No memories match these filters. Clear the search or choose
                another collection.
              </div>
            </section>
          ) : (
            groups.map(([year, yearItems]) => (
              <PhotoSection
                key={year}
                title={year}
                eyebrow="Memories from"
                items={yearItems}
                onSelect={setSelectedId}
              />
            ))
          )}
          <section className="mx-auto max-w-6xl px-6 pb-12 text-center">
            <p className="mb-4 text-xs text-cloud/55">
              Showing {items.length} of {total} memories
              {data?.sources?.immich?.total || data?.sources?.local?.total
                ? ` · ${data.sources?.immich?.total ?? 0} shared album · ${data.sources?.local?.total ?? 0} local`
                : ""}
            </p>
            {hasMore ? (
              <Button
                variant="secondary"
                disabled={loadingMore}
                onClick={() => void setSize(size + 1)}
              >
                {loadingMore ? "Loading more memories…" : "Load more memories"}
              </Button>
            ) : null}
          </section>
        </>
      )}

      {selectedItem && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/88 px-4 py-6 backdrop-blur-md"
          role="dialog"
          aria-modal="true"
          aria-label={selectedItem.title}
          tabIndex={-1}
          onClick={() => setSelectedId(null)}
        >
          <div
            className="relative flex max-h-full w-full max-w-5xl flex-col gap-4 overflow-hidden rounded-[32px] border border-white/12 bg-[linear-gradient(160deg,rgba(7,12,28,0.96),rgba(23,8,38,0.94))] p-4 shadow-[0_30px_100px_rgba(0,0,0,0.5)] md:p-6"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-[10px] uppercase tracking-[0.3em] text-cloud/55">
                  {selectedItem.collection ??
                    selectedItem.sourceLabel ??
                    selectedItem.source}
                </div>
                <div className="mt-2 text-2xl font-semibold text-white">
                  {selectedItem.title}
                </div>
                <div className="mt-2 text-sm text-cloud/70">
                  {formatDate(selectedItem.capturedAt)}
                </div>
              </div>
              <Button variant="secondary" onClick={() => setSelectedId(null)}>
                <X size={16} />
                Close
              </Button>
            </div>

            <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-[26px] border border-white/10 bg-black/30 p-2">
              {selectedItem.kind === "video" ? (
                <video
                  autoPlay
                  controls
                  playsInline
                  poster={selectedItem.posterUrl}
                  className="max-h-[72vh] w-full rounded-[20px] object-contain"
                >
                  <source
                    src={selectedItem.fileUrl}
                    type={selectedItem.mimeType}
                  />
                </video>
              ) : (
                <div className="relative h-[72vh] w-full overflow-hidden rounded-[20px]">
                  <PhotoSurface
                    item={{ ...selectedItem, previewUrl: selectedItem.fileUrl }}
                    alt={selectedItem.title}
                    sizes="100vw"
                    className="object-contain"
                    priority
                  />
                </div>
              )}
              {visibleItems.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={() => openAdjacent(-1)}
                    aria-label="Previous memory"
                    className="absolute left-4 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-black/55 text-3xl leading-none text-white backdrop-blur hover:bg-black/80"
                  >
                    <span aria-hidden="true">‹</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => openAdjacent(1)}
                    aria-label="Next memory"
                    className="absolute right-4 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-black/55 text-3xl leading-none text-white backdrop-blur hover:bg-black/80"
                  >
                    <span aria-hidden="true">›</span>
                  </button>
                </>
              )}
            </div>

            <div className="flex flex-wrap gap-3 text-[10px] uppercase tracking-[0.22em] text-cloud/60">
              <span className="rave-chip rounded-full px-3 py-2">
                {selectedItem.kind === "video" ? (
                  <Clapperboard size={14} />
                ) : (
                  <Images size={14} />
                )}
                {selectedItem.kind}
              </span>
              <span className="rave-chip rounded-full px-3 py-2">
                {selectedIndex + 1} / {visibleItems.length}
              </span>
              <span className="rave-chip rounded-full px-3 py-2">
                {Math.max(1, Math.round(selectedItem.fileSize / 1024 / 1024))}{" "}
                MB
              </span>
              {selectedItem.location && (
                <span className="rave-chip rounded-full px-3 py-2">
                  <MapPin size={14} />
                  {selectedItem.location}
                </span>
              )}
              {selectedItem.camera && (
                <span className="rave-chip rounded-full px-3 py-2">
                  <Camera size={14} />
                  {selectedItem.camera}
                </span>
              )}
              {formatDuration(selectedItem.durationSeconds) && (
                <span className="rave-chip rounded-full px-3 py-2">
                  <Play size={14} />
                  {formatDuration(selectedItem.durationSeconds)}
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
