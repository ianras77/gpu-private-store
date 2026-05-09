"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import ArcadeCabinet from "@/components/ArcadeCabinet";
import InsertCoin from "@/components/InsertCoin";
import Hud from "@/components/Hud";
import QuestPanel from "@/components/QuestPanel";
import LootModal from "@/components/LootModal";
import PaceToggle from "@/components/PaceToggle";
import ControlHints from "@/components/ControlHints";
import RunnerGame, { type Metrics, type RunSummary } from "@/game/RunnerGame";
import { playCoin } from "@/lib/sfx";
import { rollLoot, type LootItem } from "@/lib/loot";
import type { Quest } from "@/lib/quest";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/useApi";
import type { Route, Workout } from "@jogmania/shared";
import type { RouteDetail, WorkoutDetail, WorkoutCreatePayload } from "@jogmania/api-client";

type CourseTheme = {
  key: string;
  name: string;
  description: string;
  distance_km: number;
  points: Array<{
    lat: number;
    lon: number;
    altitude_m?: number | null;
    accuracy_m?: number | null;
  }>;
};

type CourseRun = {
  id: string;
  label: string;
  distance_m: number;
  duration_s: number;
  avg_pace_s_per_km: number;
  points: number;
  improvement_s_per_km: number | null;
};

type CourseStats = {
  points: number;
  bestPace: number | null;
  lastPace: number | null;
  runs: CourseRun[];
};

type CourseCard = {
  id: string;
  name: string;
  description: string;
  themeKey: string;
  distance_km: number;
  isTemplate: boolean;
  route?: Route;
  stats: CourseStats;
};

const COURSE_THEMES: CourseTheme[] = [
  {
    key: "neon-canopy",
    name: "Neon Canopy",
    description: "Lantern vines and vine swings. Speed wins the jungle.",
    distance_km: 3.4,
    points: [
      { lat: 34.0522, lon: -118.2437, accuracy_m: 5 },
      { lat: 34.0535, lon: -118.2412, accuracy_m: 5 },
      { lat: 34.055, lon: -118.239, accuracy_m: 5 },
      { lat: 34.0562, lon: -118.2415, accuracy_m: 5 },
      { lat: 34.055, lon: -118.2445, accuracy_m: 5 },
      { lat: 34.0522, lon: -118.2437, accuracy_m: 5 }
    ]
  },
  {
    key: "temple-steps",
    name: "Temple Steps",
    description: "Stone stair climb with hidden relic drops.",
    distance_km: 4.1,
    points: [
      { lat: 35.6895, lon: 139.6917, accuracy_m: 5 },
      { lat: 35.691, lon: 139.6935, accuracy_m: 5 },
      { lat: 35.692, lon: 139.696, accuracy_m: 5 },
      { lat: 35.6905, lon: 139.6985, accuracy_m: 5 },
      { lat: 35.688, lon: 139.6965, accuracy_m: 5 },
      { lat: 35.6895, lon: 139.6917, accuracy_m: 5 }
    ]
  },
  {
    key: "riverlight-loop",
    name: "Riverlight Loop",
    description: "Fast loop with bright jumps and quick cash outs.",
    distance_km: 2.7,
    points: [
      { lat: 47.6062, lon: -122.3321, accuracy_m: 5 },
      { lat: 47.6078, lon: -122.3294, accuracy_m: 5 },
      { lat: 47.6095, lon: -122.327, accuracy_m: 5 },
      { lat: 47.611, lon: -122.3298, accuracy_m: 5 },
      { lat: 47.609, lon: -122.3332, accuracy_m: 5 },
      { lat: 47.6062, lon: -122.3321, accuracy_m: 5 }
    ]
  }
];

const TEMPLATE_PREFIX = "template-";

