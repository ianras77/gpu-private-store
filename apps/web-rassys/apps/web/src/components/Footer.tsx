import Link from "next/link";
import { Radio } from "lucide-react";
import { publicRassysApps } from "../config/apps";
import { DJStatusBadge } from "./DJStatusBadge";
import { radioApiLinks } from "../lib/radio-links";

export function Footer() {
  return (
    <footer className="mx-auto max-w-6xl px-6 py-8 sm:py-10">
      <div className="relative overflow-hidden rounded-[26px] border border-white/10 bg-black/20 px-5 py-5 shadow-[0_20px_60px_rgba(0,0,0,0.2)] md:px-7">
        <div className="absolute -right-10 -top-16 h-40 w-40 rounded-full bg-comet/10 blur-3xl" aria-hidden="true" />
        <div className="relative flex flex-col gap-5">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <div className="section-title text-2xl text-white">Rassy’s <span className="text-glow">dot</span> Com</div>
              <p className="mt-1 text-xs text-cloud/58">A radio station, a game table, and the life around them.</p>
            </div>
            <DJStatusBadge />
          </div>
          <nav className="flex flex-wrap gap-x-4 gap-y-2 border-t border-white/10 pt-4" aria-label="Footer applications">
            {publicRassysApps.map((app) => <Link key={app.id} href={app.href} className="text-xs text-cloud/62 transition hover:text-white">{app.id === "family" ? "Family Photo Book" : app.label}</Link>)}
          </nav>
          <div className="flex flex-col justify-between gap-3 border-t border-white/10 pt-4 text-[11px] text-cloud/45 sm:flex-row sm:items-center">
            <div className="flex items-center gap-2"><Radio size={13} className="text-glow" /> Keep the station nearby:</div>
            <div className="flex flex-wrap gap-3"><a href={radioApiLinks.stream.mp3} className="transition hover:text-white">MP3 stream</a><a href={radioApiLinks.stream.lossless} className="transition hover:text-white">Lossless stream</a><Link href="/real-life-bedtime-stories/feed.xml" className="transition hover:text-white">Podcast feed</Link><span>Ian Rasmussen</span></div>
          </div>
        </div>
      </div>
    </footer>
  );
}
