import { Card } from "./ui/card";

const foundations = [
  "The source material is real: my own library, folders, photos, and ongoing projects.",
  "Mr Rassy uses the live LLM stack to keep the booth responsive, curious, and in motion.",
  "Photos and bedtime stories keep the whole place close to home.",
  "Nothing here is meant to feel frozen; the rooms keep changing as life changes.",
] as const;

const routeSteps = [
  {
    title: "Start with the radio",
    body: "It is the quickest way to feel the taste and tempo of the whole place.",
    href: "/radio",
    cta: "Step into the booth",
  },
  {
    title: "Drift through the shelves",
    body: "The listening room, photos, and stories give the station a quieter orbit.",
    href: "/listening-room",
    cta: "Open the listening room",
  },
  {
    title: "Open the Dungeon Master table",
    body: "The persistent campaign console lives here now, with saved state, players, quests, and DM actions.",
    href: "/dungeon-master",
    cta: "Launch the DM app",
  },
] as const;

export function AboutPanel() {
  return (
    <section id="about" className="mx-auto max-w-6xl scroll-mt-28 px-6 py-16">
      <div className="mb-8 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="max-w-3xl">
          <div className="text-[11px] uppercase tracking-[0.38em] text-cloud/58">
            Welcome
          </div>
          <h2 className="section-title mt-3 text-3xl md:text-4xl">
            One place for the station, the shelves, and the rest of my life
            online.
          </h2>
        </div>
        <p className="max-w-xl text-sm leading-6 text-cloud/72">
          I wanted this to feel easy to move through and alive while you are in
          it. The radio stays at the center, and the other rooms stay close
          enough to feel connected instead of scattered.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
        <Card className="relative overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(255,230,109,0.14),transparent_32%),radial-gradient(circle_at_85%_15%,rgba(66,245,255,0.14),transparent_32%),linear-gradient(145deg,rgba(11,16,29,0.96),rgba(26,8,41,0.88))]">
          <div
            className="absolute -right-12 top-10 h-36 w-36 rounded-full bg-aurora/12 blur-3xl"
            aria-hidden="true"
          />
          <div
            className="absolute bottom-0 left-1/3 h-28 w-28 rounded-full bg-glow/12 blur-3xl"
            aria-hidden="true"
          />
          <div className="relative flex flex-col gap-6">
            <div className="text-[11px] uppercase tracking-[0.36em] text-cloud/58">
              Ian Rasmussen // Rassy
            </div>
            <h3 className="text-2xl font-semibold text-white md:text-3xl">
              Welcome in. The rooms connect on purpose.
            </h3>
            <p className="max-w-2xl text-sm leading-7 text-cloud/80">
              The station sits in the middle. From there you can drift into the
              listening room, the family shelf, bedtime stories, the notebook,
              and the smaller side paths.
            </p>
            <p className="max-w-2xl text-sm leading-7 text-cloud/76">
              Mr Rassy keeps the booth lively, but the site stays close to real
              shelves, real family life, and whatever I am actually spending
              time with right now.
            </p>
            <div className="flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.24em] text-cloud/60">
              <span className="rave-chip rounded-full px-3 py-2">
                Live radio
              </span>
              <span className="rave-chip rounded-full px-3 py-2">
                Mr Rassy live
              </span>
              <span className="rave-chip rounded-full px-3 py-2">
                Family shelf
              </span>
              <span className="rave-chip rounded-full px-3 py-2">
                Notebook
              </span>
            </div>
            <div className="rounded-[24px] border border-white/10 bg-black/20 p-4">
              <div className="text-[10px] uppercase tracking-[0.28em] text-cloud/52">
                What to expect here
              </div>
              <p className="mt-3 text-sm leading-6 text-cloud/76">
                Warm, current, and easy to wander. More like walking into a room
                than sorting through a menu.
              </p>
            </div>
          </div>
        </Card>

        <div className="grid gap-6">
          <Card className="flex flex-col gap-5">
            <div>
              <div className="text-[11px] uppercase tracking-[0.32em] text-cloud/58">
                What Holds It Together
              </div>
              <div className="mt-3 text-xl font-semibold text-white">
                The pieces underneath the signal
              </div>
            </div>
            <div className="grid gap-3">
              {foundations.map((item) => (
                <div
                  key={item}
                  className="rounded-[22px] border border-white/10 bg-black/15 px-4 py-3 text-sm leading-6 text-cloud/78"
                >
                  {item}
                </div>
              ))}
            </div>
          </Card>

          <Card className="flex flex-col gap-5">
            <div>
              <div className="text-[11px] uppercase tracking-[0.32em] text-cloud/58">
                Best Way Through It
              </div>
              <div className="mt-3 text-xl font-semibold text-white">
                A clean route through the rooms
              </div>
            </div>
            <div className="grid gap-3">
              {routeSteps.map((step, index) => (
                <a
                  key={step.title}
                  href={step.href}
                  className="group rounded-[22px] border border-white/10 bg-black/15 p-4 transition hover:border-white/20 hover:bg-black/22"
                >
                  <div className="flex items-start gap-4">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-black/25 text-[11px] font-semibold text-cloud/70">
                      {String(index + 1).padStart(2, "0")}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-white">
                        {step.title}
                      </div>
                      <p className="mt-2 text-sm leading-6 text-cloud/76">
                        {step.body}
                      </p>
                      <div className="mt-3 text-[11px] uppercase tracking-[0.22em] text-glow transition group-hover:text-white">
                        {step.cta}
                      </div>
                    </div>
                  </div>
                </a>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </section>
  );
}
