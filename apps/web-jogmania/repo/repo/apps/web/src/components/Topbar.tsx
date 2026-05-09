"use client";

import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/Button";

export function Topbar() {
  const { user, logout } = useAuth();
  return (
    <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-jm-panel/50 backdrop-blur">
      <div>
        <p className="jm-kicker">Dashboard</p>
        <h2 className="font-display text-xl">Adventure Control</h2>
      </div>
      <div className="flex items-center gap-4">
        <div className="hidden md:flex items-center gap-2 text-xs text-jm-muted">
          <span className="jm-led cyan" />
          <span>System online</span>
        </div>
        {user && <span className="text-xs text-jm-muted hidden md:inline">{user.email}</span>}
        <Button variant="outline" size="sm" onClick={logout}>
          Sign Out
        </Button>
      </div>
    </div>
  );
}
