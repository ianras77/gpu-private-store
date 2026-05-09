import * as React from "react";
import { cn } from "@/lib/utils";

type BadgeProps = React.HTMLAttributes<HTMLSpanElement> & {
  variant?: "neutral" | "glow" | "ember";
};

const variants: Record<NonNullable<BadgeProps["variant"]>, string> = {
  neutral: "bg-ink-800 text-ink-200",
  glow: "bg-glow-500/20 text-glow-300 border border-glow-500/30",
  ember: "bg-ember-500/20 text-ember-300 border border-ember-500/30"
};

export function Badge({ className, variant = "neutral", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold",
        variants[variant],
        className
      )}
      {...props}
    />
  );
}
