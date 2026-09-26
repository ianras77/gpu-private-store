import Link from "next/link";
import { Archive, ArrowUpRight, BookOpen, Radio, Sparkles } from "lucide-react";
import { HeaderSignalVisualizer } from "../../components/HeaderSignalVisualizer";
import { MrRassyStationDeck } from "../../components/MrRassyStationDeck";
import { MrRassyStationIntelligence } from "../../components/MrRassyStationIntelligence";
import { RoomShell } from "../../components/RoomShell";

const roomLinks = [
  { href: "#on-air", label: "On air", detail: "Play what is in the booth now", icon: Radio },
  { href: "#what-he-keeps", label: "Good things", detail: "Notes, sparks, and discoveries", icon: Sparkles },
  { href: "/mr-rassy/library", label: "The stacks", detail: "Wander through the records", icon: Archive },
  { href: "/mr-rassy/notes", label: "Booth notes", detail: "Little transmissions to keep", icon: BookOpen },
];

export default function MrRassyPage() {
  return (
    <RoomShell theme="home" channel="mr-rassy" agent="site-curator">
      <main className="relative overflow-hidden pb-12">
        <div className="pointer-events-none absolute inset-0 z-0 h-full w-full" aria-hidden="true">
          <div className="absolute inset-x-0 top-0 h-[42rem] bg-[radial-gradient(circle_at_top,rgba(255,230,109,0.18),transparent_22%),radial-gradient(circle_at_16%_22%,rgba(66,245,255,0.16),transparent_30%),radial-gradient(circle_at_82%_12%,rgba(255,79,216,0.18),transparent_30%)]" />
          <div className="absolute left-1/2 top-64 hidden h-[72%] w-px -translate-x-1/2 bg-gradient-to-b from-white/14 via-white/0 to-transparent lg:block" />
        </div>

        <section className="relative mx-auto w-full max-w-6xl px-4 pb-7 pt-6 sm:px-6 sm:pt-8">
          <div className="glass-panel overflow-hidden rounded-[30px] p-4 md:p-6 lg:px-7 lg:py-6">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-3xl">
                <div className="eyebrow"><Radio size={13} className="mr-2 inline text-glow" /> Mr Rassy&apos;s room</div>
                <h1 className="section-title mt-3 text-4xl leading-[.98] sm:text-6xl">Come hang out for a minute.</h1>
                <p className="mt-3 max-w-2xl text-sm leading-7 text-cloud/78 sm:text-[15px]">
                  Records, weird little ideas, good people, and a station that changes with the room. Pick a door — nothing here needs to feel like a dashboard.
                </p>
              </div>
              <div className="w-full max-w-sm overflow-hidden rounded-[22px] border border-white/10 bg-black/20">
                <HeaderSignalVisualizer />
                <div className="px-4 py-3 text-[10px] uppercase tracking-[0.25em] text-cloud/60">The signal is already here</div>
              </div>
            </div>

            <nav className="mt-6 grid gap-2 sm:grid-cols-2 lg:grid-cols-4" aria-label="Mr Rassy room sections">
              {roomLinks.map(({ href, label, detail, icon: Icon }) => (
                <Link key={href} href={href} className="group rounded-[20px] border border-white/10 bg-white/[0.035] p-4 transition hover:-translate-y-1 hover:border-white/25 hover:bg-white/[0.075]">
                  <div className="flex items-center justify-between text-glow"><Icon size={17} /><ArrowUpRight size={15} className="transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" /></div>
                  <div className="mt-4 font-display text-lg text-white">{label}</div>
                  <div className="mt-1 text-xs leading-5 text-cloud/65">{detail}</div>
                </Link>
              ))}
            </nav>
          </div>
        </section>

        <div id="on-air" className="relative"><MrRassyStationDeck /></div>
        <div id="what-he-keeps" className="relative"><MrRassyStationIntelligence /></div>
      </main>
    </RoomShell>
  );
}
