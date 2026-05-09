"use client";

import clsx from "clsx";

const activeToneClasses = {
  moss: "border-moss/70 bg-moss/10 text-ink shadow-soft dark:text-parchment",
  ember: "border-ember/70 bg-ember/10 text-ink shadow-soft dark:text-parchment",
  sky: "border-sky/65 bg-sky/12 text-ink shadow-soft dark:text-parchment",
  gold: "border-gold/70 bg-gold/18 text-ink shadow-soft dark:text-parchment",
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
        "w-full rounded-[1.75rem] border-2 px-5 py-5 text-left transition duration-200 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60",
        active
          ? activeToneClasses[tone]
          : "border-ink/12 bg-white/70 text-ink/80 hover:border-ink/25 dark:border-parchment/12 dark:bg-white/5 dark:text-parchment/80",
        className,
      )}
    >
      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.24em]">
        {eyebrow}
      </p>
      <p className="mt-3 font-display text-2xl leading-tight">{title}</p>
      <p className="mt-3 text-sm leading-7 text-current/80">{description}</p>
    </button>
  );
}
