"use client";

import Link from "next/link";
import useSWR from "swr";
import type { PhotoItem, PhotoShelfPayload } from "../lib/media-controller";
import { PhotoSurface } from "./PhotoSurface";

const fetcher = (url: string) => fetch(url, { cache: "no-store" }).then((response) => response.json());

export function HomeFamilyStrip() {
  const { data, isLoading } = useSWR<PhotoShelfPayload>("/api/photos?limit=18", fetcher, { refreshInterval: 120000 });
  const allItems = Array.isArray(data?.items) ? data.items : [];
  const immichItems = allItems.filter((item): item is PhotoItem => item.source === "immich" && item.kind === "image");
  const localItems = allItems.filter((item): item is PhotoItem => item.source === "local" && item.kind === "image");
  const items = (immichItems.length ? immichItems : localItems).slice(0, 3);
  const isImmich = immichItems.length > 0;

  return (
    <section className="mx-auto max-w-6xl px-6 py-4 pb-14">
      <div className="mb-4 flex items-end justify-between gap-4"><div><div className="eyebrow">{isImmich ? "Immich live shelf" : "Family photo book"}</div><h2 className="section-title mt-2 text-2xl sm:text-3xl">Little windows into home.</h2></div><Link href="/family" className="text-[10px] uppercase tracking-[0.24em] text-glow">Open the book →</Link></div>
      {items.length ? <div className="home-photo-shelf grid grid-cols-3 gap-2 sm:gap-4">{items.map((item, index) => <Link key={item.id} href="/family" className={`group relative overflow-hidden rounded-[22px] border border-white/10 bg-black/20 shadow-[0_18px_45px_rgba(0,0,0,.18)] ${index === 1 ? "-translate-y-3 sm:-translate-y-5" : ""}`}><div className="relative aspect-[4/5]"><PhotoSurface item={item} alt={item.title} sizes="(max-width: 640px) 33vw, 320px" className="object-cover transition duration-700 group-hover:scale-105" /><div className="absolute inset-0 bg-gradient-to-t from-[#07020f]/80 via-transparent to-transparent" /><div className="absolute inset-x-0 bottom-0 p-3 text-[9px] uppercase tracking-[0.16em] text-white/75"><span className="block truncate">{item.collection ?? (isImmich ? "From Immich" : "Recent drop")}</span><span className="mt-1 block text-cloud/45">{index + 1} / {items.length}</span></div></div></Link>)}</div> : <div className="home-photo-empty rounded-[24px] border border-dashed border-white/12 px-5 py-7 text-sm text-cloud/60"><div className="text-lg text-white">The photo wall is waiting for its next drop.</div><div className="mt-2 max-w-xl leading-6">When Immich has an album available, its newest frames will bloom here automatically.</div>{isLoading ? <div className="mt-4 text-[10px] uppercase tracking-[0.2em] text-glow">Looking for the shelf…</div> : null}</div>}
    </section>
  );
}
