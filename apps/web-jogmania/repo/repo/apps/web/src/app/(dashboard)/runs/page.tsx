"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/useApi";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import type { Workout } from "@jogmania/shared";

export default function RunsPage() {
  const { user } = useAuth();
  const api = useApi();
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [minDistance, setMinDistance] = useState(0);
  const [sortBy, setSortBy] = useState<"date" | "distance">("date");

  useEffect(() => {
    if (!user) return;
    api.listWorkouts().then(setWorkouts).catch(() => setWorkouts([]));
  }, [api, user]);

  const filtered = workouts
    .filter((run) => run.distance_m >= minDistance * 1000)
    .sort((a, b) => {
      if (sortBy === "distance") return b.distance_m - a.distance_m;
      return new Date(b.started_at).getTime() - new Date(a.started_at).getTime();
    });

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-xl">Runs</h3>
        <Badge tone="slate">{filtered.length} total</Badge>
      </div>
      <div className="mt-4 flex flex-wrap gap-3 text-xs text-jm-muted">
        <label className="flex items-center gap-2">
          Min distance (km)
          <input
            type="number"
            min={0}
            value={minDistance}
            onChange={(event) => setMinDistance(Number(event.target.value))}
            className="w-24 jm-input py-2 text-xs"
          />
        </label>
        <label className="flex items-center gap-2">
          Sort
          <select
            value={sortBy}
            onChange={(event) => setSortBy(event.target.value as "date" | "distance")}
            className="jm-input w-32 py-2 text-xs"
          >
            <option value="date">Newest</option>
            <option value="distance">Longest</option>
          </select>
        </label>
        <span className="text-xs text-jm-muted">Open a run to activate it as an Adventure Course.</span>
      </div>
      <div className="mt-4 space-y-3">
        {filtered.map((run) => (
          <Link
            key={run.id}
            href={`/runs/${run.id}`}
            className="flex items-center justify-between p-4 bg-jm-surface/80 border border-white/10 rounded-xl hover:border-jm-cyan/40 hover:bg-white/5 transition"
          >
            <div>
              <p className="text-xs text-jm-muted">
                {run.source === "watch" ? "Apple Watch" : run.source === "ios" ? "iPhone" : run.source ?? "Unknown"}
              </p>
              <p className="text-sm">{new Date(run.started_at).toLocaleString()}</p>
              <p className="text-xs text-jm-muted">{(run.distance_m / 1000).toFixed(2)} km</p>
            </div>
            <div className="jm-chip text-jm-cyan">{Math.round(run.avg_pace_s_per_km)} s/km</div>
          </Link>
        ))}
        {filtered.length === 0 && <p className="text-sm text-jm-muted">No runs yet.</p>}
      </div>
    </Card>
  );
}
