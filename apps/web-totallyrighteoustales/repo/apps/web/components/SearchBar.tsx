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
      className="flex w-full flex-col gap-3 border border-press-ink/15 bg-white/50 p-2 shadow-soft dark:border-white/10 dark:bg-white/5 md:flex-row md:items-center"
    >
      <input
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Search by mood, object, setting, or impossible detail"
        className="min-h-11 w-full rounded-md bg-transparent px-3 py-2 text-base text-press-ink placeholder:text-press-ink/42 focus:outline-none dark:text-press-paper dark:placeholder:text-press-paper/42"
      />
      <button
        type="submit"
        className="button-primary w-full px-5 py-2.5 font-mono text-[0.68rem] uppercase tracking-[0.14em] md:w-auto"
      >
        Search
      </button>
    </form>
  );
}
