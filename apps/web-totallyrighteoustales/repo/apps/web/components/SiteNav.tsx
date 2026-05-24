"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { BookOpenText, Feather, Trophy, UserRound } from "lucide-react";
import ThemeToggle from "./ThemeToggle";

const navItems = [
  { href: "/", label: "Read", icon: BookOpenText },
  { href: "/compose", label: "Set Type", icon: Feather },
  { href: "/leaderboard", label: "Hall", icon: Trophy },
  { href: "/profile", label: "Studio", icon: UserRound },
] as const;

function isCurrentPath(pathname: string, href: string) {
  return href === "/"
    ? pathname === "/"
    : pathname === href || pathname.startsWith(`${href}/`);
}

export default function SiteNav() {
  const pathname = usePathname() || "/";

  return (
    <nav className="flex flex-wrap items-center gap-2 text-sm">
      {navItems.map((item) => {
        const active = isCurrentPath(pathname, item.href);
        const Icon = item.icon;

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={clsx(
              "inline-flex min-h-11 items-center gap-2 rounded-lg border px-3 py-2 font-mono text-[0.68rem] font-bold uppercase tracking-[0.12em] transition duration-200 hover:-translate-y-0.5",
              active
                ? "border-press-copper bg-press-copper text-white shadow-soft"
                : "border-press-ink/15 bg-white/35 text-press-ink/72 hover:border-press-copper/45 dark:border-white/10 dark:bg-white/5 dark:text-press-paper/72",
            )}
          >
            <Icon size={15} />
            {item.label}
          </Link>
        );
      })}
      <ThemeToggle />
    </nav>
  );
}
