import Link from "next/link";
import { Navbar } from "@/components/ui/Navbar";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { buttonStyles } from "@/components/ui/buttonStyles";

export default function HomePage() {
  return (
    <main className="min-h-screen">
      <Navbar
        variant="glass"
        items={[
          { href: "/pricing", label: "Pricing" },
          { href: "/overview", label: "Dashboard" }
        ]}
        cta={
          <>
            <Link href="/login" className="text-sm text-jm-muted hover:text-jm-text">Sign In</Link>
            <Link href="/register" className={buttonStyles("primary", "sm")}>Create Account</Link>
          </>
        }
      />

      <section className="jm-hero px-6 md:px-12 pt-20 pb-24">
        <div className="relative z-10 grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-12 items-center">
          <div>
            <Badge tone="slate">1980s arcade running</Badge>
            <h1 className="font-display text-4xl md:text-6xl leading-tight mt-5">
              Insert cartridge. Run IRL. <span className="text-jm-cyan">Play the course.</span>
            </h1>
            <p className="text-jm-muted mt-4 max-w-xl">
              Jogmania captures iPhone + Apple Watch runs, turns your best routes into Adventure Courses,
              and builds Pitfall-style course overlays from your pace, effort, and elevation.
            </p>
            <div className="mt-8 flex flex-wrap gap-4">
              <Link href="/register" className={buttonStyles("primary", "md")}>Create Account</Link>
              <Link href="/login" className={buttonStyles("outline", "md")}>Sign In</Link>
            </div>
            <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                { title: "Run", detail: "Capture GPS + HealthKit metrics." },
                { title: "Courses", detail: "Activate runs into Adventure Courses." },
                { title: "Replay", detail: "Course replays + rewards." }
              ].map((step, index) => (
                <Card key={step.title} className="p-4">
                  <p className="jm-kicker">Step 0{index + 1}</p>
                  <h3 className="font-display text-lg mt-2">{step.title}</h3>
                  <p className="text-xs text-jm-muted mt-2">{step.detail}</p>
                </Card>
              ))}
            </div>
          </div>

          <Card className="jm-cartridge p-6 lg:p-8">
            <div className="flex items-center justify-between">
              <div>
                <p className="jm-kicker">Cartridge</p>
                <h2 className="font-display text-2xl">Week 7: Turbo Jungle</h2>
              </div>
              <Badge tone="cyan">Streak 6</Badge>
            </div>
            <div className="mt-6 grid grid-cols-2 gap-3">
              {[
                { label: "Runs", value: "4" },
                { label: "Best Pace", value: "5:05" },
                { label: "Course", value: "Jungle Loop" },
                { label: "Rewards", value: "3 unlocked" }
              ].map((stat) => (
                <div key={stat.label} className="p-4 rounded-xl bg-jm-surface/80 border border-white/10">
                  <p className="text-xs text-jm-muted">{stat.label}</p>
                  <p className="text-lg font-display text-jm-text mt-1">{stat.value}</p>
                </div>
              ))}
            </div>
            <div className="mt-6 jm-track md:grid-cols-3">
              {["Jungle Gate", "River Swing", "Temple Sprint"].map((zone) => (
                <div key={zone} className="jm-track-segment">
                  <div className="p-3 rounded-xl bg-jm-surface/80 border border-white/10">
                    <p className="text-[0.55rem] uppercase tracking-[0.3em] text-jm-acid">Zone</p>
                    <p className="text-sm text-jm-text mt-1">{zone}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-6 jm-ledge px-4 py-3 rounded-xl text-xs text-jm-muted">
              Adventure Courses are activated from runs you choose to repeat.
            </div>
          </Card>
        </div>
      </section>

      <section className="px-6 md:px-12 pb-16">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-center">
          <div>
            <p className="jm-kicker">Adventure Engine</p>
            <h2 className="font-display text-3xl mt-4">Pitfall-inspired courses, built from your miles.</h2>
            <p className="text-sm text-jm-muted mt-4">
              Every run seeds a deterministic course. Hazards, loot, and narrative beats align to your
              splits, so the same route becomes a replayable course you can master.
            </p>
          </div>
          <Card className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="jm-kicker">Course Replay</p>
                <h3 className="font-display text-xl">Laser Lagoon</h3>
              </div>
              <Badge tone="magenta">Seed 4807</Badge>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="jm-chip text-jm-acid">Obstacle High</span>
              <span className="jm-chip text-jm-cyan">Scenes: 6</span>
              <span className="jm-chip text-jm-magenta">Boss Moment</span>
            </div>
            <div className="mt-6 jm-track md:grid-cols-3">
              {["Rope Climb", "Water Slide", "Temple Dash"].map((beat) => (
                <div key={beat} className="jm-track-segment">
                  <div className="p-3 rounded-xl bg-jm-surface/80 border border-white/10">
                    <p className="text-[0.55rem] uppercase tracking-[0.3em] text-jm-cyan">Beat</p>
                    <p className="text-sm text-jm-text mt-1">{beat}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </section>

      <section className="px-6 md:px-12 pb-16">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          {[
            { title: "Runs", detail: "Timeline, pace, distance, and maps.", preview: ["5.2 km · 28:14", "4.7 km · 26:05"] },
            { title: "Adventure Courses", detail: "Runs clustered into repeatable courses.", preview: ["Jungle Loop", "Neon Ridge"] },
            { title: "Course Replays", detail: "Narrative summaries from each effort.", preview: ["Laser Lagoon", "Temple Rush"] },
            { title: "Rewards", detail: "Unlock tokens, relics, and inventory.", preview: ["Quartz Badge", "Sprint Relic"] }
          ].map((item) => (
            <Card key={item.title} className="p-5">
              <p className="jm-kicker">Module</p>
              <h3 className="font-display text-xl mt-3">{item.title}</h3>
              <p className="text-sm text-jm-muted mt-3">{item.detail}</p>
              <div className="mt-4 space-y-2 text-xs text-jm-muted">
                {item.preview.map((line) => (
                  <div key={line} className="flex items-center justify-between bg-jm-surface/70 border border-white/5 rounded-lg px-3 py-2">
                    <span>{line}</span>
                    <span className="text-jm-cyan">Live</span>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      </section>

      <section className="px-6 md:px-12 pb-16">
        <Card className="p-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <p className="jm-kicker">Ownership</p>
            <h3 className="font-display text-2xl mt-3">Privacy + Data control</h3>
            <p className="text-sm text-jm-muted mt-2">
              Your data stays yours. Every run can be exported as JSON, and we never sell workout history.
            </p>
          </div>
          <div className="space-y-3 text-sm text-jm-muted">
            <div className="flex items-start gap-3">
              <Badge tone="acid">Exportable</Badge>
              <span>One-click export for any run or route.</span>
            </div>
            <div className="flex items-start gap-3">
              <Badge tone="cyan">Local first</Badge>
              <span>Built for personal progression and replay.</span>
            </div>
            <div className="flex items-start gap-3">
              <Badge tone="magenta">Transparent</Badge>
              <span>No hidden email verification unless SMTP is configured.</span>
            </div>
          </div>
        </Card>
      </section>

      <section className="px-6 md:px-12 pb-20">
        <Card className="p-8 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div>
            <p className="jm-kicker">Ready</p>
            <h3 className="font-display text-2xl mt-2">Start your arcade running era.</h3>
            <p className="text-sm text-jm-muted mt-2">Create an account and bring your runs to life.</p>
          </div>
          <div className="flex flex-wrap gap-4">
            <Link href="/register" className={buttonStyles("primary", "md")}>Create Account</Link>
            <Link href="/login" className={buttonStyles("outline", "md")}>Sign In</Link>
          </div>
        </Card>
      </section>

      <footer className="px-6 md:px-12 pb-12 text-xs text-jm-muted">
        Jogmania is in active development. Designed for iPhone + Apple Watch.
      </footer>
    </main>
  );
}
