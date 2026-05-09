import Link from "next/link";
import { BrandMark } from "@/components/brand/mark";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function HomePage() {
  const capabilityColumns = [
    {
      title: "Game Coach",
      items: [
        "Turn a short kid idea into a genre, map, quest loop, and next build steps",
        "Keep the conversation playful while still grounded in project files and memory",
        "Move from brainstorm to reusable build kit without leaving the same surface"
      ]
    },
    {
      title: "Inspiration + Memory",
      items: [
        "Upload sketches, screenshots, docs, and URLs into the idea board",
        "Save reusable references, phrases, and mechanic notes into project memory",
        "Turn inspiration into something the coach can actually use"
      ]
    },
    {
      title: "Build Kits + Studio Bridge",
      items: [
        "Install and draft reusable studio powers for quests, NPCs, and mechanics",
        "Check the engine today while shaping the path to Studio linking next",
        "Keep publishing reviewed, supervised, and friendly for families"
      ]
    }
  ];

  const quickStarts = [
    {
      title: "Dream a game",
      body: "Start with an obby, racer, pet adventure, or story quest and let the coach turn it into a plan.",
      href: "/playground?tab=chat",
      cta: "Open coach"
    },
    {
      title: "Open asset shelf",
      body: "Browse safe art packs and add sketches, screenshots, notes, and links the studio can remix.",
      href: "/playground?tab=assets",
      cta: "Open shelf"
    },
    {
      title: "Open build kits",
      body: "Reuse and grow coach powers for checkpoints, quests, NPCs, and beginner-friendly scripts.",
      href: "/playground?tab=plugins",
      cta: "Open kits"
    }
  ];

  const flow = [
    {
      step: "01",
      title: "Dream",
      body: "Describe the kind of adventure you want to build in kid language."
    },
    {
      step: "02",
      title: "Remix",
      body: "Add inspiration, references, and reusable build kits when the project needs them."
    },
    {
      step: "03",
      title: "Review",
      body: "Keep the path to Studio linking and publish visible, parent-reviewed, and calm."
    }
  ];

  const stack = [
    {
      label: "Studio shell",
      value: "Launchpad web app",
      detail: "Landing, sign-in, game coach, and project lanes."
    },
    {
      label: "AI engine",
      value: "Cheshire Cat engine",
      detail: "Guided forms, build kits, memory, and coach routing."
    },
    {
      label: "Project memory",
      value: "Qdrant vector memory",
      detail: "Saved inspiration, reusable references, and recall collections."
    },
    {
      label: "Studio bridge",
      value: "Companion plugin planned next",
      detail: "The future path for Roblox Studio linking, previews, and reviewed publish."
    }
  ];

  const featureCards = [
    {
      title: "Game coach",
      body: "Keep one playful thread where scenes, quests, mechanics, and next steps stay together."
    },
    {
      title: "Starter templates",
      body: "Guide kids into adventure patterns like obbies, racers, pet quests, and story worlds."
    },
    {
      title: "Inspiration packs",
      body: "Upload pictures, notes, and docs so the coach can borrow the right mood and references."
    },
    {
      title: "Build kits",
      body: "Turn good chats into reusable powers for checkpoints, NPCs, rewards, and level ideas."
    },
    {
      title: "Parent mode",
      body: "Keep account linking and publish approval behind a calmer, supervised flow."
    },
    {
      title: "Studio-ready path",
      body: "Use this version as the foundation for a future Roblox Studio companion plugin."
    }
  ];

  return (
    <div className="min-h-screen bg-ink-950 text-ink-50">
      <div className="hero-bg relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(15,18,24,0.85),_rgba(8,10,14,0.98))]" />
        <div className="absolute -top-28 left-1/2 -translate-x-1/2">
          <div className="floating-orb h-[420px] w-[420px] rounded-full bg-glow-500/15 blur-[120px]" />
        </div>
        <div className="floating-orb absolute -right-24 top-40 h-[360px] w-[360px] rounded-full bg-ember-500/15 blur-[120px]" />
        <div className="relative mx-auto max-w-6xl px-6 py-12">
          <nav className="flex flex-wrap items-center justify-between gap-4">
            <BrandMark />
            <div className="flex items-center gap-3">
              <Link href="/playground">
                <Button variant="ghost">Open studio</Button>
              </Link>
              <Link href="/sign-in">
                <Button variant="glow">Sign in / Log in</Button>
              </Link>
            </div>
          </nav>

          <div className="mt-16 grid gap-12 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
            <div className="space-y-8">
              <div className="intro-rise">
                <Badge variant="glow">Kid-First AI Game Studio</Badge>
                <h1 className="mt-6 text-4xl font-semibold leading-tight sm:text-5xl">
                  Turn game ideas into templates, build kits, and parent-reviewed next steps.
                </h1>
                <p className="mt-6 text-lg text-ink-200">
                  Rassy Launchpad takes the existing Cheshire Cat framework and points it at a new
                  mission: helping kids dream up games, remix inspiration, learn building logic,
                  and carry projects toward Roblox Studio without throwing families into a wall of
                  admin panels.
                </p>
              </div>
              <div className="intro-rise delay-1 flex flex-wrap gap-4">
                <Link href="/sign-in">
                  <Button variant="glow" size="lg">
                    Enter Launchpad
                  </Button>
                </Link>
                <Link href="/playground">
                  <Button variant="outline" size="lg">
                    Open the studio
                  </Button>
                </Link>
              </div>
              <div className="intro-rise delay-2 grid gap-4 sm:grid-cols-3">
                {featureCards.map((feature) => (
                  <div
                    key={feature.title}
                    className="rounded-2xl border border-ink-800 bg-ink-900/70 p-4"
                  >
                    <div className="text-sm font-semibold text-ink-50">{feature.title}</div>
                    <div className="mt-2 text-xs text-ink-300">{feature.body}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-6">
              <div className="intro-rise delay-1 rounded-3xl border border-ink-800 bg-ink-900/70 p-6 shadow-glow">
                <div className="flex items-center justify-between text-xs uppercase tracking-[0.3em] text-ink-400">
                  Build Rhythm
                  <Badge variant="neutral">Framework v1</Badge>
                </div>
                <div className="mt-4 space-y-3">
                  {flow.map((item) => (
                    <div
                      key={item.step}
                      className="rounded-2xl border border-ink-800 bg-ink-950/70 px-4 py-3 text-xs"
                    >
                      <div className="flex items-center gap-3">
                        <span className="rounded-full border border-ink-600 bg-ink-900 px-2 py-0.5 font-semibold text-ink-200">
                          {item.step}
                        </span>
                        <span className="text-sm font-semibold text-ink-50">{item.title}</span>
                      </div>
                      <div className="mt-2 text-ink-300">{item.body}</div>
                    </div>
                  ))}
                </div>
                <div className="mt-6">
                  <Link href="/sign-in">
                    <Button variant="outline">Enter the studio</Button>
                  </Link>
                </div>
              </div>

              <div className="intro-rise delay-2 rounded-3xl border border-ink-800 bg-ink-900/70 p-6">
                <div className="text-xs uppercase tracking-[0.3em] text-ink-400">Why This Base Works</div>
                <div className="mt-3 text-lg font-semibold">Keep the good framework, change the product story.</div>
                <div className="mt-3 text-sm text-ink-300">
                  The backend already has the right ingredients: chat, plugins, forms, memory, and
                  server-routed auth. The pivot is to turn those ingredients into an intuitive
                  studio for kids and parents instead of a general-purpose control console.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <section className="mx-auto max-w-6xl px-6 py-16">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.35em] text-ink-400">Quick Entry</div>
            <h2 className="mt-3 text-3xl font-semibold">Where do you want to start?</h2>
          </div>
          <Link href="/sign-in">
            <Button variant="glow">Sign in to continue</Button>
          </Link>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {quickStarts.map((item) => (
            <div key={item.title} className="rounded-3xl border border-ink-800 bg-ink-900/70 p-6">
              <div className="text-lg font-semibold">{item.title}</div>
              <div className="mt-3 text-sm text-ink-300">{item.body}</div>
              <div className="mt-5">
                <Link href={item.href}>
                  <Button variant="outline" size="sm">
                    {item.cta}
                  </Button>
                </Link>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-20">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.35em] text-ink-400">Capabilities</div>
            <h2 className="mt-3 text-3xl font-semibold">What Launchpad is built to do next</h2>
          </div>
          <Link href="/sign-in">
            <Button variant="glow">Open the studio</Button>
          </Link>
        </div>
        <div className="grid gap-6 lg:grid-cols-3">
          {capabilityColumns.map((column) => (
            <div key={column.title} className="rounded-3xl border border-ink-800 bg-ink-900/70 p-6">
              <div className="text-lg font-semibold">{column.title}</div>
              <div className="mt-4 space-y-2 text-sm text-ink-300">
                {column.items.map((item) => (
                  <div key={item} className="rounded-xl border border-ink-800 bg-ink-950/60 px-3 py-2">
                    {item}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-20">
        <div className="rounded-3xl border border-ink-800 bg-ink-900/70 p-6">
          <div className="text-xs uppercase tracking-[0.35em] text-ink-400">Current Foundation</div>
          <div className="mt-3 text-2xl font-semibold">What this version already gives us</div>
          <div className="mt-6 grid gap-3 md:grid-cols-2">
            {stack.map((item) => (
              <div
                key={item.label}
                className="rounded-2xl border border-ink-800 bg-ink-950/60 px-4 py-3"
              >
                <div className="text-[10px] uppercase tracking-[0.2em] text-ink-500">{item.label}</div>
                <div className="mt-1 text-sm font-semibold text-ink-100">{item.value}</div>
                <div className="mt-1 text-xs text-ink-300">{item.detail}</div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
