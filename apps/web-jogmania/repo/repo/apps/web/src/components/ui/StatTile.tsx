"use client";

import clsx from "clsx";
import { Card } from "@/components/ui/Card";

type StatTone = "cyan" | "magenta" | "acid" | "amber";

export function StatTile({
  title,
  value,
  hint,
  tone = "cyan"
}: {
  title: string;
  value: string;
  hint?: string;
  tone?: StatTone;
}) {
  const tones: Record<StatTone, string> = {
    cyan: "border-jm-cyan/35 text-jm-cyan",
    magenta: "border-jm-magenta/35 text-jm-magenta",
    acid: "border-jm-acid/35 text-jm-acid",
    amber: "border-jm-amber/35 text-jm-amber"
  };

  return (
    <Card className={clsx("p-5 border", tones[tone])}>
      <p className="jm-kicker">{title}</p>
      <h3 className="font-display text-2xl mt-3 text-jm-text">{value}</h3>
      {hint && <p className="text-xs text-jm-muted mt-2">{hint}</p>}
    </Card>
  );
}