function hashString(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function themeForRoute(route: Route): CourseTheme {
  const lowered = route.name.toLowerCase();
  const named = COURSE_THEMES.find((theme) => lowered.includes(theme.name.toLowerCase()));
  if (named) return named;
  const seed = hashString(route.route_hash ?? route.id);
  return COURSE_THEMES[seed % COURSE_THEMES.length];
}

function formatPace(secondsPerKm?: number | null) {
  if (!secondsPerKm || secondsPerKm <= 0) return "--";
  const minutes = Math.floor(secondsPerKm / 60);
  const seconds = Math.floor(secondsPerKm % 60);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function formatDuration(secondsTotal: number) {
  if (!secondsTotal || secondsTotal <= 0) return "0:00";
  const minutes = Math.floor(secondsTotal / 60);
  const seconds = Math.floor(secondsTotal % 60);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function formatDistance(distanceM: number) {
  if (!distanceM || distanceM <= 0) return "-- km";
  return `${(distanceM / 1000).toFixed(2)} km`;
}

function formatImprovement(value: number | null) {
  if (value === null) return "First course record";
  if (value === 0) return "Matched best";
  if (value > 0) return `Faster by ${Math.round(value)}s/km`;
  return `Slower by ${Math.round(Math.abs(value))}s/km`;
}

function formatRunLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recent";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function getSessionPoints(metrics: Metrics) {
  return Math.max(0, Math.round(metrics.xp + metrics.streak * 12));
}

function computeRunPoints(distance_m: number, improvement: number | null) {
  const basePoints = Math.max(60, Math.round(distance_m / 18));
  const bonus = improvement && improvement > 0 ? Math.round(improvement * 2.5) : 0;
  return basePoints + bonus;
}

function buildCourseStats(workouts: Workout[]): CourseStats {
  if (!workouts.length) {
    return { points: 0, bestPace: null, lastPace: null, runs: [] };
  }

  const ordered = [...workouts].sort(
    (a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime()
  );

  let best: number | null = null;
  const runsAsc = ordered.map((workout) => {
    const improvement = best === null ? null : best - workout.avg_pace_s_per_km;
    if (best === null || workout.avg_pace_s_per_km < best) {
      best = workout.avg_pace_s_per_km;
    }
    const points = computeRunPoints(workout.distance_m, improvement);
    return {
      id: workout.id,
      label: formatRunLabel(workout.started_at),
      distance_m: workout.distance_m,
      duration_s: workout.duration_s,
      avg_pace_s_per_km: workout.avg_pace_s_per_km,
      points,
      improvement_s_per_km: improvement
    };
  });

  const totalPoints = runsAsc.reduce((sum, run) => sum + run.points, 0);
  const lastRun = runsAsc[runsAsc.length - 1];

  return {
    points: totalPoints,
    bestPace: best,
    lastPace: lastRun?.avg_pace_s_per_km ?? null,
    runs: runsAsc.slice().reverse()
  };
}

function buildQuest(course: CourseCard | null): Quest | null {
  if (!course) return null;
  const paceBase = course.stats.bestPace ?? course.stats.lastPace ?? 360;
  const target = Math.max(240, paceBase - 10);
  const reward = Math.round(120 + course.stats.points * 0.05);
  return {
    title: `Break ${formatPace(target)}/km`,
    goal: `Finish ${course.name} under ${formatPace(target)}/km to bank a bonus cache.`,
    reward: `${reward} course points`,
    seed: Math.floor(target)
  };
}

export default function OverviewPage() {
  const { user } = useAuth();
  const api = useApi();
  const [started, setStarted] = useState(false);
  const [simulatePace, setSimulatePace] = useState(false);
  const [loot, setLoot] = useState<LootItem[] | null>(null);
  const [metrics, setMetrics] = useState<Metrics>({ pace: 3.5, streak: 0, xp: 0 });
  const [runKey, setRunKey] = useState(0);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [routeDetails, setRouteDetails] = useState<Record<string, RouteDetail>>({});
  const [activeCourseId, setActiveCourseId] = useState<string>(`${TEMPLATE_PREFIX}${COURSE_THEMES[0].key}`);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);

  const refreshData = useCallback(
    async (preferredCourseId?: string) => {
      if (!user) return;
      setLoading(true);
      try {
        const nextRoutes = await api.listRoutes();
        setRoutes(nextRoutes);
        const courseRoutes = nextRoutes.filter((route) => route.is_course);
        const details = await Promise.all(
          courseRoutes.map(async (route) => {
            try {
              const detail = await api.getRoute(route.id);
              return [route.id, detail] as const;
            } catch {
              return null;
            }
          })
        );
        const mapped: Record<string, RouteDetail> = {};
        details.forEach((entry) => {
          if (!entry) return;
          mapped[entry[0]] = entry[1];
        });
        setRouteDetails(mapped);

        setActiveCourseId((current) => {
          if (courseRoutes.length === 0) {
            return `${TEMPLATE_PREFIX}${COURSE_THEMES[0].key}`;
          }
          if (preferredCourseId && courseRoutes.some((route) => route.id === preferredCourseId)) {
            return preferredCourseId;
          }
          if (courseRoutes.some((route) => route.id === current)) {
            return current;
          }
          return courseRoutes[0].id;
        });
        setApiError(null);
      } catch {
        setApiError("Arcade servers are offline. Runs will not save.");
        setRoutes([]);
      } finally {
        setLoading(false);
      }
    },
    [api, user]
  );

  useEffect(() => {
    if (!user) return;
    refreshData();
  }, [user, refreshData]);

  useEffect(() => {
    if (!activeCourseId) return;
    setStarted(false);
    setMetrics({ pace: 3.5, streak: 0, xp: 0 });
    setRunKey((k) => k + 1);
  }, [activeCourseId]);

  const courseCards = useMemo<CourseCard[]>(() => {
    const courses = routes.filter((route) => route.is_course);
    if (!courses.length) {
      return COURSE_THEMES.map((theme) => ({
        id: `${TEMPLATE_PREFIX}${theme.key}`,
        name: theme.name,
        description: theme.description,
        themeKey: theme.key,
        distance_km: theme.distance_km,
        isTemplate: true,
        stats: { points: 0, bestPace: null, lastPace: null, runs: [] }
      }));
    }

    return courses.map((route) => {
      const detail = routeDetails[route.id];
      const workouts = detail?.workouts ?? [];
      const stats = buildCourseStats(workouts);
      const theme = themeForRoute(route);
      const distanceKm = route.distance_m
        ? route.distance_m / 1000
        : workouts.length
        ? workouts.reduce((sum, run) => sum + run.distance_m, 0) / workouts.length / 1000
        : theme.distance_km;

      return {
        id: route.id,
        name: route.name,
        description: theme.description,
        themeKey: theme.key,
        distance_km: distanceKm,
        isTemplate: false,
        route,
        stats
      };
    });
  }, [routes, routeDetails]);

  const activeCourse = courseCards.find((course) => course.id === activeCourseId) ?? courseCards[0] ?? null;
  const sessionPoints = getSessionPoints(metrics);
  const totalPoints = courseCards.reduce((sum, course) => sum + course.stats.points, 0);
  const lastRun = activeCourse?.stats.runs[0];
  const quest = useMemo(() => buildQuest(activeCourse), [activeCourse]);

  const buildGpsPoints = useCallback(
    async (course: CourseCard, start: Date, end: Date) => {
      let basePoints = course.isTemplate
        ? COURSE_THEMES.find((theme) => theme.key === course.themeKey)?.points ?? COURSE_THEMES[0].points
        : COURSE_THEMES.find((theme) => theme.key === course.themeKey)?.points ?? COURSE_THEMES[0].points;

      if (!course.isTemplate && course.route) {
        const detail = routeDetails[course.route.id];
        const latestWorkout = detail?.workouts?.[0];
        if (latestWorkout) {
          try {
            const workoutDetail: WorkoutDetail = await api.getWorkout(latestWorkout.id);
            if (workoutDetail.gps_points.length >= 2) {
              basePoints = workoutDetail.gps_points.map((point) => ({
                lat: point.lat,
                lon: point.lon,
                altitude_m: point.altitude_m ?? undefined,
                accuracy_m: point.accuracy_m ?? undefined
              }));
            }
          } catch {
            // fallback to theme points
          }
        }
      }

      if (basePoints.length < 2) {
        basePoints = COURSE_THEMES[0].points;
      }

      const totalMs = end.getTime() - start.getTime();
      const stepMs = totalMs / (basePoints.length - 1);
      return basePoints.map((point, idx) => ({
        ...point,
        timestamp: new Date(start.getTime() + stepMs * idx).toISOString()
      }));
    },
    [api, routeDetails]
  );

  const handleStart = useCallback(() => {
    if (!activeCourse) return;
    playCoin();
    setApiError(null);
    setLoot(null);
    setMetrics({ pace: 3.5, streak: 0, xp: 0 });
    setRunKey((k) => k + 1);
    setStarted(true);
  }, [activeCourse]);

  const handleGameOver = useCallback(
    async (summary: RunSummary) => {
      setStarted(false);
      if (!activeCourse || !user) return;

      const end = new Date();
      const start = new Date(end.getTime() - summary.duration_s * 1000);

      try {
        const gpsPoints = await buildGpsPoints(activeCourse, start, end);
        const payload: WorkoutCreatePayload = {
          source: "arcade",
          started_at: start.toISOString(),
          ended_at: end.toISOString(),
          duration_s: summary.duration_s,
          distance_m: summary.distance_m,
          avg_pace_s_per_km: summary.avg_pace_s_per_km,
          route_id: activeCourse.route?.id ?? null,
          raw_payload_json: {
            arcade: true,
            session_points: sessionPoints,
            theme: activeCourse.themeKey
          },
          gps_points: gpsPoints
        };

        const workout = await api.createWorkout(payload);
        if (workout.route_id) {
          try {
            await api.activateRoute(workout.route_id);
          } catch {
            // ignore activation error
          }
          if (activeCourse.isTemplate) {
            try {
              await api.renameRoute(workout.route_id, activeCourse.name);
            } catch {
              // ignore rename error
            }
          }
          await refreshData(workout.route_id);
        } else {
          await refreshData();
        }
      } catch {
        setApiError("Run saved locally only. Check your server connection.");
      }

      setLoot(rollLoot(summary, sessionPoints));
    },
    [activeCourse, buildGpsPoints, refreshData, sessionPoints, api, user]
  );

  return (
    <div className="space-y-6">
      {apiError ? (
        <div className="rounded-2xl border border-neon-pink/30 bg-black/60 p-3 text-xs text-neon-pink">
          {apiError}
        </div>
      ) : null}

      <ArcadeCabinet>
        <div className="space-y-8">
          <header className="text-center space-y-3">
            <div className="flex flex-wrap items-center justify-center gap-2 text-[10px] uppercase tracking-[0.3em] text-white/50">
              <span className="rounded-full border border-white/20 px-3 py-1">Run</span>
              <span className="rounded-full border border-white/20 px-3 py-1">Course</span>
              <span className="rounded-full border border-white/20 px-3 py-1">Improve</span>
              <span className="rounded-full border border-white/20 px-3 py-1">Points</span>
            </div>
            <h1 className="font-pixel text-4xl md:text-6xl text-neon-pink animate-glowpulse">JOGMANIA ARCADE</h1>
            <p className="text-white/70 max-w-2xl mx-auto">
              Every run becomes a course record. Improve your pace, bank points, and climb the arcade board.
            </p>
          </header>

          <div className="grid gap-8 lg:grid-cols-[1.35fr_0.65fr]">
            <section className="space-y-6">
              <div className="relative crt h-[520px] md:h-[560px] pixel-border">
                <RunnerGame
                  key={`${runKey}-${activeCourse?.id ?? "course"}`}
                  running={started}
                  simulatePace={simulatePace}
                  themeKey={activeCourse?.themeKey}
                  onMetrics={setMetrics}
                  onGameOver={handleGameOver}
                />
                <InsertCoin started={started} onStart={handleStart} />
                <div className="scanline" />
              </div>

              <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
                <div className="rounded-2xl bg-black/50 p-4">
                  <div className="font-pixel text-neon-blue text-xs mb-2">Active Course</div>
                  <div className="text-xl text-white">{activeCourse?.name ?? "Select a course"}</div>
                  <div className="text-xs text-white/60">{activeCourse?.description ?? ""}</div>
                  <div className="mt-3 flex flex-wrap gap-4 text-xs text-white/70">
                    <div>
                      Distance{" "}
                      <span className="text-white">
                        {activeCourse ? activeCourse.distance_km.toFixed(1) : "--"} km
                      </span>
                    </div>
                    <div>
                      Best pace{" "}
                      <span className="text-neon-green">{formatPace(activeCourse?.stats.bestPace)}/km</span>
                    </div>
                    <div>
                      Course points{" "}
                      <span className="text-neon-yellow">{activeCourse?.stats.points ?? 0}</span>
                    </div>
                  </div>
                </div>
                <Hud pace={metrics.pace} streak={metrics.streak} xp={metrics.xp} sessionPoints={sessionPoints} />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl bg-black/40 p-4">
                  <div className="font-pixel text-neon-yellow text-xs mb-2">Run Recap</div>
                  {lastRun ? (
                    <div className="space-y-3 text-xs text-white/70">
                      <div className="flex items-center justify-between">
                        <span className="text-white/60">Date</span>
                        <span className="text-white">{lastRun.label}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-white/60">Distance</span>
                        <span className="text-white">{formatDistance(lastRun.distance_m)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-white/60">Time</span>
                        <span className="text-white">{formatDuration(lastRun.duration_s)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-white/60">Avg pace</span>
                        <span className="text-neon-green">{formatPace(lastRun.avg_pace_s_per_km)}/km</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-white/60">Points earned</span>
                        <span className="text-neon-yellow font-pixel">+{lastRun.points}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm text-white/60">Complete a run to lock in a course record.</div>
                  )}
                </div>

                <div className="rounded-2xl bg-black/40 p-4">
                  <div className="font-pixel text-neon-green text-xs mb-2">Course Improvements</div>
                  {activeCourse?.stats.runs.length ? (
                    <div className="space-y-3 text-xs text-white/70">
                      {activeCourse.stats.runs.slice(0, 4).map((run, index) => (
                        <div key={run.id} className="rounded-xl bg-black/50 p-3">
                          <div className="flex items-center justify-between">
                            <span className="text-white">Run {activeCourse.stats.runs.length - index}</span>
                            <span className="text-white/50">{run.label}</span>
                          </div>
                          <div className="mt-1 flex items-center justify-between">
                            <span className="text-white/60">Pace</span>
                            <span className="text-white">{formatPace(run.avg_pace_s_per_km)}/km</span>
                          </div>
                          <div className="mt-1 flex items-center justify-between">
                            <span className="text-white/60">Delta</span>
                            <span
                              className={
                                run.improvement_s_per_km !== null && run.improvement_s_per_km > 0
                                  ? "text-neon-green"
                                  : run.improvement_s_per_km !== null && run.improvement_s_per_km < 0
                                  ? "text-neon-pink"
                                  : "text-white/60"
                              }
                            >
                              {formatImprovement(run.improvement_s_per_km)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm text-white/60">Your improvements stack here run by run.</div>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-4">
                <PaceToggle enabled={simulatePace} onToggle={() => setSimulatePace((v) => !v)} />
                <div className="rounded-full border border-white/20 bg-black/40 px-4 py-2 text-xs uppercase text-white/80">
                  Pending points: <span className="font-pixel text-neon-yellow">{sessionPoints}</span>
                </div>
              </div>
            </section>

            <aside className="space-y-4">
              <div className="pixel-border rounded-2xl bg-[#0c0c1b]/80 p-4">
                <div className="font-pixel text-neon-yellow text-xs mb-3">Course Deck</div>
                {loading ? (
                  <div className="text-xs text-white/60">Syncing course data...</div>
                ) : courseCards.length ? (
                  <div className="space-y-3">
                    {courseCards.map((course) => {
                      const lastCourseRun = course.stats.runs[0];
                      const isActive = course.id === activeCourse?.id;
                      return (
                        <button
                          key={course.id}
                          type="button"
                          disabled={started}
                          onClick={() => setActiveCourseId(course.id)}
                          className={`w-full rounded-xl border p-3 text-left transition ${
                            isActive
                              ? "border-neon-blue bg-black/60 shadow-[0_0_12px_rgba(51,214,255,0.35)]"
                              : "border-white/10 bg-black/40 hover:border-white/30"
                          } ${started ? "cursor-not-allowed opacity-60" : ""}`}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="text-white text-sm">{course.name}</div>
                              <div className="text-[10px] text-white/40">{course.distance_km.toFixed(1)} km</div>
                            </div>
                            <div className="text-right">
                              <div className="text-neon-yellow font-pixel text-sm">{course.stats.points}</div>
                              <div className="text-[10px] text-white/50">pts</div>
                            </div>
                          </div>
                          <div className="mt-2 flex items-center justify-between text-[10px] text-white/60">
                            <span>Best {formatPace(course.stats.bestPace)}/km</span>
                            <span>Last {formatPace(course.stats.lastPace)}/km</span>
                          </div>
                          {lastCourseRun ? (
                            <div className="mt-2 text-[10px] text-white/60">
                              <span
                                className={
                                  lastCourseRun.improvement_s_per_km !== null &&
                                  lastCourseRun.improvement_s_per_km > 0
                                    ? "text-neon-green"
                                    : lastCourseRun.improvement_s_per_km !== null &&
                                      lastCourseRun.improvement_s_per_km < 0
                                    ? "text-neon-pink"
                                    : "text-white/50"
                                }
                              >
                                {formatImprovement(lastCourseRun.improvement_s_per_km)}
                              </span>
                            </div>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-xs text-white/60">No courses found. Check your connection.</div>
                )}
                {started ? (
                  <div className="mt-3 text-[10px] text-white/40">Finish the run to switch courses.</div>
                ) : null}
              </div>

              <QuestPanel quest={quest} courseName={activeCourse?.name} />

              <div className="pixel-border rounded-2xl bg-black/50 p-4">
                <div className="font-pixel text-neon-green text-xs mb-3">Points Vault</div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-white/70">Total Points</span>
                  <span className="font-pixel text-neon-pink text-lg">{totalPoints}</span>
                </div>
                <div className="mt-3 text-xs text-white/70">
                  Course stash - {activeCourse?.name ?? ""}{" "}
                  <span className="text-neon-yellow">{activeCourse?.stats.points ?? 0}</span>
                </div>
                <div className="mt-3 rounded-xl bg-black/40 p-3 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-white/60">Badge</span>
                    <span className="font-pixel text-neon-yellow">
                      {totalPoints >= 2000 ? "Platinum" : totalPoints >= 1200 ? "Gold" : totalPoints >= 600 ? "Silver" : "Bronze"}
                    </span>
                  </div>
                  <div className="mt-2 h-2 rounded-full bg-white/10">
                    <div
                      className="h-2 rounded-full bg-gradient-to-r from-neon-green to-neon-yellow"
                      style={{ width: `${Math.min(100, (totalPoints / 2000) * 100)}%` }}
                    />
                  </div>
                  <div className="mt-2 flex justify-between text-[10px] text-white/40">
                    <span>0 pts</span>
                    <span>2000 pts</span>
                  </div>
                </div>
              </div>

              <ControlHints />

              <div className="pixel-border rounded-2xl bg-black/40 p-4 text-xs text-white/70">
                <div className="font-pixel text-neon-pink text-xs mb-2">Arcade Feed</div>
                <div>Courses sync after every cash out.</div>
                <div>New best pace drops a bonus point cache.</div>
                <div>Stack streaks to unlock relic drops.</div>
              </div>
            </aside>
          </div>
        </div>
      </ArcadeCabinet>

      <LootModal items={loot} onClose={() => setLoot(null)} />
    </div>
  );
}
