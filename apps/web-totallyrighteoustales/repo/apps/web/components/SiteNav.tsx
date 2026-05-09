"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import ThemeToggle from "./ThemeToggle";

const navItems = [
  { href: "/", label: "Explore" },
  { href: "/compose", label: "Compose" },
  { href: "/leaderboard", label: "Hall of Wonder" },
  { href: "/profile", label: "Storyteller" },
] as const;

function isCurrentPath(pathname: string, href: string) {
  return href === "/"
    ? pathname === "/"
    : pathname === href || pathname.startsWith(`${href}/`);
}

export default function SiteNav() {
  const pathname = usePathname() || "/";

  return (
    <nav className="flex flex-wrap items-center gap-2.5 text-sm">
      {navItems.map((item) => {
        const active = isCurrentPath(pathname, item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={clsx(
              "inline-flex items-center rounded-full border px-4 py-2 text-[0.72rem] font-semibold uppercase tracking-[0.24em] transition duration-200 hover:-translate-y-0.5",
              active
                ? "border-gold/40 bg-gold text-ink shadow-soft"
                : "border-white/10 bg-white/5 text-parchment/72 hover:border-white/20 hover:text-parchment",
            )}
          >
            {item.label}
          </Link>
        );
      })}
      <Link
        href="/compose"
        className="button-primary px-5 py-2.5 text-[0.72rem] uppercase tracking-[0.22em]"
      >
        Tell a story
      </Link>
      <ThemeToggle />
    </nav>
  );
}
