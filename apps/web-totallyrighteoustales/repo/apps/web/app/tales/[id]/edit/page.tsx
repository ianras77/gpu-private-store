import EditTaleForm from "../../../../components/EditTaleForm";

export default function EditTalePage({ params }: { params: { id: string } }) {
  return (
    <div className="space-y-6">
      <section className="press-hero p-6 sm:p-8">
        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
          <div>
            <p className="font-mono text-[0.7rem] font-bold uppercase tracking-[0.18em] text-press-gold">
              Revision desk
            </p>
            <h1 className="mt-4 max-w-4xl font-display text-5xl leading-[0.94] text-press-paper sm:text-6xl">
              Reset the type, keep the promise, send back a stronger sheet.
            </h1>
            <p className="mt-5 max-w-3xl text-base leading-8 text-press-paper/74">
              Needs-edits is not a dead end. It is the press proof before the
              public edition.
            </p>
          </div>
          <div className="border border-white/12 bg-white/[0.06] p-5">
            <p className="font-display text-3xl text-press-paper">Proof rule</p>
            <p className="mt-3 text-sm leading-7 text-press-paper/68">
              Fix the specific moderation note first, then tighten title, image,
              and publishing mark.
            </p>
          </div>
        </div>
      </section>
      <EditTaleForm id={params.id} />
    </div>
  );
}
