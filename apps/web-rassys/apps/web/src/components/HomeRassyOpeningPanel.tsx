"use client";

import Link from "next/link";
import useSWR from "swr";
import { MessageCircleMore, Pause, Play, Radio } from "lucide-react";
import { usePersistentRadioPlayer } from "./PersistentRadioPlayerProvider";

type HomeRadio = { nowPlaying?: { title?: string; artist?: string } | null; dj?: { script?: string | null; mood?: string | null } | null };
const fetcher = (url: string) => fetch(url, { cache: "no-store" }).then((r) => r.json());

export function HomeRassyOpeningPanel() {
  const { data } = useSWR<HomeRadio>("/api/radio/home", fetcher, { refreshInterval: 15000 });
  const { playing, toggle } = usePersistentRadioPlayer();
  const track = data?.nowPlaying;
  return <section className="mx-auto max-w-6xl px-6 pb-8"><div className="home-rassy-opening relative overflow-hidden rounded-[30px] border border-white/12 p-5 md:p-7"><div className="relative flex flex-col gap-5 md:flex-row md:items-center md:justify-between"><div><div className="eyebrow"><Radio size={13} className="mr-2 inline text-glow" /> Mr Rassy // opening transmission</div><h2 className="section-title mt-3 text-3xl sm:text-5xl">The booth is already awake.</h2><p className="mt-3 max-w-2xl text-sm leading-7 text-cloud/75">{data?.dj?.script ?? "A living radio room with a taste for the next right record."}</p><div className="mt-4 flex flex-wrap gap-2"><span className="rave-chip rounded-full px-3 py-2 text-[10px] uppercase tracking-[0.2em]">{data?.dj?.mood ?? "live signal"}</span><span className="rave-chip rounded-full px-3 py-2 text-[10px] uppercase tracking-[0.2em]">{track?.title ? `${track.title} · ${track.artist ?? "Mr Rassy"}` : "Waiting for the next record"}</span></div></div><div className="flex shrink-0 flex-wrap gap-2"><button type="button" onClick={() => void toggle()} className="inline-flex items-center gap-2 rounded-full bg-glow px-5 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-black transition hover:scale-[1.02]" aria-label={playing ? "Pause Mr Rassy" : "Play Mr Rassy"}>{playing ? <Pause size={15} /> : <Play size={15} />}{playing ? "Pause" : "Listen"}</button><Link href="/mr-rassy" className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/20 px-5 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-white transition hover:border-white/35">Enter booth <MessageCircleMore size={15} /></Link></div></div></div></section>;
}
