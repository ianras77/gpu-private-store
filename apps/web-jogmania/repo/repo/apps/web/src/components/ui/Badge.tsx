"use client";

import clsx from "clsx";
import type { HTMLAttributes } from "react";

type BadgeTone = "cyan" | "magenta" | "acid" | "slate";

export function Badge({
  tone = "cyan",
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  const tones = {
    cyan: "bg-jm-cyan/15 text-jm-cyan border border-jm-cyan/40 shadow-neon",
    magenta: "bg-jm-magenta/15 text-jm-magenta border border-jm-magenta/40 shadow-magenta",
    acid: "bg-jm-acid/15 text-jm-acid border border-jm-acid/40 shadow-glow",
    slate: "bg-white/5 text-jm-muted border border-white/10"
  };

  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full px-3 py-1 text-[0.65rem] uppercase tracking-[0.22em]",
        tones[tone],
        className
      )}
      {...props}
    />
  );
}
