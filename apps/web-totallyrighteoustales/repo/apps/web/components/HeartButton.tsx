"use client";

import { useState } from "react";
import { Heart } from "lucide-react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { supabase } from "../lib/supabaseClient";
import { toggleHeart } from "../lib/api";

export default function HeartButton({
  id,
  initialCount,
  compact = false,
}: {
  id: string;
  initialCount: number;
  compact?: boolean;
}) {
  const router = useRouter();
  const [count, setCount] = useState(initialCount);
  const [hearted, setHearted] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleHeart() {
    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;
    if (!token) {
      router.push("/login");
      return;
    }

    setLoading(true);

    try {
      const result = await toggleHeart({ id, token });
      setCount(result.upvotes);
      setHearted(result.hearted);
    } catch (_err) {
      // Keep the button quiet on transient failures.
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleHeart}
      disabled={loading}
      aria-pressed={hearted}
      className={clsx(
        "inline-flex items-center gap-2 rounded-lg border px-4 py-2.5 font-semibold transition disabled:cursor-not-allowed disabled:opacity-70",
        compact
          ? "text-xs uppercase tracking-[0.18em]"
          : "text-sm uppercase tracking-[0.18em]",
        hearted
          ? "border-press-copper/40 bg-press-copper text-white shadow-soft"
          : "border-press-ink/15 bg-white/45 text-press-ink/78 hover:border-press-copper/45 hover:text-press-copper dark:border-white/10 dark:bg-white/5 dark:text-press-paper/78",
      )}
      aria-label={hearted ? "Remove heart" : "Heart this story"}
    >
      <Heart
        size={compact ? 14 : 16}
        className={hearted ? "fill-current" : ""}
      />
      <span>{count}</span>
      {!compact && <span>Heart</span>}
    </button>
  );
}
