"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

export default function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("trt-theme");
    if (stored === "dark") {
      document.documentElement.classList.add("dark");
      setDark(true);
    }
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("trt-theme", next ? "dark" : "light");
  }

  return (
    <button
      onClick={toggle}
      className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-press-ink/15 bg-white/35 text-press-ink/72 transition hover:border-press-copper/45 hover:text-press-copper dark:border-white/10 dark:bg-white/5 dark:text-press-paper/72"
      aria-label="Toggle theme"
      type="button"
    >
      {dark ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}
