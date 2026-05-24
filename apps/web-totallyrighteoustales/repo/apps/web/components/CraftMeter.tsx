import { Check, Circle, Feather, Sparkles } from "lucide-react";

export type StorySpine = {
  premise: string;
  character: string;
  stakes: string;
  turn: string;
};

const spineLabels: Array<keyof StorySpine> = [
  "premise",
  "character",
  "stakes",
  "turn",
];

function countWords(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function labelFor(key: keyof StorySpine) {
  return {
    premise: "Premise",
    character: "Character",
    stakes: "Stakes",
    turn: "Turn",
  }[key];
}

export default function CraftMeter({
  title,
  body,
  spine,
  studioUsed,
  pledgeAccepted,
}: {
  title: string;
  body: string;
  spine: StorySpine;
  studioUsed: boolean;
  pledgeAccepted: boolean;
}) {
  const completedSpine = spineLabels.filter((key) => spine[key].trim()).length;
  const words = countWords(body);
  const hasTitle = title.trim().length >= 3;
  const hasDraft = words >= 300;
  const readyCount =
    completedSpine +
    (hasTitle ? 1 : 0) +
    (hasDraft ? 1 : 0) +
    (pledgeAccepted ? 1 : 0);
  const readiness = Math.round((readyCount / 7) * 100);

  return (
    <section className="press-panel p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="press-label">Craft readiness</p>
          <h3 className="mt-2 font-display text-3xl text-press-ink dark:text-press-paper">
            {readiness}% set in type
          </h3>
        </div>
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-press-copper/30 bg-press-copper/10 text-press-copper">
          {studioUsed ? <Sparkles size={20} /> : <Feather size={20} />}
        </span>
      </div>

      <div className="mt-5 h-2 overflow-hidden rounded-full bg-press-ink/10 dark:bg-white/10">
        <div
          className="h-full rounded-full bg-[linear-gradient(90deg,#c7472b,#d8a23f,#2f7d73)]"
          style={{ width: `${readiness}%` }}
        />
      </div>

      <div className="mt-5 grid gap-2">
        <p className="text-sm font-semibold text-press-ink dark:text-press-paper">
          {studioUsed ? "Studio-assisted" : "Hand-led"}
        </p>
        <p className="text-sm leading-6 text-press-ink/68 dark:text-press-paper/68">
          {completedSpine} of 4 spine notes set. {words} words drafted.
        </p>
      </div>

      <div className="mt-5 grid gap-2">
        {spineLabels.map((key) => {
          const done = spine[key].trim().length > 0;
          return (
            <div
              key={key}
              className="flex items-center gap-2 text-sm text-press-ink/74 dark:text-press-paper/74"
            >
              {done ? (
                <Check size={15} className="text-press-green" />
              ) : (
                <Circle size={15} className="text-press-ink/28" />
              )}
              <span>{labelFor(key)}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
