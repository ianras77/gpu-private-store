import { CloudParticles } from "../components/CloudParticles";
import { Hero } from "../components/Hero";
import { publicRassysApps } from "../config/apps";
import { Footer } from "../components/Footer";

export default function HomePage() {
  return (
    <main className="relative overflow-hidden pb-12">
      <div className="absolute inset-0 -z-10 h-full w-full">
        <CloudParticles />
        <div className="absolute inset-x-0 top-0 h-[38rem] bg-[radial-gradient(circle_at_top,rgba(255,230,109,0.18),transparent_22%),radial-gradient(circle_at_20%_22%,rgba(66,245,255,0.16),transparent_30%),radial-gradient(circle_at_78%_16%,rgba(255,79,216,0.18),transparent_30%)]" />
        <div className="absolute left-1/2 top-56 hidden h-[72%] w-px -translate-x-1/2 bg-gradient-to-b from-white/14 via-white/0 to-transparent lg:block" />
      </div>
      <Hero />
      <section className="mx-auto grid w-full max-w-6xl gap-4 px-4 pb-8 sm:px-6 md:grid-cols-2 lg:grid-cols-3">
        {publicRassysApps.map((app, index) => (
          <a key={app.id} href={app.href} className={`group rounded-3xl border border-white/10 bg-white/[0.045] p-6 shadow-[0_18px_50px_rgba(0,0,0,0.2)] transition hover:-translate-y-1 hover:border-white/25 ${index === 0 ? "md:col-span-2 lg:col-span-2" : ""}`}>
            <div className="mb-8 flex items-center justify-between"><span className="text-[10px] uppercase tracking-[0.28em] text-cloud/55">Application {String(index + 1).padStart(2, "0")}</span><span aria-hidden="true" className="text-2xl text-glow">✦</span></div>
            <h2 className="font-display text-2xl text-white sm:text-3xl">{app.label}</h2>
            <p className="mt-2 max-w-md text-sm leading-6 text-cloud/70">{app.homepageDescription}</p>
            <span className="mt-6 inline-flex text-xs font-semibold uppercase tracking-[0.2em] text-glow group-hover:text-white">Enter {app.label} →</span>
          </a>
        ))}
      </section>
      <Footer />
    </main>
  );
}
