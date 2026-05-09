import clsx from "clsx";

type ButtonVariant = "primary" | "secondary" | "outline" | "ghost";
type ButtonSize = "sm" | "md" | "lg";

export const buttonStyles = (variant: ButtonVariant = "primary", size: ButtonSize = "md") =>
  clsx(
    "relative isolate inline-flex items-center justify-center rounded-full font-semibold transition-all duration-200 overflow-hidden",
    "before:content-[''] before:absolute before:inset-0 before:rounded-full before:bg-white/15 before:opacity-0 hover:before:opacity-100",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-jm-cyan/70 focus-visible:ring-offset-2 focus-visible:ring-offset-jm-bg",
    size === "sm" && "px-4 py-2 text-xs tracking-[0.2em] uppercase",
    size === "md" && "px-6 py-3 text-sm tracking-[0.18em] uppercase",
    size === "lg" && "px-8 py-4 text-sm tracking-[0.2em] uppercase",
    variant === "primary" &&
      "bg-gradient-to-r from-jm-cyan via-jm-acid to-jm-cyan text-jm-ink shadow-neon hover:-translate-y-0.5",
    variant === "secondary" &&
      "bg-gradient-to-r from-jm-magenta via-jm-amber to-jm-magenta text-jm-ink shadow-magenta hover:-translate-y-0.5",
    variant === "outline" &&
      "border border-jm-cyan/40 text-jm-cyan bg-white/5 hover:bg-jm-cyan/10 hover:-translate-y-0.5",
    variant === "ghost" && "text-jm-muted hover:text-jm-text hover:bg-white/5"
  );
