"use client";

import { useState } from "react";
import { KeyRound, Mail } from "lucide-react";
import { supabase } from "../../lib/supabaseClient";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin + "/profile" },
    });

    if (error) {
      setError(error.message);
      return;
    }

    setSent(true);
  }

  return (
    <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[1.08fr_0.92fr]">
      <section className="press-hero p-6 sm:p-8">
        <p className="font-mono text-[0.7rem] font-bold uppercase tracking-[0.18em] text-press-gold">
          Studio key
        </p>
        <h1 className="mt-5 max-w-4xl font-display text-5xl leading-[0.94] text-press-paper sm:text-7xl">
          Open the press room with one quiet link.
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-8 text-press-paper/74">
          Sign in to save drafts, publish under a name or mask, heart stories,
          and build your storyteller cred without dragging real identity into
          the public room.
        </p>
        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          <div className="border border-white/12 bg-white/[0.06] p-4">
            <Mail className="text-press-gold" size={21} />
            <p className="mt-3 text-sm leading-7 text-press-paper/70">
              Email stays private; your public mark can be pseudonymous.
            </p>
          </div>
          <div className="border border-white/12 bg-white/[0.06] p-4">
            <KeyRound className="text-press-green" size={21} />
            <p className="mt-3 text-sm leading-7 text-press-paper/70">
              Magic links keep the account ceremony small and fast.
            </p>
          </div>
        </div>
      </section>

      <section className="press-panel p-6 sm:p-8 lg:self-center">
        <p className="press-label">Magic link sign-in</p>
        <h2 className="mt-3 font-display text-4xl text-press-ink dark:text-press-paper">
          Send the door key.
        </h2>
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <input
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@legendary.world"
            className="field-input mt-0"
          />
          <button type="submit" className="button-primary w-full">
            Send magic link
          </button>
          {sent && (
            <p className="border border-press-green/30 bg-press-green/10 px-4 py-3 text-sm leading-7 text-press-green">
              Check your email. The link brings you back to your story studio.
            </p>
          )}
          {error && (
            <p className="border border-press-copper/30 bg-press-copper/10 px-4 py-3 text-sm leading-7 text-press-copper">
              {error}
            </p>
          )}
        </form>
      </section>
    </div>
  );
}
