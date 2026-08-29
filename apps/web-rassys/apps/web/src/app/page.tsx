import { CloudParticles } from "../components/CloudParticles";
import { Hero } from "../components/Hero";
import { publicRassysApps } from "../config/apps";
import { Footer } from "../components/Footer";
import { HomeRassyOpeningPanel } from "../components/HomeRassyOpeningPanel";
import { ThoughtsPanel } from "../components/ThoughtsPanel";
import { HomeFamilyStrip } from "../components/HomeFamilyStrip";

export default function HomePage() {
  return (
    <main className="relative overflow-hidden pb-12">
      <div className="absolute inset-0 -z-10 h-full w-full">
        <CloudParticles />
        <div className="absolute inset-x-0 top-0 h-[38rem] bg-[radial-gradient(circle_at_top,rgba(255,230,109,0.18),transparent_22%),radial-gradient(circle_at_20%_22%,rgba(66,245,255,0.16),transparent_30%),radial-gradient(circle_at_78%_16%,rgba(255,79,216,0.18),transparent_30%)]" />
        <div className="absolute left-1/2 top-56 hidden h-[72%] w-px -translate-x-1/2 bg-gradient-to-b from-white/14 via-white/0 to-transparent lg:block" />
      </div>
      <Hero />
      <HomeRassyOpeningPanel />
      <section className="mx-auto w-full max-w-6xl px-4 pb-7 sm:px-6">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div><div className="eyebrow">The app constellation</div><h2 className="section-title mt-2 text-2xl sm:text-3xl">Small doors. Big rooms.</h2></div>
          <span className="hidden text-xs uppercase tracking-[0.24em] text-cloud/45 sm:block">01—06 / live index</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {publicRassysApps.map((app, index) => (
          <a key={app.id} href={app.href} className="group rounded-[24px] border border-white/10 bg-white/[0.035] px-5 py-4 transition hover:-translate-y-1 hover:border-white/25 hover:bg-white/[0.07]">
            <div className="flex items-center justify-between gap-3"><span className="text-[10px] uppercase tracking-[0.25em] text-cloud/48">{String(index + 1).padStart(2, "0")} · {app.shortLabel}</span><span aria-hidden="true" className="text-lg text-glow">↗</span></div>
            <h2 className="mt-4 font-display text-xl text-white">{app.label === "Family Archive" ? "Family Photo Book" : app.label}</h2>
            <p className="mt-1 text-xs leading-5 text-cloud/65">{app.homepageDescription}</p>
            <span className="mt-3 inline-flex text-[10px] font-semibold uppercase tracking-[0.2em] text-glow group-hover:text-white">Open →</span>
          </a>
        ))}
        </div>
      </section>
      <ThoughtsPanel />
      <HomeFamilyStrip />
      <Footer />
    </main>
  );
}
