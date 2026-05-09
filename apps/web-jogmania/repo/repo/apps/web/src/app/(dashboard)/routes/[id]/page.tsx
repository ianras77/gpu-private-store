"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/useApi";
import { RunMap } from "@/components/RunMap";
import { LevelViz } from "@/components/LevelViz";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import type { AdventureSummary, GpsPoint } from "@jogmania/shared";

export default function RouteDetailPage() {
  const params = useParams();
  const routeId = Array.isArray(params.id) ? params.id[0] : (params.id as string | undefined);
  const { user } = useAuth();
  const api = useApi();
  const [route, setRoute] = useState<any>(null);
  const [points, setPoints] = useState<GpsPoint[]>([]);
  const [adventures, setAdventures] = useState<AdventureSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [activating, setActivating] = useState(false);

  useEffect(() => {
    if (!user || !routeId) return;
    let cancelled = false;
    setError(null);
    api
      .getRoute(routeId)
      .then(async (data) => {
        if (cancelled) return;
        setRoute(data);
        const firstWorkout = data.workouts?.[0];
        if (firstWorkout) {
          const detail = await api.getWorkout(firstWorkout.id);
          if (!cancelled) {
            setPoints(detail.gps_points || []);
          }
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Unable to load course.");
        setRoute(null);
      });
    api
      .getAdventuresByRoute(routeId)
      .then((data) => {
        if (!cancelled) setAdventures(data);
      })
      .catch(() => {
        if (!cancelled) setAdventures([]);
      });
    return () => {
      cancelled = true;
    };
  }, [api, user, routeId]);

  if (error) {
    return <div className="text-jm-muted">{error}</div>;
  }

  if (!route) {
    return <div className="text-jm-muted">Loading course...</div>;
  }

  const heroAdventure = adventures[0] ?? null;
  const handleActivate = async () => {
    if (activating || route.is_course) return;
    setActivating(true);
    try {
      const updated = await api.activateRoute(route.id);
      setRoute((prev: any) => (prev ? { ...prev, ...updated } : updated));
    } catch {
      // Ignore activation errors for now.
    } finally {
      setActivating(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="p-6 jm-holo">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <p className="jm-kicker">Adventure Course</p>
            <h3 className="font-display text-2xl">{route.name}</h3>
            <p className="text-xs text-jm-muted mt-1">
              {route.is_course ? "Course active for repeatable runs." : "Activate to track progress and scoring."}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge tone={route.is_course ? "cyan" : "slate"}>
              {route.is_course ? "Active" : "Inactive"}
            </Badge>
            {!route.is_course && (
              <Button size="sm" variant="outline" onClick={handleActivate} disabled={activating}>
                {activating ? "Activating..." : "Activate Course"}
              </Button>
            )}
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          <span className="jm-chip text-jm-cyan">
            Distance {route.distance_m ? (route.distance_m / 1000).toFixed(2) : "-"} km
          </span>
          <span className="jm-chip text-jm-acid">
            Pace {route.typical_pace_s_per_km ? Math.round(route.typical_pace_s_per_km) : "-"} s/km
          </span>
          <span className="jm-chip text-jm-muted">Instances {route.instances?.length ?? 0}</span>
          <span className="jm-chip text-jm-muted">
            Last {route.last_run_at ? new Date(route.last_run_at).toLocaleDateString() : "-"}
          </span>
        </div>
      </Card>

      <RunMap points={points} />
      <LevelViz adventure={heroAdventure} />

      <Card className="p-6">
        <h4 className="font-display text-lg">Adventure Variations</h4>
        <div className="mt-4 space-y-3">
          {adventures.map((adv, idx) => (
            <div key={`${adv.seed}-${idx}`} className="p-4 bg-jm-surface/80 border border-white/10 rounded-xl">
              <p className="text-sm">{adv.title}</p>
              <p className="text-xs text-jm-muted">Seed {adv.seed} · Obstacle {adv.obstacle_density}</p>
            </div>
          ))}
          {adventures.length === 0 && <p className="text-sm text-jm-muted">No adventure instances yet.</p>}
        </div>
      </Card>

      <Card className="p-6">
        <h4 className="font-display text-lg">Course Attempts</h4>
        <div className="mt-4 space-y-3">
          {route.instances?.map((inst: any) => (
            <div key={inst.id} className="p-4 bg-jm-surface/80 border border-white/10 rounded-xl">
              <p className="text-sm">Workout {inst.workout_id.slice(0, 6)}</p>
              <p className="text-xs text-jm-muted">
                Difficulty {inst.difficulty} · {new Date(inst.created_at).toLocaleDateString()}
              </p>
            </div>
          ))}
          {(!route.instances || route.instances.length === 0) && (
            <p className="text-sm text-jm-muted">No course attempts yet.</p>
          )}
        </div>
      </Card>
    </div>
  );
}
