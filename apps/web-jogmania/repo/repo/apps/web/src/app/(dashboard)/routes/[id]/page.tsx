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
import type { CourseMastery } from "@jogmania/api-client";

export default function RouteDetailPage() {
  const params = useParams();
  const routeId = Array.isArray(params.id) ? params.id[0] : (params.id as string | undefined);
  const { user } = useAuth();
  const api = useApi();
  const [route, setRoute] = useState<any>(null);
  const [points, setPoints] = useState<GpsPoint[]>([]);
  const [adventures, setAdventures] = useState<AdventureSummary[]>([]);
  const [mastery, setMastery] = useState<CourseMastery | null>(null);
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
    api
      .getCourseMastery(routeId)
      .then((data) => {
        if (!cancelled) setMastery(data);
      })
      .catch(() => {
        if (!cancelled) setMastery(null);
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
              {route.is_course ? "A familiar trail in your growing world." : "Add this trail to your adventure deck."}
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
          <span className="jm-chip text-jm-acid">{route.frequency ?? 0} little adventures</span>
          <span className="jm-chip text-jm-muted">Instances {route.instances?.length ?? 0}</span>
          <span className="jm-chip text-jm-muted">
            Last {route.last_run_at ? new Date(route.last_run_at).toLocaleDateString() : "-"}
          </span>
        </div>
      </Card>

      {mastery ? (
        <Card className="jm-holo p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="jm-kicker">The trail remembers</p>
              <h3 className="mt-2 font-display text-xl">{mastery.title}</h3>
              <p className="mt-1 text-xs text-jm-muted">{mastery.visits} {mastery.visits === 1 ? "visit" : "visits"} · little chapters open as you return</p>
            </div>
            <Badge tone="magenta">Chapter {mastery.level} of {mastery.chapters.length}</Badge>
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-gradient-to-r from-neon-green via-neon-cyan to-neon-pink" style={{ width: `${mastery.progress_percent}%` }} />
          </div>
          {mastery.next_chapter ? (
            <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3">
              <p className="text-xs text-neon-yellow">Next page: {mastery.next_chapter.title}</p>
              <p className="mt-1 text-xs text-jm-muted">{mastery.next_chapter.story} · {Math.max(0, mastery.next_chapter.visits_required - mastery.visits)} more {mastery.next_chapter.visits_required - mastery.visits === 1 ? "visit" : "visits"}</p>
              <p className="mt-2 text-xs text-neon-cyan">Keepsake: {mastery.next_chapter.keepsake_icon} {mastery.next_chapter.keepsake}</p>
            </div>
          ) : <p className="mt-3 text-xs text-neon-green">This path has told you all five of its little secrets.</p>}
          <div className="mt-4 flex flex-wrap gap-2">
            {mastery.chapters.map((chapter) => (
              <span key={chapter.title} className={`rounded-full border px-3 py-1 text-[10px] ${chapter.unlocked ? "border-neon-cyan/25 bg-neon-cyan/5 text-neon-cyan" : "border-white/10 text-jm-muted"}`}>
                {chapter.unlocked ? `${chapter.keepsake_icon} ${chapter.title}` : "A secret page"}
              </span>
            ))}
          </div>
        </Card>
      ) : null}

      <RunMap points={points} />
      <LevelViz adventure={heroAdventure} />

      <Card className="p-6">
        <h4 className="font-display text-lg">Trail Storybook</h4>
        <div className="mt-4 space-y-3">
          {adventures.map((adv, idx) => (
            <div key={`${adv.seed}-${idx}`} className="p-4 bg-jm-surface/80 border border-white/10 rounded-xl">
              <p className="text-sm">{adv.title}</p>
              <p className="text-xs text-jm-muted">{adv.scenes?.[0] ?? "A little world tucked along this trail."}</p>
            </div>
          ))}
          {adventures.length === 0 && <p className="text-sm text-jm-muted">Your first visit will write the opening page.</p>}
        </div>
      </Card>

      <Card className="p-6">
        <h4 className="font-display text-lg">Course Attempts</h4>
        <div className="mt-4 space-y-3">
          {route.instances?.map((inst: any) => (
            <div key={inst.id} className="p-4 bg-jm-surface/80 border border-white/10 rounded-xl">
              <p className="text-sm">Workout {inst.workout_id.slice(0, 6)}</p>
              <p className="text-xs text-jm-muted">
                {new Date(inst.created_at).toLocaleDateString()} · another page in this trail&apos;s story
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
