import EditTaleForm from "../../../../components/EditTaleForm";

export default function EditTalePage({ params }: { params: { id: string } }) {
  return (
    <div className="space-y-8">
      <section className="relative overflow-hidden rounded-[3rem] border border-ink/80 bg-ink px-8 py-10 text-parchment shadow-[0_30px_90px_rgba(17,12,10,0.42)] md:px-10 md:py-12">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-[radial-gradient(circle_at_top,_rgba(244,201,93,0.32),_transparent_70%)]" />
        <div className="pointer-events-none absolute -right-10 top-12 h-52 w-52 rounded-full bg-sky/15 blur-3xl" />
        <div className="relative grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <p className="text-xs uppercase tracking-[0.42em] text-parchment/55">
              Story revision
            </p>
            <h1 className="mt-4 max-w-4xl font-display text-5xl leading-[0.95] text-parchment md:text-6xl">
              Bring the draft back with more bite, more clarity, and no washed
              out corners.
            </h1>
            <p className="mt-5 max-w-3xl text-lg leading-8 text-parchment/78">
              This page is for tightening the tale after moderation notes. Keep
              the best parts, sharpen what is muddy, and resubmit when it feels
              stage-ready again.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
            <div className="rounded-[2rem] border border-parchment/15 bg-white/10 p-6 backdrop-blur-sm">
              <p className="text-xs uppercase tracking-[0.28em] text-parchment/50">
                What to fix
              </p>
              <p className="mt-3 text-sm leading-7 text-parchment/74">
                Tighten the draft, adjust the prompt note if needed, and swap in
                a replacement image when the current one is part of the problem.
              </p>
            </div>
            <div className="rounded-[2rem] border border-gold/20 bg-gold/10 p-6">
              <p className="text-xs uppercase tracking-[0.28em] text-gold/80">
                Resubmission flow
              </p>
              <p className="mt-3 text-sm leading-7 text-parchment/74">
                The moderation queue stays the same. The experience around it is
                just more confident now.
              </p>
            </div>
          </div>
        </div>
      </section>

      <EditTaleForm id={params.id} />
    </div>
  );
}
