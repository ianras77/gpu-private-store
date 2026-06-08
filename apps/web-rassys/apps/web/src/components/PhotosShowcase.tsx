"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import useSWR from "swr";
import { Clapperboard, Images, MapPin, Play, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { type PhotoItem, type PhotoShelfPayload } from "../lib/media-controller";
import { useVisibilityGate } from "../lib/use-visibility-gate";
import { PhotoSurface } from "./PhotoSurface";
import { Button } from "./ui/button";

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

const buildMetaLine = (item?: PhotoItem | null) =>
  [item?.collection, item?.location, item?.camera].filter(Boolean).slice(0, 2).join(" · ");

export function PhotosShowcase() {
  const { active, ref } = useVisibilityGate<HTMLElement>("720px");
  const { data } = useSWR<PhotoShelfPayload>(active ? "/api/photos?limit=18&source=immich" : null, fetcher, {
    refreshInterval: active ? 60000 : 0,
    revalidateOnFocus: false
  });
  const items = Array.isArray(data?.items) ? data.items : [];
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (items.length === 0) {
      setActiveIndex(0);
      return;
    }

    if (activeIndex >= items.length) {
      setActiveIndex(0);
    }
  }, [activeIndex, items.length]);

  useEffect(() => {
    if (items.length <= 1) return;

    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % items.length);
    }, 7000);

    return () => window.clearInterval(timer);
  }, [items.length]);

  const activeItem = items[activeIndex] ?? null;
  const previewItems = items.filter((_, index) => index !== activeIndex).slice(0, 3);
  const immichSummary = data?.sources?.immich;

  return (
    <section ref={ref} id="photos" className="mx-auto max-w-6xl scroll-mt-28 px-6 py-10">
      <div className="relative overflow-hidden rounded-[38px] border border-white/12 bg-[radial-gradient(circle_at_top_left,rgba(255,232,150,0.14),transparent_24%),radial-gradient(circle_at_84%_14%,rgba(66,245,255,0.16),transparent_26%),radial-gradient(circle_at_76%_80%,rgba(255,79,216,0.14),transparent_34%),linear-gradient(145deg,rgba(7,11,26,0.96),rgba(18,9,32,0.92))] p-6 shadow-[0_30px_90px_rgba(0,0,0,0.38)] md:p-8">
        <div className="absolute -left-8 top-6 h-28 w-28 rounded-full bg-glow/18 blur-3xl" />
        <div className="absolute right-10 top-10 h-36 w-36 rounded-full bg-aurora/14 blur-3xl" />
        <div className="absolute bottom-0 right-1/4 h-44 w-44 rounded-full bg-comet/14 blur-3xl" />

        <div className="relative flex flex-col gap-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-3 rounded-full border border-white/10 bg-black/20 px-4 py-2 text-[10px] uppercase tracking-[0.34em] text-cloud/66">
                <Sparkles size={14} className="text-glow" />
                Immich shelf
              </div>
              <h2 className="mt-4 text-3xl font-semibold text-white md:text-4xl">
                From the photo wall.
              </h2>
              <p className="mt-3 text-sm leading-6 text-cloud/72 md:text-base">
                A live pull from the album that hangs over the home page.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-[22px] border border-white/10 bg-black/20 px-4 py-4">
                <div className="text-[10px] uppercase tracking-[0.24em] text-cloud/55">Album</div>
                <div className="mt-2 text-2xl font-semibold text-white">
                  {immichSummary?.total ?? items.length}
                </div>
              </div>
              <div className="rounded-[22px] border border-white/10 bg-black/20 px-4 py-4">
                <div className="text-[10px] uppercase tracking-[0.24em] text-cloud/55">Stills</div>
                <div className="mt-2 text-2xl font-semibold text-white">
                  {immichSummary?.images ?? items.filter((item) => item.kind === "image").length}
                </div>
              </div>
              <div className="rounded-[22px] border border-white/10 bg-black/20 px-4 py-4">
                <div className="text-[10px] uppercase tracking-[0.24em] text-cloud/55">Latest</div>
                <div className="mt-2 text-sm font-semibold text-white">{formatDate(data?.updatedAt)}</div>
              </div>
            </div>
          </div>

          {!activeItem ? (
            <div className="rounded-[30px] border border-dashed border-white/12 bg-black/10 px-6 py-8">
              <div className="text-sm text-cloud/70">The Immich shelf is quiet right now.</div>
              <div className="mt-4">
                <Button asChild>
                  <Link href="/photos">Open the full gallery</Link>
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1.08fr)_340px]">
              <motion.div
                key={activeItem.id}
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6 }}
                className="group relative overflow-hidden rounded-[32px] border border-white/10 bg-black/20 shadow-[0_24px_60px_rgba(0,0,0,0.32)]"
              >
                <div className="relative aspect-[16/10] min-h-[360px]">
                  {activeItem.kind === "video" ? (
                    <video
                      key={activeItem.id}
                      autoPlay
                      muted
                      loop
                      playsInline
                      preload="metadata"
                      poster={activeItem.posterUrl}
                      className="h-full w-full object-cover"
                    >
                      <source src={activeItem.fileUrl} type={activeItem.mimeType} />
                    </video>
                  ) : (
                    <PhotoSurface
                      item={activeItem}
                      alt={activeItem.title}
                      sizes="(max-width: 1280px) 100vw, 60vw"
                      className="object-cover transition duration-700 group-hover:scale-[1.02]"
                      priority
                    />
                  )}

                  <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(7,11,26,0.12),rgba(7,11,26,0.76))]" />

                  <div className="absolute left-0 right-0 top-0 flex items-center justify-between gap-3 p-5">
                    <div className="flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.24em] text-cloud/80">
                      <span className="rounded-full border border-white/10 bg-black/30 px-3 py-2">
                        {activeItem.collection ?? activeItem.sourceLabel ?? activeItem.source}
                      </span>
                      <span className="rounded-full border border-white/10 bg-black/30 px-3 py-2">
                        {activeIndex + 1} / {items.length}
                      </span>
                      {activeItem.kind === "video" && formatDuration(activeItem.durationSeconds) && (
                        <span className="rounded-full border border-white/10 bg-black/30 px-3 py-2">
                          {formatDuration(activeItem.durationSeconds)}
                        </span>
                      )}
                    </div>
                    <div className="rounded-full border border-white/10 bg-black/35 p-3 text-white/90">
                      {activeItem.kind === "video" ? <Clapperboard size={18} /> : <Images size={18} />}
                    </div>
                  </div>

                  <div className="absolute inset-x-0 bottom-0 p-5 md:p-6">
                    <div className="max-w-3xl rounded-[28px] border border-white/10 bg-black/35 p-5 backdrop-blur-sm">
                      <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.24em] text-cloud/65">
                        <span>{formatDate(activeItem.capturedAt)}</span>
                        {buildMetaLine(activeItem) && (
                          <>
                            <span className="h-1 w-1 rounded-full bg-cloud/45" />
                            <span>{buildMetaLine(activeItem)}</span>
                          </>
                        )}
                      </div>
                      <div className="mt-3 text-2xl font-semibold text-white md:text-3xl">{activeItem.title}</div>
                      <div className="mt-4 flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.22em] text-cloud/70">
                        {activeItem.location && (
                          <span className="rave-chip inline-flex max-w-full items-center gap-2 rounded-full px-3 py-2">
                            <MapPin size={12} />
                            <span className="truncate">{activeItem.location}</span>
                          </span>
                        )}
                      </div>
                      <div className="mt-5 flex flex-wrap gap-3">
                        <Button asChild>
                          <Link href="/photos">Open the gallery</Link>
                        </Button>
                        {activeItem.kind === "video" && (
                          <Button variant="secondary" asChild>
                            <Link href="/photos">
                              <Play size={16} />
                              Play clip
                            </Link>
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>

              <div className="grid gap-4">
                <div className="rounded-[28px] border border-white/10 bg-black/20 p-5">
                  <div className="flex items-center justify-between gap-3 text-[10px] uppercase tracking-[0.28em] text-cloud/55">
                    <span>{immichSummary?.label ?? "Immich album"}</span>
                    <span>{immichSummary?.images ?? items.filter((item) => item.kind === "image").length} stills</span>
                  </div>
                  <div className="mt-3 text-lg font-semibold text-white">
                    Living room shelf
                  </div>
                </div>

                <div className="grid gap-3">
                  {previewItems.map((item, index) => (
                    <motion.div
                      key={item.id}
                      initial={{ opacity: 0, x: 16 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.45, delay: 0.08 * index }}
                      className="group overflow-hidden rounded-[24px] border border-white/10 bg-black/20"
                    >
                      <div className="relative aspect-[4/3]">
                        {item.kind === "video" ? (
                          <>
                            <Image
                              src={item.posterUrl ?? item.previewUrl ?? ""}
                              alt={item.title}
                              fill
                              sizes="(max-width: 1280px) 50vw, 24vw"
                              className="object-cover transition duration-500 group-hover:scale-[1.03]"
                              unoptimized
                            />
                            <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent,rgba(7,11,26,0.78))]" />
                            <div className="absolute right-3 top-3 rounded-full border border-white/10 bg-black/40 p-2 text-white">
                              <Play size={14} />
                            </div>
                          </>
                        ) : (
                          <PhotoSurface
                            item={item}
                            alt={item.title}
                            sizes="(max-width: 1280px) 50vw, 24vw"
                            className="object-cover transition duration-500 group-hover:scale-[1.03]"
                          />
                        )}
                        <div className="absolute inset-x-0 bottom-0 p-4">
                          <div className="rounded-[18px] border border-white/10 bg-black/45 p-3 backdrop-blur-sm">
                            <div className="text-[10px] uppercase tracking-[0.24em] text-cloud/58">
                              {item.collection ?? item.sourceLabel ?? item.source}
                            </div>
                            <div className="mt-2 line-clamp-2 text-sm font-semibold text-white">{item.title}</div>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>

                <div className="rounded-[28px] border border-white/10 bg-[linear-gradient(150deg,rgba(12,16,30,0.94),rgba(22,8,36,0.86))] p-5">
                  <div className="text-[10px] uppercase tracking-[0.28em] text-cloud/55">More from home</div>
                  <div className="mt-3 text-lg font-semibold text-white">The full gallery keeps the local drops too.</div>
                  <div className="mt-4">
                    <Button variant="secondary" asChild>
                      <Link href="/photos">See the whole gallery</Link>
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
