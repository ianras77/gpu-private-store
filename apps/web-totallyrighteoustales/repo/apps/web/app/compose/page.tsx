import TaleForm from "../../components/TaleForm";

export default function ComposePage() {
  return (
    <div className="space-y-8">
      <section className="relative overflow-hidden rounded-[3rem] border border-ink/80 bg-ink px-8 py-10 text-parchment shadow-[0_30px_90px_rgba(17,12,10,0.42)] md:px-10 md:py-12">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-[radial-gradient(circle_at_top,_rgba(244,201,93,0.34),_transparent_68%)]" />
        <div className="pointer-events-none absolute -left-20 bottom-0 h-64 w-64 rounded-full bg-ember/20 blur-3xl" />
        <div className="pointer-events-none absolute -right-12 top-14 h-56 w-56 rounded-full bg-sky/15 blur-3xl" />

        <div className="relative grid gap-8 xl:grid-cols-[1.2fr_0.8fr]">
          <div>
            <p className="text-xs uppercase tracking-[0.42em] text-parchment/55">
              Story forge
            </p>
            <h1 className="mt-4 max-w-4xl font-display text-5xl leading-[0.95] text-parchment md:text-7xl">
              Build something impossible, then send it into the room like it
              belongs there.
            </h1>
            <p className="mt-5 max-w-3xl text-lg leading-8 text-parchment/78">
              Draft from scratch, spark the studio for a sharper opening, or do
              both. This composer is meant to feel like a stage, not a form.
            </p>
            <div className="mt-7 flex flex-wrap gap-3 text-[0.68rem] uppercase tracking-[0.24em] text-parchment/72">
              <span className="rounded-full border border-parchment/20 bg-white/5 px-4 py-2">
                Big titles
              </span>
              <span className="rounded-full border border-parchment/20 bg-white/5 px-4 py-2">
                Handmade or prompt-spun
              </span>
              <span className="rounded-full border border-parchment/20 bg-white/5 px-4 py-2">
                Anonymous or named
              </span>
              <span className="rounded-full border border-parchment/20 bg-white/5 px-4 py-2">
                Image and voice ready
              </span>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
            <div className="rounded-[2rem] border border-parchment/15 bg-white/10 p-6 backdrop-blur-sm">
              <p className="text-xs uppercase tracking-[0.28em] text-parchment/50">
                Start loud
              </p>
              <p className="mt-3 font-display text-3xl text-parchment">
                Open with an image nobody can ignore.
              </p>
              <p className="mt-3 text-sm leading-7 text-parchment/72">
                Lead with a title that feels like a marquee, then let the first
                paragraph hit fast.
              </p>
            </div>
            <div className="rounded-[2rem] border border-gold/20 bg-gold/10 p-6">
              <p className="text-xs uppercase tracking-[0.28em] text-gold/80">
                Prompt studio
              </p>
              <p className="mt-3 text-sm leading-7 text-parchment/74">
                Feed the engine a premise, mood, setting, and one impossible
                detail. Keep the spark if it helps. Throw it away if it does
                not.
              </p>
            </div>
            <div className="rounded-[2rem] border border-sky/20 bg-sky/10 p-6 sm:col-span-2 xl:col-span-1">
              <p className="text-xs uppercase tracking-[0.28em] text-sky/90">
                Publishing promise
              </p>
              <p className="mt-3 text-sm leading-7 text-parchment/74">
                Every story can go out under your storyteller name or behind a
                mask. The page stays dramatic either way.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-[2rem] border border-ink/15 bg-parchment/95 p-6 shadow-soft">
          <p className="text-xs uppercase tracking-[0.28em] text-ember">
            01. Spark
          </p>
          <h2 className="mt-3 font-display text-3xl text-ink">
            Write from instinct or bait the machine with a better premise.
          </h2>
        </div>
        <div className="rounded-[2rem] border border-ink/15 bg-white p-6 shadow-soft">
          <p className="text-xs uppercase tracking-[0.28em] text-moss">
            02. Shape
          </p>
          <h2 className="mt-3 font-display text-3xl text-ink">
            Polish the rhythm, add an image, and let the draft feel finished.
          </h2>
        </div>
        <div className="rounded-[2rem] border border-ink/15 bg-blush/30 p-6 shadow-soft">
          <p className="text-xs uppercase tracking-[0.28em] text-berry">
            03. Release
          </p>
          <h2 className="mt-3 font-display text-3xl text-ink">
            Send it to moderation, then watch it earn hearts in public.
          </h2>
        </div>
      </section>

      <TaleForm />
    </div>
  );
}
