"use client";

import { useEffect, useState } from "react";
import { cn } from "../lib/utils";

type LookupItem = {
  id: string;
  type: string;
  title: string;
  subtitle?: string;
  section?: string;
};

type RulesLookupProps = {
  activeSystemId?: string;
  activeSystemName?: string;
};

const filterOptions = [
  { id: "all", label: "All" },
  { id: "weapon", label: "Weapons" },
  { id: "event", label: "Events" },
  { id: "character", label: "Characters" }
] as const;

const excerpt = (value: string, limit: number) => {
  const cleaned = value.replace(/\s+/g, " ").trim();
  if (cleaned.length <= limit) return cleaned;
  return `${cleaned.slice(0, limit).replace(/[,:;.\s]+$/, "")}…`;
};

const typeToEntryTypes = (type: (typeof filterOptions)[number]["id"]) => {
  if (type === "weapon") return ["weapon"];
  if (type === "event") return ["event"];
  if (type === "character") return ["character", "archetype_template"];
  return undefined;
};

const formatTypeLabel = (value: string) => value.replace(/_/g, " ");

export function RulesLookup({ activeSystemId, activeSystemName }: RulesLookupProps) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<(typeof filterOptions)[number]["id"]>("all");
  const [items, setItems] = useState<LookupItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supportsLookup = Boolean(activeSystemId);

  useEffect(() => {
    if (!activeSystemId) {
      setItems([]);
      setTotal(0);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (query.trim()) params.set("q", query.trim());
        const entryTypes = typeToEntryTypes(filter);
        if (entryTypes?.length) params.set("types", entryTypes.join(","));
        params.set("limit", "12");

        const res = await fetch(`/api/dm/systems/${encodeURIComponent(activeSystemId)}/compendium?${params.toString()}`, {
          signal: controller.signal
        });
        if (!res.ok) {
          throw new Error("Lookup failed");
        }
        const data = (await res.json()) as {
          items?: Array<{
            id: string;
            entryType: string;
            name: string;
            summary: string;
            tags?: string[];
            data?: Record<string, unknown>;
          }>;
          total?: number;
        };
        const mapped = (data.items ?? []).map((item) => ({
          id: item.id,
          type: formatTypeLabel(item.entryType),
          title: item.name,
          subtitle: item.summary ? excerpt(item.summary, 160) : undefined,
          section:
            (typeof item.data?.section === "string" ? item.data.section : undefined) ??
            item.tags?.find((entry) => entry.length > 0)
        }));
        setItems(mapped);
        setTotal(data.total ?? 0);
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setError("Lookup unavailable.");
        }
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [activeSystemId, filter, query]);

  return (
    <div className="rave-panel rounded-3xl p-5">
      <div className="text-xs uppercase tracking-[0.3em] text-cloud/60">Rules Lookup</div>
      <div className="mt-2 text-sm text-cloud/80">
        {supportsLookup
          ? `Search indexed compendium entries for ${activeSystemName ?? "this ruleset"}. If nothing appears yet, that system still needs ingestion.`
          : "Select a ruleset to enable the compendium."}
      </div>

      <div className="mt-4 grid gap-3">
        <input
          className="rave-input rounded-2xl px-4 py-3 text-sm"
          placeholder="Search weapons, events, characters..."
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          disabled={!supportsLookup}
        />
        <div className="flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.3em] text-cloud/70">
          {filterOptions.map((option) => (
            <button
              key={option.id}
              type="button"
              className={cn(
                "rave-chip rounded-full px-3 py-2 transition",
                filter === option.id ? "text-white" : "text-cloud/60"
              )}
              onClick={() => setFilter(option.id)}
              disabled={!supportsLookup}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between text-xs text-cloud/60">
        <span>{loading ? "Searching..." : `${items.length} shown`}</span>
        <span>{total ? `${total} total` : ""}</span>
      </div>

      <div className="mt-4 grid max-h-64 gap-2 overflow-auto pr-1 text-sm text-cloud/80">
        {!supportsLookup && (
          <div className="rave-chip rounded-2xl px-3 py-2">Compendium lookup disabled.</div>
        )}
        {error && <div className="rave-chip rounded-2xl px-3 py-2">{error}</div>}
        {supportsLookup && !loading && !items.length && !error && (
          <div className="rave-chip rounded-2xl px-3 py-2">No indexed matches yet.</div>
        )}
        {items.map((item) => (
          <div key={item.id} className="rave-chip rounded-2xl px-3 py-2">
            <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.3em] text-cloud/60">
              <span>{item.type}</span>
              <span>{item.section}</span>
            </div>
            <div className="mt-1 text-sm text-white">{item.title}</div>
            {item.subtitle && <div className="mt-1 text-xs text-cloud/70">{item.subtitle}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
