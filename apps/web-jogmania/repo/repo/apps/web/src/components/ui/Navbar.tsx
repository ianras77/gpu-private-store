"use client";

import Link from "next/link";
import clsx from "clsx";
import type { ReactNode } from "react";

type NavItem = { href: string; label: string };

export function Navbar({
  items,
  cta,
  variant = "dark"
}: {
  items: NavItem[];
  cta?: ReactNode;
  variant?: "dark" | "glass";
}) {
  return (
    <header
      className={clsx(
        "sticky top-0 z-40 flex items-center justify-between px-6 md:px-10 py-5 border-b border-white/5",
        variant === "glass" ? "bg-jm-panel/70 backdrop-blur" : "bg-transparent"
      )}
    >
      <Link href="/" className="flex items-center gap-3">
        <div className="relative h-10 w-10 rounded-full bg-gradient-to-br from-jm-cyan via-jm-magenta to-jm-acid shadow-neon">
          <div className="absolute inset-1 rounded-full bg-jm-ink/70" />
        </div>
        <div>
          <p className="text-[0.6rem] uppercase tracking-[0.4em] text-jm-muted">Jogmania</p>
          <p className="font-display text-lg text-jm-text">Runner Console</p>
        </div>
      </Link>
      <nav className="hidden md:flex items-center gap-6 text-[0.7rem] uppercase tracking-[0.3em] text-jm-muted">
        {items.map((item) => (
          <Link key={item.href} href={item.href} className="hover:text-jm-text">
            {item.label}
          </Link>
        ))}
      </nav>
      <div className="flex items-center gap-3">
        <div className="hidden md:flex items-center gap-2">
          <span className="jm-led cyan" />
          <span className="jm-led magenta" />
          <span className="jm-led acid" />
        </div>
        {cta}
      </div>
    </header>
  );
}
