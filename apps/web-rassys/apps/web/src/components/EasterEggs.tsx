"use client";

import { RefreshCcw, Sparkles, WandSparkles, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { startTransition, useCallback, useEffect, useRef, useState } from "react";
import { Button } from "./ui/button";

type EasterEggPayload = {
  id?: string;
  badge: string;
  title: string;
  body: string;
  cta: string;
  hint?: string;
  href?: string;
  sigil?: string;
  source?: "cheshire" | "fallback";
  at?: string;
};

type EasterEggTrigger = "route" | "interval" | "manual" | "secret-word";

const TRAIL_STORAGE_KEY = "rassy-cat-signal-trail";
const MAX_TRAIL_ENTRIES = 6;

const fallbackCurios: EasterEggPayload[] = [
  {
    badge: "Cat Signal",
    title: "A fresh corner just blinked.",
    body: "Somewhere on the site, Mr Rassy is turning a practical surface into a delightful one.",
    cta: "Enter the booth",
    hint: "The loudest room is still the radio tower. Start there and listen for the next turn.",
    href: "/radio",
    sigil: "gold paw",
    source: "fallback",
  },
  {
    badge: "Notebook Heat",
    title: "A margin just woke up.",
    body: "The booth notebook is still the quickest way to catch the room while it is changing shape.",
    cta: "Read the live notebook",
    hint: "The note trail is strongest wherever the booth has bothered to remember itself.",
    href: "/radio#live-booth-notebook",
    sigil: "paper ember",
    source: "fallback",
  },
  {
    badge: "Shelf Murmur",
    title: "The quiet room is humming.",
    body: "Some records are better when the station stops talking and Ian's shelves get to speak for themselves.",
    cta: "Browse the shelves",
    hint: "The quieter shelf is where the records sit without the station wrapping around them.",
    href: "/listening-room",
    sigil: "sleeve glow",
    source: "fallback",
  },
];

const pickFallback = () => {
  const slot = Math.floor(Date.now() / (15 * 60 * 1000));
  return fallbackCurios[Math.abs(slot) % fallbackCurios.length];
};

const normalizePayload = (
  input?: Partial<EasterEggPayload> | null,
): EasterEggPayload => {
  const fallback = pickFallback();
  return {
    id:
      typeof input?.id === "string" && input.id
        ? input.id
        : `${fallback.badge}-${Date.now()}`,
    badge:
      typeof input?.badge === "string" && input.badge.trim()
        ? input.badge.trim()
        : fallback.badge,
    title:
      typeof input?.title === "string" && input.title.trim()
        ? input.title.trim()
        : fallback.title,
    body:
      typeof input?.body === "string" && input.body.trim()
        ? input.body.trim()
        : fallback.body,
    cta:
      typeof input?.cta === "string" && input.cta.trim()
        ? input.cta.trim()
        : fallback.cta,
    hint:
      typeof input?.hint === "string" && input.hint.trim()
        ? input.hint.trim()
        : fallback.hint,
    href:
      typeof input?.href === "string" && input.href.trim()
        ? input.href.trim()
        : fallback.href,
    sigil:
      typeof input?.sigil === "string" && input.sigil.trim()
        ? input.sigil.trim()
        : fallback.sigil,
    source: input?.source === "cheshire" ? "cheshire" : fallback.source,
    at: typeof input?.at === "string" && input.at ? input.at : undefined,
  };
};

const buildTrailFingerprint = (curio: EasterEggPayload) =>
  [curio.badge, curio.title, curio.href].filter(Boolean).join(" :: ").slice(0, 140);

const readTrail = () => {
  if (typeof window === "undefined") return [] as string[];

  try {
    const raw = window.localStorage.getItem(TRAIL_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      .slice(-MAX_TRAIL_ENTRIES);
  } catch {
    return [];
  }
};

const rememberTrail = (curio: EasterEggPayload) => {
  if (typeof window === "undefined") return;
  const fingerprint = buildTrailFingerprint(curio);
  if (!fingerprint) return;

  const current = readTrail().filter((item) => item !== fingerprint);
  const next = [...current, fingerprint].slice(-MAX_TRAIL_ENTRIES);
  window.localStorage.setItem(TRAIL_STORAGE_KEY, JSON.stringify(next));
};

export function EasterEggs() {
  const pathname = usePathname();
  const hidden = pathname.startsWith("/radio/app");
  const [curio, setCurio] = useState<EasterEggPayload>(() => normalizePayload());
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fresh, setFresh] = useState(false);
  const loadingRef = useRef(false);
  const sequenceRef = useRef<string[]>([]);

  const fetchCurio = useCallback(
    async (
      forceOpen = false,
      trigger: EasterEggTrigger = "route",
    ) => {
      if (hidden || loadingRef.current) return;
      loadingRef.current = true;
      setLoading(true);

      try {
        const params = new URLSearchParams();
        params.set("path", pathname || "/");
        params.set("trigger", trigger);
        for (const item of readTrail()) {
          params.append("trail", item);
        }

        const response = await fetch(`/api/easter-eggs?${params.toString()}`, {
          cache: "no-store",
        });
        const payload = response.ok
          ? ((await response.json()) as EasterEggPayload)
          : null;
        const normalized = normalizePayload(payload);
        rememberTrail(normalized);

        startTransition(() => {
          setCurio(normalized);
          setFresh(true);
          if (forceOpen) setOpen(true);
        });
      } catch {
        const fallback = normalizePayload();
        rememberTrail(fallback);

        startTransition(() => {
          setCurio(fallback);
          setFresh(true);
          if (forceOpen) setOpen(true);
        });
      } finally {
        loadingRef.current = false;
        setLoading(false);
      }
    },
    [hidden, pathname],
  );

  useEffect(() => {
    if (hidden) return;
    void fetchCurio(false, "route");
  }, [fetchCurio, hidden]);

  useEffect(() => {
    if (hidden) return;

    const intervalId = window.setInterval(
      () => {
        void fetchCurio(false, "interval");
      },
      10 * 60 * 1000,
    );

    return () => {
      window.clearInterval(intervalId);
    };
  }, [fetchCurio, hidden]);

  useEffect(() => {
    if (!fresh) return;
    const timeoutId = window.setTimeout(() => {
      setFresh(false);
    }, 4500);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [fresh]);

  useEffect(() => {
    if (hidden) return;

    const handler = (event: KeyboardEvent) => {
      sequenceRef.current.push(event.key.toLowerCase());
      if (sequenceRef.current.length > 5) sequenceRef.current.shift();
      const signal = sequenceRef.current.join("");
      if (signal.endsWith("cat") || signal.endsWith("rassy")) {
        void fetchCurio(true, "secret-word");
      }
    };

    window.addEventListener("keydown", handler);
    return () => {
      window.removeEventListener("keydown", handler);
    };
  }, [fetchCurio, hidden]);

  if (hidden) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed bottom-4 left-4 right-4 z-50 flex w-[calc(100vw-2rem)] max-w-[320px] flex-col items-start gap-3 sm:bottom-6 sm:left-6 sm:right-auto">
      <button
        type="button"
        className="pointer-events-auto group relative inline-flex items-center gap-3 rounded-full border border-white/12 bg-[linear-gradient(145deg,rgba(9,14,29,0.94),rgba(41,10,47,0.88))] px-3 py-3 text-left shadow-[0_18px_40px_rgba(0,0,0,0.3)] backdrop-blur-xl transition duration-300 hover:-translate-y-0.5 hover:border-white/20"
        onClick={() => {
          setOpen((current) => !current);
          setFresh(false);
        }}
      >
        <span className="relative flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-black/25 text-glow">
          <Sparkles size={16} />
          {fresh && (
            <span className="glow-dot absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full" />
          )}
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="text-[10px] uppercase tracking-[0.3em] text-cloud/55">
            Cat Signal
          </span>
          <span className="truncate text-sm font-semibold text-white group-hover:text-glow">
            {curio.badge}
          </span>
          <span className="text-[10px] uppercase tracking-[0.22em] text-cloud/45">
            {curio.sigil || "site whisper"}
          </span>
        </span>
      </button>

      {open && (
        <div className="pointer-events-auto relative overflow-hidden rounded-[28px] border border-white/12 bg-[radial-gradient(circle_at_top_left,rgba(255,230,109,0.14),transparent_34%),radial-gradient(circle_at_85%_18%,rgba(66,245,255,0.16),transparent_32%),linear-gradient(150deg,rgba(9,14,30,0.95),rgba(39,9,44,0.88))] p-5 shadow-[0_24px_70px_rgba(0,0,0,0.35)]">
          <div
            className="absolute inset-0 noise opacity-35"
            aria-hidden="true"
          />
          <div className="relative">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.32em] text-cloud/55">
                  <span>{curio.badge}</span>
                  <span className="rounded-full border border-white/10 bg-black/20 px-2 py-1 tracking-[0.2em] text-cloud/45">
                    {curio.source === "cheshire" ? "Mr Rassy live" : "Site whisper"}
                  </span>
                </div>
                <div className="mt-3 text-xl font-semibold text-white">
                  {curio.title}
                </div>
              </div>
              <button
                type="button"
                className="rounded-full border border-white/10 bg-black/20 p-2 text-cloud/65 transition hover:border-white/20 hover:text-white"
                onClick={() => setOpen(false)}
                aria-label="Dismiss cat signal"
              >
                <X size={14} />
              </button>
            </div>

            <p className="mt-3 text-sm leading-7 text-cloud/82">{curio.body}</p>

            <div className="mt-4 rounded-[22px] border border-white/10 bg-black/20 p-4">
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.28em] text-cloud/55">
                <WandSparkles size={13} className="text-glow" />
                Signal Trail
              </div>
              <p className="mt-3 text-sm leading-6 text-cloud/80">
                {curio.hint}
              </p>
              <div className="mt-3 text-[10px] uppercase tracking-[0.22em] text-cloud/45">
                Sigil: <span className="text-cloud/72">{curio.sigil}</span>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              {curio.href ? (
                <Button asChild>
                  <a href={curio.href}>{curio.cta}</a>
                </Button>
              ) : (
                <div className="text-[11px] uppercase tracking-[0.24em] text-cloud/58">
                  {curio.cta}
                </div>
              )}
              <Button
                variant="ghost"
                className="px-3 py-2 text-xs"
                onClick={() => void fetchCurio(true, "manual")}
                disabled={loading}
              >
                <RefreshCcw size={14} />
                {loading ? "Thinking" : "New whisper"}
              </Button>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-[10px] uppercase tracking-[0.22em] text-cloud/45">
              <div>
                Type <span className="text-cloud/70">cat</span> or{" "}
                <span className="text-cloud/70">rassy</span> to pull a fresh
                live whisper.
              </div>
              <div>{curio.at ? new Date(curio.at).toLocaleTimeString() : ""}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
