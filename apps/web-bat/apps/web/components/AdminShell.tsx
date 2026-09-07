"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode } from "react";

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const navItems = [
    { href: "/admin", label: "Mission" },
    { href: "/admin/inbox", label: "Inbox" },
    { href: "/admin/research", label: "Research" },
    { href: "/admin/reports", label: "Reports" },
    { href: "/admin/analysis", label: "Analysis" },
    { href: "/admin/trends", label: "Trends" },
    { href: "/admin/themes", label: "Themes" },
    { href: "/admin/voice-memory", label: "Memory" },
    { href: "/admin/layout", label: "Layout" },
    { href: "/admin/social", label: "Social" },
    { href: "/admin/settings", label: "Settings" },
  ];

  const logout = async () => {
    await fetch("/api/admin-auth/logout", { method: "POST" });
    window.location.href = "/admin-login";
  };

  return (
    <div className="admin-layout">
      <aside className="admin-nav">
        <div className="brand-lockup admin-brand">
          <div className="brand-seal" aria-hidden="true">
            <span>BAT</span>
          </div>
          <div className="brand-copy">
            <p className="admin-kicker">Control Room</p>
            <h2>Editorial Mission Control</h2>
          </div>
        </div>
        <p className="admin-copy">
          Run the newsroom, steer the voice, and let strong links earn their way onto the front page.
        </p>
        <div className="admin-nav-group">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link key={item.href} href={item.href} className={isActive ? "active" : undefined}>
                {item.label}
              </Link>
            );
          })}
        </div>
        <div className="admin-shell-footer">
          <Link href="/" className="admin-home-link">
            View front page
          </Link>
          <button type="button" className="admin-logout" onClick={logout}>
            Log out
          </button>
        </div>
      </aside>
      <main className="admin-main">{children}</main>
    </div>
  );
}
