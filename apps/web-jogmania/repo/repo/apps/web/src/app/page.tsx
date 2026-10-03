import Link from "next/link";
import { Navbar } from "@/components/ui/Navbar";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { buttonStyles } from "@/components/ui/buttonStyles";

const lights = ["🎟️", "🪙", "🎯", "🐭", "🎈"];

export default function HomePage() {
  return (
    <main className="min-h-screen overflow-hidden">
      <Navbar
        variant="glass"
        items={[{ href: "/overview", label: "Arcade" }, { href: "/runs", label: "Postcards" }]}
        cta={
          <>
            <Link href="/login" className="text-sm text-jm-muted hover:text-jm-text">Sign In</Link>
            <Link href="/register" className={buttonStyles("primary", "sm")}>Play outside</Link>
          </>
        }
      />

      <section className="jm-hero px-6 pb-20 pt-20 md:px-12 md:pb-28">
        <div className="relative z-10 mx-auto grid max-w-7xl grid-cols-1 items-center gap-12 lg:grid-cols-[1fr_0.9fr]">
          <div>
            <Badge tone="slate">Atari heart. Outside world.</Badge>
            <h1 className="mt-5 font-display text-4xl leading-tight md:text-6xl">
              The best arcade is <span className="text-jm-cyan">outside.</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg text-jm-muted">
              Jogmania turns your real route into a little adventure. Your Watch taps when a new surprise appears. When you get home, the arcade is a bit more alive.
            </p>
            <div className="mt-8 flex flex-wrap gap-4">
              <Link href="/register" className={buttonStyles("primary", "md")}>Start your first adventure</Link>
              <Link href="/login" className={buttonStyles("outline", "md")}>I have an arcade</Link>
            </div>
            <p className="mt-5 text-xs text-jm-muted">No pace targets. No missed-day penalties. No tiny screen to babysit.</p>
            <div className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-3">
              {[
                { title: "Pick a feeling", detail: "Gentle wander, familiar route, or surprise me." },
                { title: "Find little things", detail: "Watch story beats follow your actual distance." },
                { title: "Light the place", detail: "Each run opens another arcade attraction." }
              ].map((step, index) => (
                <Card key={step.title} className="p-4">
                  <p className="jm-kicker">{["Choose", "Discover", "Remember"][index]}</p>
                  <h3 className="mt-2 font-display text-lg">{step.title}</h3>
                  <p className="mt-2 text-xs leading-5 text-jm-muted">{step.detail}</p>
                </Card>
              ))}
            </div>
          </div>

          <Card className="jm-cartridge relative overflow-hidden p-6 md:p-8">
            <div className="absolute -right-12 -top-16 h-48 w-48 rounded-full bg-jm-magenta/20 blur-3xl" />
            <div className="relative flex items-start justify-between gap-4">
              <div>
                <p className="jm-kicker">Your first tiny world</p>
                <h2 className="mt-2 font-display text-2xl">The Lost Arcade</h2>
                <p className="mt-1 text-xs text-jm-muted">A lantern mouse says the lights have been out for ages.</p>
              </div>
              <span className="text-4xl" aria-hidden="true">🐭</span>
            </div>
            <div className="relative mt-7 rounded-2xl border border-white/10 bg-gradient-to-br from-[#321355] via-[#101d3e] to-[#063840] p-5">
              <div className="flex min-h-28 items-end justify-center gap-2">
                {lights.map((light, index) => (
                  <div key={light} className={`flex h-16 w-12 items-center justify-center rounded-t-2xl border border-white/10 text-2xl ${index < 2 ? "bg-neon-yellow/20 shadow-[0_0_20px_rgba(255,216,77,0.3)]" : "bg-black/30 opacity-35"}`}>
                    {light}
                  </div>
                ))}
              </div>
              <div className="mt-4 flex items-center justify-between text-xs">
                <span className="text-jm-acid">2 little lights are on</span>
                <span className="text-jm-muted">3 more surprises are waiting</span>
              </div>
              <div className="jm-meter mt-3"><span style={{ width: "40%" }} /></div>
            </div>
            <div className="relative mt-5 rounded-xl border border-jm-cyan/20 bg-jm-surface/60 p-4">
              <p className="jm-kicker">A note from the Worldkeeper</p>
              <p className="mt-2 text-sm text-jm-text">“That path looks familiar to you. I tucked a new token behind the old ticket booth.”</p>
              <p className="mt-2 text-[10px] text-jm-muted">A story from your course history · no pace target attached</p>
            </div>
          </Card>
        </div>
      </section>

      <section className="px-6 pb-16 md:px-12">
        <div className="mx-auto max-w-7xl">
          <p className="jm-kicker">Pocket-sized adventure</p>
          <h2 className="mt-3 max-w-2xl font-display text-3xl">A few bright moments, right where your run is happening.</h2>
          <div className="mt-7 grid grid-cols-1 gap-4 md:grid-cols-3">
            {[
              { icon: "🎒", title: "A mission that gets you", detail: "Mastra's Worldkeeper uses your chosen course, favorite paths, story style, and today's feeling to prepare a small, specific adventure." },
              { icon: "⌚", title: "A watch with a little magic", detail: "The Apple Watch shows your next story beat and taps your wrist when a discovery arrives. No mid-run button mashing." },
              { icon: "🌙", title: "A world that keeps the memory", detail: "After the run, see the real route, the little moments, your new arcade light, and a kind story you can bring along next time." }
            ].map((item) => (
              <Card key={item.title} className="p-6 jm-holo">
                <span className="text-3xl" aria-hidden="true">{item.icon}</span>
                <h3 className="mt-4 font-display text-xl">{item.title}</h3>
                <p className="mt-3 text-sm leading-6 text-jm-muted">{item.detail}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="px-6 pb-16 md:px-12">
        <Card className="mx-auto grid max-w-7xl grid-cols-1 gap-8 p-7 md:grid-cols-[0.8fr_1.2fr] md:p-10">
          <div>
            <p className="jm-kicker">Your pace is your own</p>
            <h2 className="mt-3 font-display text-3xl">A good run isn&apos;t a number.</h2>
            <p className="mt-4 text-sm leading-6 text-jm-muted">Jogmania celebrates showing up, finding a new course, returning to a familiar path, and slowly making your world more yours. The story never asks you to go faster.</p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {[
              ["🪙", "Arcade sparks", "Every run adds to your next level."],
              ["🧩", "Course keepsakes", "Come back and find new details on a familiar route."],
              ["🎠", "New attractions", "Every few adventures opens another part of the world."],
              ["💌", "Trail postcards", "A warm recap grounded in what actually happened."]
            ].map(([icon, title, detail]) => (
              <div key={title} className="rounded-xl border border-white/10 bg-jm-surface/70 p-4">
                <span className="text-xl" aria-hidden="true">{icon}</span>
                <p className="mt-2 text-sm text-jm-text">{title}</p>
                <p className="mt-1 text-xs leading-5 text-jm-muted">{detail}</p>
              </div>
            ))}
          </div>
        </Card>
      </section>

      <section className="px-6 pb-20 md:px-12">
        <Card className="mx-auto flex max-w-7xl flex-col gap-6 p-8 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="jm-kicker">Ready?</p>
            <h3 className="mt-2 font-display text-2xl">Take the long way home.</h3>
            <p className="mt-2 text-sm text-jm-muted">Bring your Apple Watch. Jogmania will bring the tiny arcade.</p>
          </div>
          <Link href="/register" className={buttonStyles("primary", "md")}>Start your first adventure</Link>
        </Card>
      </section>

      <footer className="px-6 pb-12 text-center text-xs text-jm-muted md:px-12">
        Jogmania turns ordinary outside time into a world worth visiting again.
      </footer>
    </main>
  );
}
