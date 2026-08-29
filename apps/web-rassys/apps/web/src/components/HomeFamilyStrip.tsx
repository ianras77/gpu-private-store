"use client";

import Link from "next/link";
import useSWR from "swr";
import type { PhotoItem, PhotoShelfPayload } from "../lib/media-controller";
import { PhotoSurface } from "./PhotoSurface";

const fetcher = (url: string) => fetch(url, { cache: "no-store" }).then((r) => r.json());

export function HomeFamilyStrip() {
  const { data } = useSWR<PhotoShelfPayload>("/api/photos?limit=18&source=immich", fetcher, { refreshInterval: 120000 });
  const items = (Array.isArray(data?.items) ? data.items : []).filter((item): item is PhotoItem => item.kind === "image").slice(0, 3);

  return <section className="mx-auto max-w-6xl px-6 py-4 pb-14">
    <div className="mb-4 flex items-end justify-between gap-4"><div><div className="eyebrow">Family Photo Book</div><h2 className="section-title mt-2 text-2xl sm:text-3xl">A few frames from home.</h2></div><Link href="/family" className="text-[10px] uppercase tracking-[0.24em] text-glow">Open the book →</Link></div>
    {items.length ? <div className="grid grid-cols-3 gap-3 sm:gap-5">{items.map((item) => <Link key={item.id} href="/family" className="group relative aspect-[4/5] overflow-hidden rounded-[22px] border border-white/10 bg-black/20"><PhotoSurface item={item} alt={item.title} sizes="(max-width: 640px) 33vw, 320px" className="object-cover transition duration-700 group-hover:scale-105" /><div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-3 pt-10 text-[10px] uppercase tracking-[0.18em] text-white/75">{item.collection ?? "From the book"}</div></Link>)}</div> : <div className="rounded-[24px] border border-dashed border-white/12 px-5 py-6 text-sm text-cloud/60">The photo book is quiet right now.</div>}
  </section>;
}
