"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import useSWR from "swr";
import { Camera, Clapperboard, Images, MapPin, Play, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { type PhotoItem, type PhotoShelfPayload } from "../lib/media-controller";
import { PhotoSurface } from "./PhotoSurface";
import { Button } from "./ui/button";

const EMPTY_ITEMS: PhotoShelfPayload["items"] = [];

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
    year: "numeric"
  });
};

const formatDuration = (seconds?: number) => {
  if (!seconds || seconds <= 0) return null;
  const wholeSeconds = Math.round(seconds);
  const minutes = Math.floor(wholeSeconds / 60);
  const remainder = wholeSeconds % 60;
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
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
          <div className="text-[10px] uppercase tracking-[0.34em] text-cloud/55">{eyebrow}</div>
          <h2 className="mt-3 text-2xl font-semibold text-white md:text-3xl">{title}</h2>
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
                delay: Math.min(index * 0.04, 0.24)
              }}
              className={`group overflow-hidden rounded-[30px] border border-white/10 bg-[linear-gradient(150deg,rgba(10,14,30,0.94),rgba(23,8,38,0.82))] shadow-[0_20px_60px_rgba(0,0,0,0.26)] ${
                isLarge ? "md:col-span-2 xl:col-span-2" : ""
              }`}
            >
              <button type="button" onClick={() => onSelect(item.id)} aria-label={`Open ${item.title}`} className="block w-full text-left">
                <div className={`relative ${isLarge ? "aspect-[16/10]" : index % 3 === 0 ? "aspect-[4/5]" : "aspect-[5/6]"}`}>
                  {item.kind === "video" ? (
                    <>
                      <Image
                        src={item.posterUrl ?? item.previewUrl ?? ""}
                        alt={item.title}
                        fill
                        sizes={
                          isLarge ? "(max-width: 1280px) 100vw, 70vw" : "(max-width: 1280px) 100vw, 33vw"
                        }
                        className="object-cover transition duration-700 group-hover:scale-[1.02]"
                        unoptimized
                      />
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
                        isLarge ? "(max-width: 1280px) 100vw, 70vw" : "(max-width: 1280px) 100vw, 33vw"
                      }
                      className="object-cover transition duration-700 group-hover:scale-[1.02]"
                    />
                  )}

                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent opacity-60 transition-opacity group-hover:opacity-100" />
                  {durationLabel && <div className="pointer-events-none absolute bottom-4 left-4 rounded-full border border-white/15 bg-black/45 px-3 py-2 text-[10px] uppercase tracking-[0.2em] text-white/85">{durationLabel}</div>}
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
  const { data, error } = useSWR<PhotoShelfPayload>("/api/photos?limit=96", fetcher, {
    refreshInterval: 30000
  });
  const items = Array.isArray(data?.items) ? data.items : EMPTY_ITEMS;
  const immichItems = useMemo(() => items.filter((item) => item.source === "immich"), [items]);
  const localItems = useMemo(() => items.filter((item) => item.source === "local"), [items]);
  const primaryItems = immichItems.length > 0 ? immichItems : localItems;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedItem = items.find((item) => item.id === selectedId) ?? null;
  const selectedStillExists = selectedId ? items.some((item) => item.id === selectedId) : false;

  useEffect(() => {
    if (!selectedId) return;
    if (selectedStillExists) return;
    setSelectedId(null);
  }, [selectedId, selectedStillExists]);

  useEffect(() => {
    if (!selectedItem) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectedId(null);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedItem]);

  return (
    <>
      <section className="mx-auto max-w-6xl px-6 py-12">
        <div className="relative overflow-hidden rounded-[36px] border border-white/12 bg-[radial-gradient(circle_at_top_left,rgba(255,232,150,0.16),transparent_24%),radial-gradient(circle_at_86%_16%,rgba(66,245,255,0.16),transparent_24%),radial-gradient(circle_at_70%_84%,rgba(255,79,216,0.14),transparent_34%),linear-gradient(145deg,rgba(8,12,28,0.96),rgba(22,8,39,0.92))] p-7 shadow-[0_30px_90px_rgba(0,0,0,0.38)] md:p-9">
          <div className="absolute -left-10 top-8 h-32 w-32 rounded-full bg-glow/15 blur-3xl" />
          <div className="absolute right-8 top-8 h-32 w-32 rounded-full bg-aurora/12 blur-3xl" />

          <div className="relative flex flex-col gap-5">
            <div>
              <div className="text-[10px] uppercase tracking-[0.36em] text-cloud/60">The photo wall</div>
              <h1 className="mt-3 text-4xl font-semibold text-white md:text-6xl">Around home.</h1>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-cloud/68">A living wall of moments. Tap a frame when you want the story behind it.</p>
            </div>
            <div className="flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.22em] text-cloud/55"><span className="rave-chip rounded-full px-3 py-2">{primaryItems.length} frames in view</span><span className="rave-chip rounded-full px-3 py-2">Tap to open details</span></div>
          </div>
        </div>
      </section>

      {error ? (
        <section className="mx-auto max-w-6xl px-6 pb-8">
          <div className="rounded-[28px] border border-comet/30 bg-black/20 px-5 py-4 text-sm text-cloud/78">
            The gallery is still settling.
          </div>
        </section>
      ) : null}

      {!items.length ? (
        <section className="mx-auto max-w-6xl px-6 pb-16">
          <div className="rounded-[30px] border border-dashed border-white/12 bg-black/10 px-6 py-8 text-sm text-cloud/70">
            Nothing here yet.
          </div>
        </section>
      ) : (
        <>
          <PhotoSection
            title={
              immichItems.length > 0
                ? data?.sources?.immich?.label ?? "Immich album"
                : data?.sources?.local?.label ?? "Local library"
            }
            eyebrow={immichItems.length > 0 ? "Primary library" : "Gallery"}
            items={primaryItems}
            onSelect={setSelectedId}
          />

          {immichItems.length > 0 && localItems.length > 0 && (
            <PhotoSection
              title={data?.sources?.local?.label ?? "Local drop"}
              eyebrow="Secondary library"
              items={localItems}
              onSelect={setSelectedId}
            />
          )}
        </>
      )}

      {selectedItem && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/88 px-4 py-6 backdrop-blur-md"
          role="dialog"
          aria-modal="true"
          aria-label={selectedItem.title}
          onClick={() => setSelectedId(null)}
        >
          <div
            className="relative flex max-h-full w-full max-w-5xl flex-col gap-4 overflow-hidden rounded-[32px] border border-white/12 bg-[linear-gradient(160deg,rgba(7,12,28,0.96),rgba(23,8,38,0.94))] p-4 shadow-[0_30px_100px_rgba(0,0,0,0.5)] md:p-6"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-[10px] uppercase tracking-[0.3em] text-cloud/55">
                  {selectedItem.collection ?? selectedItem.sourceLabel ?? selectedItem.source}
                </div>
                <div className="mt-2 text-2xl font-semibold text-white">{selectedItem.title}</div>
                <div className="mt-2 text-sm text-cloud/70">{formatDate(selectedItem.capturedAt)}</div>
              </div>
              <Button variant="secondary" onClick={() => setSelectedId(null)}>
                <X size={16} />
                Close
              </Button>
            </div>

            <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-[26px] border border-white/10 bg-black/30 p-2">
              {selectedItem.kind === "video" ? (
                <video
                  autoPlay
                  controls
                  playsInline
                  poster={selectedItem.posterUrl}
                  className="max-h-[72vh] w-full rounded-[20px] object-contain"
                >
                  <source src={selectedItem.fileUrl} type={selectedItem.mimeType} />
                </video>
              ) : (
                <div className="relative h-[72vh] w-full overflow-hidden rounded-[20px]">
                  <PhotoSurface
                    item={selectedItem}
                    alt={selectedItem.title}
                    sizes="100vw"
                    className="object-contain"
                    priority
                  />
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-3 text-[10px] uppercase tracking-[0.22em] text-cloud/60">
              <span className="rave-chip rounded-full px-3 py-2">
                {selectedItem.kind === "video" ? <Clapperboard size={14} /> : <Images size={14} />}
                {selectedItem.kind}
              </span>
              <span className="rave-chip rounded-full px-3 py-2">
                {Math.max(1, Math.round(selectedItem.fileSize / 1024 / 1024))} MB
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
