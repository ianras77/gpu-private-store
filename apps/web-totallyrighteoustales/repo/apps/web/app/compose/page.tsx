import { BookOpenCheck, Layers3, PenLine } from "lucide-react";
import TaleForm from "../../components/TaleForm";

export default function ComposePage() {
  return (
    <div className="space-y-7">
      <section className="press-hero p-5 sm:p-7 lg:p-9">
        <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
          <div>
            <p className="font-mono text-[0.7rem] font-bold uppercase tracking-[0.18em] text-press-gold">
              Compose desk
            </p>
            <h1 className="mt-4 max-w-4xl font-display text-5xl leading-[0.94] text-press-paper sm:text-7xl">
              Write like the press is waiting, not like the machine is hungry.
            </h1>
            <p className="mt-5 max-w-3xl text-base leading-8 text-press-paper/74 sm:text-lg">
              This is a modern Gutenberg bench for tall tales: define the story
              spine, draft in scenes, ask for craft notes, and only then send
              the sheet into public circulation.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            {[
              [PenLine, "Spine first", "Premise, character, stakes, turn."],
              [
                Layers3,
                "Scene craft",
                "Medium-to-long work with room to breathe.",
              ],
              [
                BookOpenCheck,
                "Anti-slop",
                "Notes and proofing, not authorship theft.",
              ],
            ].map(([Icon, title, copy]) => {
              const TypedIcon = Icon as typeof PenLine;
              return (
                <div
                  key={String(title)}
                  className="border border-white/12 bg-white/[0.06] p-4"
                >
                  <TypedIcon className="text-press-gold" size={21} />
                  <p className="mt-3 font-display text-2xl text-press-paper">
                    {String(title)}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-press-paper/64">
                    {String(copy)}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <TaleForm />
    </div>
  );
}
