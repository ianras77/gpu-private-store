"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/Card";
import { buttonStyles } from "@/components/ui/buttonStyles";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="p-10 text-jm-muted">Loading...</div>;
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6 py-16 jm-hero">
        <Card className="p-8 w-full max-w-md text-center">
          <p className="jm-kicker">Access</p>
          <h2 className="font-display text-2xl mt-2">Sign in required</h2>
          <p className="text-jm-muted mt-2">You need to sign in to access the dashboard.</p>
          <Link href="/login" className={`inline-flex mt-6 ${buttonStyles("primary", "md")}`}>
            Go to login
          </Link>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}
