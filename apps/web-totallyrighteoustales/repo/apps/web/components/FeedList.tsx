"use client";

import { useEffect, useState } from "react";
import TaleCard from "./TaleCard";
import type { TaleSummary } from "@trt/shared";
import {
  fetchTales,
  searchTales,
  SEARCH_RESULTS_PAGE_SIZE,
  TALES_PAGE_SIZE,
} from "../lib/api";

type Props = {
  initialTales: TaleSummary[];
  sort: string;
  query?: string;
};

function isExhausted(count: number, query?: string) {
  return count < (query ? SEARCH_RESULTS_PAGE_SIZE : TALES_PAGE_SIZE);
}

export default function FeedList({ initialTales, sort, query }: Props) {
  const [tales, setTales] = useState<TaleSummary[]>(initialTales);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(isExhausted(initialTales.length, query));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTales(initialTales);
    setPage(0);
    setDone(isExhausted(initialTales.length, query));
    setError(null);
  }, [initialTales, query, sort]);

  async function loadMore() {
    setLoading(true);
    setError(null);
    const nextPage = page + 1;
    try {
      const data = query
        ? await searchTales(query, nextPage)
        : await fetchTales(sort, nextPage);
      if (data.length === 0) {
        setDone(true);
      } else {
        setTales((prev) => [...prev, ...data]);
        setPage(nextPage);
        if (isExhausted(data.length, query)) {
          setDone(true);
        }
      }
    } catch (_error) {
      setError("More stories would not load just now. Try again in a moment.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {tales.map((tale) => (
          <TaleCard key={tale.id} tale={tale} />
        ))}
      </div>
      {error && (
        <p className="rounded-[1.5rem] border border-ember/20 bg-ember/10 px-4 py-3 text-sm text-ember">
          {error}
        </p>
      )}
      {!done && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={loadMore}
            className="button-secondary min-w-[18rem] justify-center"
            disabled={loading}
          >
            {loading ? "Loading..." : "Load more tales"}
          </button>
        </div>
      )}
    </div>
  );
}
