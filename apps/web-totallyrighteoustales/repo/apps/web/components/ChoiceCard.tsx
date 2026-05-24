"use client";

import clsx from "clsx";

const activeToneClasses = {
  moss: "border-press-green/70 bg-press-green/10 text-press-ink shadow-soft dark:text-press-paper",
  ember: "border-press-copper/70 bg-press-copper/10 text-press-ink shadow-soft dark:text-press-paper",
  sky: "border-press-blue/65 bg-press-blue/10 text-press-ink shadow-soft dark:text-press-paper",
  gold: "border-press-gold/70 bg-press-gold/16 text-press-ink shadow-soft dark:text-press-paper",
} as const;

type Tone = keyof typeof activeToneClasses;

export default function ChoiceCard({
  eyebrow,
  title,
  description,
  active,
  tone = "moss",
  disabled = false,
  onClick,
  className,
}: {
  eyebrow: string;
  title: string;
  description: string;
  active: boolean;
  tone?: Tone;
  disabled?: boolean;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={clsx(
        "w-full rounded-lg border-2 px-5 py-5 text-left transition duration-200 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60",
        active
          ? activeToneClasses[tone]
          : "border-press-ink/12 bg-white/70 text-press-ink/80 hover:border-press-ink/25 dark:border-white/10 dark:bg-white/5 dark:text-press-paper/80",
        className,
      )}
    >
      <p className="text-[0.68rem] font-mono font-bold uppercase tracking-[0.14em]">
        {eyebrow}
      </p>
      <p className="mt-3 font-display text-2xl leading-tight">{title}</p>
      <p className="mt-3 text-sm leading-7 text-current/80">{description}</p>
    </button>
  );
}
