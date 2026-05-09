"use client";

import { ArrowUpRight, Pause, Play } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { usePersistentRadioPlayer } from "./PersistentRadioPlayerProvider";
import { Button } from "./ui/button";

const primaryLinks = [
  { href: "/radio", label: "Radio" },
  { href: "/listening-room", label: "Room" },
  { href: "/radio/notes", label: "Notes" },
  { href: "/photos", label: "Photos" },
  { href: "/dungeon-master", label: "DM" },
  { href: "/thoughts", label: "Thoughts" },
  { href: "/real-life-bedtime-stories", label: "Stories" },
] as const;

export function SiteHeader() {
  const pathname = usePathname();
  const { hasInteracted, playStatus, playing, buffering, toggle } =
    usePersistentRadioPlayer();

  if (pathname.startsWith("/radio/app")) {
    return null;
  }

  const isActiveLink = (href: string) => {
    if (href.startsWith("/#")) {
      return pathname === "/";
    }
    if (href === "/") {
      return pathname === "/";
    }
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  const showRadioControl = hasInteracted || playStatus !== "idle";
  const radioLabel = playing
    ? "Pause radio"
    : buffering || playStatus === "loading"
      ? "Catching live"
      : "Resume radio";

  return (
    <header className="sticky top-0 z-50">
      <div className="relative overflow-hidden border-b border-white/8 bg-[#05010d]/72 shadow-[0_14px_36px_rgba(0,0,0,0.22)] backdrop-blur-2xl">
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_0%,rgba(255,230,109,0.14),transparent_26%),radial-gradient(circle_at_82%_12%,rgba(66,245,255,0.12),transparent_28%),linear-gradient(90deg,rgba(255,79,216,0.06),transparent_32%,transparent_68%,rgba(66,245,255,0.06))]"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-white/16 to-transparent"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute left-1/2 top-0 h-px w-[38rem] max-w-[72vw] -translate-x-1/2 bg-gradient-to-r from-transparent via-white/20 to-transparent"
          aria-hidden="true"
        />

        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
          <div className="flex min-h-[52px] items-center gap-3 py-1.5 sm:min-h-[56px]">
          <Link
            href="/"
            className="group relative flex min-w-0 items-center gap-2.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-white shadow-[0_10px_24px_rgba(0,0,0,0.16)] transition hover:border-white/16 hover:bg-white/[0.06]"
          >
            <span className="glow-dot h-2.5 w-2.5 rounded-full" />
            <span className="text-sm font-semibold tracking-[0.04em] text-white sm:text-[15px]">
              Rassy
            </span>
            <span className="hidden text-[8px] uppercase tracking-[0.34em] text-cloud/46 sm:inline">
              home signal
            </span>
          </Link>

            <div className="hidden min-w-0 flex-1 justify-center md:flex">
              <nav
                aria-label="Primary"
                className="flex min-w-0 items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-1.5 py-1 shadow-[0_14px_34px_rgba(0,0,0,0.16)]"
              >
                {primaryLinks.map((link) => (
                  <Link
                    key={link.href}
                    className={`rounded-full px-3 py-1.5 text-[10px] uppercase tracking-[0.22em] transition ${
                      isActiveLink(link.href)
                        ? "bg-[linear-gradient(135deg,rgba(255,255,255,0.12),rgba(255,79,216,0.12))] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08),0_8px_18px_rgba(0,0,0,0.16)]"
                        : "text-cloud/62 hover:bg-white/[0.05] hover:text-white"
                    }`}
                    href={link.href}
                    title={link.label}
                  >
                    {link.label}
                  </Link>
                ))}
              </nav>
            </div>

            <div className="ml-auto flex items-center gap-2">
              <a
                href="https://rasies.com"
                target="_blank"
                rel="noreferrer"
                className="hidden items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[9px] uppercase tracking-[0.2em] text-cloud/64 transition hover:border-white/16 hover:text-white lg:inline-flex"
              >
                Rasies
                <ArrowUpRight size={12} />
              </a>

              {showRadioControl && (
                <Button
                  variant="secondary"
                  className="h-8 gap-2 rounded-full border border-white/10 bg-white/[0.05] px-2.5 text-[10px] uppercase tracking-[0.2em] text-white shadow-[0_12px_28px_rgba(0,0,0,0.16)] hover:bg-white/[0.08] sm:px-3"
                  onClick={() => void toggle()}
                  disabled={playStatus === "loading"}
                >
                  <span
                    className={`h-2 w-2 rounded-full ${
                      playing
                        ? "bg-glow shadow-[0_0_16px_rgba(255,230,109,0.9)]"
                        : "bg-cloud/40"
                    }`}
                  />
                  {playing ? <Pause size={14} /> : <Play size={14} />}
                  <span className="hidden sm:inline">{radioLabel}</span>
                </Button>
              )}
            </div>
          </div>

          <div className="pb-2 md:hidden">
            <nav
              aria-label="Quick links"
              className="flex gap-1 overflow-x-auto rounded-full border border-white/10 bg-white/[0.04] px-1.5 py-1 text-[9px] uppercase tracking-[0.2em] text-cloud/64 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {primaryLinks.map((link) => (
                <Link
                  key={link.href}
                  className={`shrink-0 rounded-full px-3 py-1.5 transition ${
                    isActiveLink(link.href)
                      ? "bg-[linear-gradient(135deg,rgba(255,255,255,0.12),rgba(255,79,216,0.12))] text-white"
                      : "text-cloud/64 hover:bg-white/[0.05] hover:text-white"
                  }`}
                  href={link.href}
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>
        </div>
      </div>
    </header>
  );
}
