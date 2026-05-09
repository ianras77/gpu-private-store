"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

const links = [
  { href: "/overview", label: "Overview" },
  { href: "/runs", label: "Runs" },
  { href: "/routes", label: "Courses" },
  { href: "/parties", label: "Parties" },
  { href: "/rewards", label: "Rewards" },
  { href: "/settings", label: "Settings" }
];

export function MobileNav() {
  const pathname = usePathname();

  return (
    <nav className="flex lg:hidden gap-2 px-6 py-3 overflow-x-auto border-b border-white/5 bg-jm-panel/50 backdrop-blur">
      {links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className={clsx(
            "px-3 py-2 rounded-full text-[0.6rem] uppercase tracking-[0.3em] whitespace-nowrap",
            pathname.startsWith(link.href)
              ? "bg-jm-cyan/15 text-jm-cyan"
              : "text-jm-muted bg-jm-surface/60"
          )}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
