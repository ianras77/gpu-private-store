"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function SignInForm() {
  const router = useRouter();
  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setBusy(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });

      if (!res.ok) {
        const text = await res.text();
        let message = text || "Unable to sign in";
        try {
          const parsed = JSON.parse(text) as { error?: string };
          if (parsed.error) {
            message = parsed.error;
          }
        } catch {
          // Keep raw response text when it is not JSON.
        }
        throw new Error(message);
      }

      router.push("/playground");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to sign in");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Input
        placeholder="Creator / parent username"
        value={username}
        onChange={(event) => setUsername(event.target.value)}
        autoComplete="username"
        required
      />
      <Input
        placeholder="Password"
        type="password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        autoComplete="current-password"
        required
      />

      {error ? (
        <div className="rounded-xl border border-ember-500/40 bg-ember-500/10 px-4 py-3 text-sm text-ember-300">
          {error}
        </div>
      ) : null}

      <Button variant="glow" size="lg" type="submit" disabled={busy} className="w-full">
        {busy ? "Entering studio..." : "Enter the studio"}
      </Button>

      <div className="rounded-xl border border-ink-800 bg-ink-950/60 px-3 py-2 text-xs text-ink-300">
        Current auth flow: Cheshire Cat `auth/token` -&gt; signed app session -&gt; Launchpad studio.
      </div>

      <div className="flex items-center justify-between text-xs text-ink-400">
        <span>Need to review surfaces first?</span>
        <Link href="/" className="text-ink-200 underline-offset-4 hover:underline">
          Back to landing
        </Link>
      </div>
    </form>
  );
}
