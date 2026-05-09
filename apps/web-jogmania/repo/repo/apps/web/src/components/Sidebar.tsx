"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { Badge } from "@/components/ui/Badge";

const links = [
  { href: "/overview", label: "Overview" },
  { href: "/runs", label: "Runs" },
  { href: "/routes", label: "Courses" },
  { href: "/parties", label: "Parties" },
  { href: "/rewards", label: "Rewards" },
  { href: "/settings", label: "Settings" }
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden lg:flex flex-col gap-6 w-72 p-6 bg-jm-panel/85 border-r border-white/5 backdrop-blur">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="jm-kicker">Jogmania</p>
            <h1 className="font-display text-2xl">Runner Console</h1>
          </div>
          <div className="flex items-center gap-2">
            <span className="jm-led cyan" />
            <span className="jm-led magenta" />
            <span className="jm-led acid" />
          </div>
        </div>
        <Badge tone="cyan">Arcade Ready</Badge>
      </div>
      <nav className="flex flex-col gap-2">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={clsx(
              "px-4 py-2 rounded-full text-xs uppercase tracking-[0.3em] transition",
              pathname.startsWith(link.href)
                ? "bg-jm-cyan/15 text-jm-cyan shadow-neon"
                : "text-jm-muted hover:text-jm-text hover:bg-white/5"
            )}
          >
            {link.label}
          </Link>
        ))}
      </nav>
      <div className="mt-auto text-xs text-jm-muted jm-ledge px-4 py-3 rounded-xl">
        Neon clarity. Zero noise.
      </div>
    </aside>
  );
}
