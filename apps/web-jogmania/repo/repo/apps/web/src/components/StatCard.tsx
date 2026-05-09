import clsx from "clsx";
import { Card } from "@/components/ui/Card";

export function StatCard({
  title,
  value,
  hint,
  accent = "cyan"
}: {
  title: string;
  value: string;
  hint?: string;
  accent?: "cyan" | "pink" | "green" | "yellow";
}) {
  const accents = {
    cyan: "border-jm-cyan/40 text-jm-cyan",
    pink: "border-jm-magenta/40 text-jm-magenta",
    green: "border-jm-acid/40 text-jm-acid",
    yellow: "border-jm-amber/40 text-jm-amber"
  };

  return (
    <Card className={clsx("p-5 border", accents[accent])}>
      <p className="text-xs uppercase tracking-[0.3em] text-jm-muted">{title}</p>
      <h3 className="font-display text-2xl mt-2">{value}</h3>
      {hint && <p className="text-xs text-jm-muted mt-2">{hint}</p>}
    </Card>
  );
}
