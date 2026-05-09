"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/useApi";
import { RunMap } from "@/components/RunMap";
import { CourseReplay } from "@/components/CourseReplay";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { pointAtDistance } from "@/lib/metrics";
import type { AdventureSummary, GpsPoint } from "@jogmania/shared";

export default function RunDetailPage() {
  const params = useParams();
  const runId = Array.isArray(params.id) ? params.id[0] : (params.id as string | undefined);
  const { user } = useAuth();
  const api = useApi();
  const [run, setRun] = useState<any>(null);
  const [adventure, setAdventure] = useState<AdventureSummary | null>(null);
  const [course, setCourse] = useState<any>(null);
  const [attempts, setAttempts] = useState<any[]>([]);
  const [activating, setActivating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !runId) return;
    let cancelled = false;
    setError(null);
    api
      .getWorkout(runId)
      .then((data) => {
        if (!cancelled) setRun(data);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Unable to load run.");
        setRun(null);
      });
    api
      .getAdventuresByWorkout(runId)
      .then((data) => {
        if (!cancelled) setAdventure(data);
      })
      .catch(() => {
        if (!cancelled) setAdventure(null);
      });
    return () => {
      cancelled = true;
    };
  }, [api, user, runId]);

  useEffect(() => {
    if (!user || !runId || !run?.route_id) return;
    let cancelled = false;
    api
      .getRoute(run.route_id)
      .then(async (data) => {
        if (cancelled) return;
        setCourse(data);
        const workouts = data.workouts ?? [];
        const sorted = [...workouts].sort(
          (a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime()
        );
        const recent = sorted.slice(0, 4);
        const details = await Promise.all(
          recent.map(async (workout) => {
            if (workout.id === runId) return run;
            try {
              return await api.getWorkout(workout.id);
            } catch {
              return null;
            }
          })
        );
        if (!cancelled) {
          const filtered = details.filter(Boolean);
          setAttempts(filtered.length ? filtered : [run]);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCourse(null);
          setAttempts([run]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [api, user, runId, run?.route_id, run]);

  if (error) {
    return <div className="text-jm-muted">{error}</div>;
  }

  if (!run) {
    return <div className="text-jm-muted">Loading run...</div>;
  }

  const points = (run.gps_points || []) as GpsPoint[];
  const startedAt = run.started_at ? new Date(run.started_at) : null;
  const startedAtLabel = startedAt && !Number.isNaN(startedAt.getTime()) ? startedAt : null;
  const distanceKm = Number.isFinite(run.distance_m) ? (run.distance_m / 1000).toFixed(2) : "-";
  const durationMin = Number.isFinite(run.duration_s) ? Math.round(run.duration_s / 60) : "-";
  const pace = Number.isFinite(run.avg_pace_s_per_km) ? `${Math.round(run.avg_pace_s_per_km)} s/km` : "-";
  const sourceLabel =
    run.source === "watch" ? "Apple Watch" : run.source === "ios" ? "iPhone" : run.source ?? "Unknown";

  const markers = useMemo(() => {
    if (!adventure || !points.length) return [];
    const tones: Array<"cyan" | "magenta" | "acid"> = ["cyan", "magenta", "acid"];
    return adventure.segments
      .map((segment, idx) => {
        const mid = (segment.distance_start_m + segment.distance_end_m) / 2;
        const pos = pointAtDistance(points, mid);
        if (!pos) return null;
        const hazard = segment.hazards?.[0] ?? "Clear";
        return {
          lat: pos.lat,
          lon: pos.lon,
          label: `${segment.biome} · ${hazard}`,
          tone: tones[idx % tones.length]
        };
      })
      .filter(Boolean) as Array<{ lat: number; lon: number; label: string; tone: "cyan" | "magenta" | "acid" }>;
  }, [adventure, points]);

  const handleActivateCourse = async () => {
    if (!course || activating) return;
    setActivating(true);
    try {
      const updated = await api.activateRoute(course.id);
      setCourse(updated);
    } catch {
      // Ignore activation errors for now; surface later if needed.
    } finally {
      setActivating(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="p-6 jm-holo">
        <div className="flex items-center justify-between">
          <div>
            <p className="jm-kicker">Run Detail</p>
            <h3 className="font-display text-xl">Session Log</h3>
          </div>
          <Badge tone="cyan">{startedAtLabel ? startedAtLabel.toLocaleDateString() : "-"}</Badge>
        </div>
        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          <span className="jm-chip text-jm-muted">{startedAtLabel ? startedAtLabel.toLocaleString() : "-"}</span>
          <span className="jm-chip text-jm-muted">{sourceLabel}</span>
          <span className="jm-chip text-jm-cyan">{distanceKm} km</span>
          <span className="jm-chip text-jm-acid">{durationMin} min</span>
          <span className="jm-chip text-jm-magenta">{pace}</span>
        </div>
      </Card>

      {course && (
        <Card className="p-6 jm-holo">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <p className="jm-kicker">Adventure Course</p>
              <h3 className="font-display text-xl">{course.name}</h3>
              <p className="text-xs text-jm-muted mt-1">
                {course.is_course ? "Course active for progress tracking." : "Activate to track progress and scoring."}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Badge tone={course.is_course ? "cyan" : "slate"}>
                {course.is_course ? "Active" : "Inactive"}
              </Badge>
              {!course.is_course && (
                <Button size="sm" onClick={handleActivateCourse} disabled={activating}>
                  {activating ? "Activating..." : "Activate Course"}
                </Button>
              )}
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2 text-xs">
            <span className="jm-chip text-jm-cyan">
              Distance {course.distance_m ? (course.distance_m / 1000).toFixed(2) : "-"} km
            </span>
            <span className="jm-chip text-jm-acid">
              Typical Pace {course.typical_pace_s_per_km ? Math.round(course.typical_pace_s_per_km) : "-"} s/km
            </span>
            <span className="jm-chip text-jm-muted">Attempts {course.frequency ?? 0}</span>
          </div>
        </Card>
      )}

      <RunMap points={points} markers={markers} />

      <CourseReplay run={run} adventure={adventure} attempts={attempts.length ? attempts : [run]} />
    </div>
  );
}
