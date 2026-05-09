"use client";

import { useState } from "react";
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
      options: {
        emailRedirectTo: window.location.origin + "/profile",
      },
    });

    if (error) {
      setError(error.message);
      return;
    }

    setSent(true);
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <section className="ink-panel relative overflow-hidden rounded-[3rem] px-8 py-10 md:px-10 md:py-12">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-[radial-gradient(circle_at_top,_rgba(244,201,93,0.34),_transparent_68%)]" />
        <div className="pointer-events-none absolute -left-16 bottom-0 h-64 w-64 rounded-full bg-ember/20 blur-3xl" />
        <div className="pointer-events-none absolute -right-12 top-14 h-56 w-56 rounded-full bg-sky/15 blur-3xl" />

        <div className="relative grid gap-8 xl:grid-cols-[1.1fr_0.9fr]">
          <div>
            <p className="text-xs uppercase tracking-[0.42em] text-parchment/55">
              Create account
            </p>
            <h1 className="mt-4 max-w-4xl font-display text-5xl leading-[0.95] text-parchment md:text-7xl">
              Become a storyteller with one magic link.
            </h1>
            <p className="mt-5 max-w-3xl text-lg leading-8 text-parchment/78">
              Get into the room first. Then add a name, a face, and the kind of
              short bio that tells people what sort of wonder you bring with
              you.
            </p>
            <div className="mt-7 flex flex-wrap gap-2 text-[0.68rem] uppercase tracking-[0.22em] text-parchment/72">
              <span className="rounded-full border border-parchment/20 bg-white/5 px-4 py-2">
                Magic link only
              </span>
              <span className="rounded-full border border-parchment/20 bg-white/5 px-4 py-2">
                Named or anonymous stories
              </span>
              <span className="rounded-full border border-parchment/20 bg-white/5 px-4 py-2">
                Public hearts, real cred
              </span>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3 xl:grid-cols-1">
            <div className="rounded-[2rem] border border-parchment/15 bg-white/10 p-6 backdrop-blur-sm">
              <p className="text-xs uppercase tracking-[0.28em] text-parchment/52">
                Step 1
              </p>
              <p className="mt-3 font-display text-3xl text-parchment">
                Drop in your email.
              </p>
            </div>
            <div className="rounded-[2rem] border border-gold/20 bg-gold/10 p-6">
              <p className="text-xs uppercase tracking-[0.28em] text-gold/80">
                Step 2
              </p>
              <p className="mt-3 text-sm leading-7 text-parchment/76">
                Open the link and land straight in your storyteller profile.
              </p>
            </div>
            <div className="rounded-[2rem] border border-sky/20 bg-sky/10 p-6 sm:col-span-3 xl:col-span-1">
              <p className="text-xs uppercase tracking-[0.28em] text-sky/90">
                Step 3
              </p>
              <p className="mt-3 text-sm leading-7 text-parchment/76">
                Add your public storyteller identity, then publish stories under
                your name or behind a mask.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="card rounded-[2.8rem] p-8 md:p-10">
        <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <p className="eyebrow">Magic link sign-in</p>
            <h2 className="mt-3 font-display text-4xl text-ink dark:text-parchment">
              We’ll send the door key to your inbox.
            </h2>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-ink/72 dark:text-parchment/72">
              This keeps account creation fast and quiet. No password ceremony.
              Just the link, your profile, and then the stories.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@legendary.world"
              className="field-input mt-0"
            />
            <button
              type="submit"
              className="button-primary w-full justify-center"
            >
              Send my magic link
            </button>
            {sent && (
              <p className="rounded-[1.6rem] border border-moss/20 bg-moss/10 px-4 py-3 text-sm leading-7 text-moss dark:text-sky">
                Check your email. The link will bring you straight to your
                storyteller profile.
              </p>
            )}
            {error && (
              <p className="rounded-[1.6rem] border border-ember/20 bg-ember/10 px-4 py-3 text-sm leading-7 text-ember">
                {error}
              </p>
            )}
          </form>
        </div>
      </section>
    </div>
  );
}
