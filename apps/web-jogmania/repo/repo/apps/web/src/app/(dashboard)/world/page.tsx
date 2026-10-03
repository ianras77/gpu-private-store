"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/useApi";
import ArcadeWorldScene from "@/components/ArcadeWorldScene";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import type { AdventureWorld, ArcadeDecoration, ArcadeDecorationChoice, WorldDecorationSlot } from "@jogmania/api-client";

const slotLabels: Record<WorldDecorationSlot, string> = {
  "roof-left": "Left roof",
  "roof-center": "Marquee",
  "roof-right": "Right roof",
  "window-left": "Left window",
  "window-right": "Prize window",
  "garden-left": "Garden gate",
  "garden-center": "Moon garden",
  "garden-right": "Mouse corner",
};

export default function ArcadeWorkshopPage() {
  const { user } = useAuth();
  const api = useApi();
  const [world, setWorld] = useState<AdventureWorld | null>(null);
  const [selectedItem, setSelectedItem] = useState<ArcadeDecorationChoice["key"]>("lantern-arch");
  const [busySlot, setBusySlot] = useState<WorldDecorationSlot | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const next = await api.getAdventureWorld();
    setWorld(next);
    if (next.decoration_catalog?.length && !next.decoration_catalog.some((item) => item.key === selectedItem)) {
      setSelectedItem(next.decoration_catalog[0].key);
    }
  }, [api, selectedItem]);

  useEffect(() => {
    if (!user) return;
    refresh().catch((cause) => setError(cause instanceof Error ? cause.message : "The arcade is taking a little nap."));
  }, [refresh, user]);

  const place = async (slot: WorldDecorationSlot) => {
    setBusySlot(slot);
    setError(null);
    try {
      await api.placeWorldDecoration(slot, selectedItem);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That keepsake stayed in your pocket.");
    } finally {
      setBusySlot(null);
    }
  };

  const remove = async (slot: WorldDecorationSlot) => {
    setBusySlot(slot);
    setError(null);
    try {
      await api.removeWorldDecoration(slot);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That keepsake would not budge.");
    } finally {
      setBusySlot(null);
    }
  };

  const decorations = world?.decorations ?? [];
  const slots = world?.decoration_slots ?? [];
  const catalog = world?.decoration_catalog ?? [];
  const tokens = world?.decoration_tokens ?? 0;

  return (
    <div className="space-y-6">
      <Card className="jm-holo overflow-hidden p-5 md:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="jm-kicker">The little arcade workshop</p>
            <h2 className="mt-2 font-display text-3xl">Make it yours</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-jm-muted">Spend decoration tickets you earned on real adventures. Try a look, move it later, and keep every run bright. Nothing expires.</p>
          </div>
          <Badge tone="acid">{tokens} {tokens === 1 ? "decoration ticket" : "decoration tickets"}</Badge>
        </div>
        <div className="mt-5 overflow-hidden rounded-2xl">
          <ArcadeWorldScene chapter={world?.chapter ?? "Marquee Mystery"} lights={world?.arcade?.chapter_lights ?? []} decorations={decorations} />
        </div>
        {error ? <p role="alert" className="mt-3 text-sm text-rose-300">{error}</p> : null}
      </Card>

      <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
        <Card className="p-5">
          <p className="jm-kicker">Pick a pocket-sized prop</p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
            {catalog.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setSelectedItem(item.key)}
                aria-pressed={selectedItem === item.key}
                className={`flex items-center gap-3 rounded-2xl border p-3 text-left transition ${selectedItem === item.key ? "border-jm-cyan/60 bg-jm-cyan/10" : "border-white/10 bg-black/20 hover:bg-white/5"}`}
              >
                <span aria-hidden="true" className="grid h-11 w-11 place-items-center rounded-xl bg-white/5 text-2xl">{item.icon}</span>
                <span className="text-sm text-jm-text">{item.title}</span>
              </button>
            ))}
          </div>
          {tokens === 0 ? <p className="mt-4 text-xs leading-5 text-jm-muted">The next arcade level brings another ticket. Short or easy runs still add sparks.</p> : null}
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between gap-3">
            <div><p className="jm-kicker">Eight places for little surprises</p><h3 className="mt-2 font-display text-xl">Arcade shelf</h3></div>
            <Badge tone="cyan">{decorations.length} decorated</Badge>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {slots.map((slot) => {
              const decoration = decorations.find((item) => item.slot === slot) as ArcadeDecoration | undefined;
              return (
                <div key={slot} className="flex min-h-24 items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/20 p-3">
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase tracking-[0.16em] text-jm-muted">{slotLabels[slot]}</p>
                    {decoration ? (
                      <p className="mt-2 truncate text-sm text-jm-text"><span aria-hidden="true" className="mr-2 text-lg">{decoration.icon}</span>{decoration.title}</p>
                    ) : <p className="mt-2 text-xs text-jm-muted">A little spot is waiting</p>}
                  </div>
                  {decoration ? (
                    decoration.owned_by_me ? (
                      <button type="button" disabled={busySlot === slot} onClick={() => remove(slot)} className="shrink-0 rounded-full border border-white/10 px-3 py-2 text-[10px] text-jm-cyan hover:bg-white/5 disabled:opacity-50">
                        {busySlot === slot ? "Moving…" : "Pick up"}
                      </button>
                    ) : <span className="shrink-0 text-[10px] text-jm-muted">Crew keepsake</span>
                  ) : (
                    <button type="button" disabled={tokens < 1 || busySlot !== null} onClick={() => place(slot)} className="shrink-0 rounded-full border border-jm-yellow/30 px-3 py-2 text-[10px] text-jm-yellow hover:bg-jm-yellow/10 disabled:opacity-40">
                      {busySlot === slot ? "Placing…" : "Put here"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
}
