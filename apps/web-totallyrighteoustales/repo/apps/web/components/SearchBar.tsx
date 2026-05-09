"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function SearchBar({ initialQuery }: { initialQuery?: string }) {
  const router = useRouter();
  const [value, setValue] = useState(initialQuery ?? "");

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) {
      router.push("/");
      return;
    }
    router.push(`/?q=${encodeURIComponent(trimmed)}`);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="story-arch flex w-full max-w-2xl flex-col gap-3 rounded-[2rem] border border-ink/12 bg-cream/92 p-3 shadow-soft dark:border-white/10 dark:bg-white/5 md:flex-row md:items-center"
    >
      <input
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Search by moonlight, mood, forest, spell, or impossible detail..."
        className="w-full rounded-[1.35rem] bg-transparent px-4 py-3 text-base text-ink placeholder:text-ink/42 focus:outline-none dark:text-parchment dark:placeholder:text-parchment/42"
      />
      <button
        type="submit"
        className="button-primary w-full px-5 py-3 text-[0.68rem] uppercase tracking-[0.22em] md:w-auto"
      >
        Search tales
      </button>
    </form>
  );
}
