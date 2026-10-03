"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ArcadeCabinet from "@/components/ArcadeCabinet";
import ArcadeWorldScene from "@/components/ArcadeWorldScene";
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
import type { AdventureCartridge, AdventureEvent, AdventureSession, AdventureWorld, RouteDetail } from "@jogmania/api-client";

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
  points: number;
};

type CourseStats = {
  points: number;
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
    description: "Lantern vines, sleepy birds, and a few very suspicious footprints.",
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
    description: "A sun-warmed staircase with a tiny door between the stones.",
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
    description: "River lights, friendly frogs, and a bridge that hums at sunset.",
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

function formatRunLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recent";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function getSessionPoints(metrics: Metrics) {
  return Math.max(0, Math.round(metrics.xp + metrics.streak * 12));
}

function computeRunPoints(distance_m: number) {
  return Math.max(60, Math.round(Math.max(0, distance_m) / 18));
}

function buildCourseStats(workouts: Workout[]): CourseStats {
  if (!workouts.length) {
    return { points: 0, runs: [] };
  }

  const ordered = [...workouts].sort(
    (a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime()
  );

  const runsAsc = ordered.map((workout) => {
    const points = computeRunPoints(workout.distance_m);
    return {
      id: workout.id,
      label: formatRunLabel(workout.started_at),
      distance_m: workout.distance_m,
      duration_s: workout.duration_s,
      points
    };
  });

  const totalPoints = runsAsc.reduce((sum, run) => sum + run.points, 0);
  const lastRun = runsAsc[runsAsc.length - 1];

  return {
    points: totalPoints,
    runs: runsAsc.slice().reverse()
  };
}

function buildQuest(course: CourseCard | null): Quest | null {
  if (!course) return null;
  return {
    title: course.stats.runs.length ? "Follow the flicker" : "Find the first light",
    goal: course.stats.runs.length
      ? `Something new is hiding along ${course.name}. Take the route and see what turns up.`
      : `Your first trip to ${course.name} will wake a little corner of the arcade.`,
    reward: "A world light, arcade sparks, and a story to keep",
    seed: course.stats.runs.length + 1
  };
}

function localArcadeCartridge(course: CourseCard): AdventureCartridge {
  const seeds = [
    ["marquee", "A sign in the weeds", "A little neon sign flickers awake. It says ARCADE!", "marquee", "discovery"],
    ["prize-counter", "The rattling prize tin", "A brass token rolls out and lands in the prize tin.", "token", "collectible"],
    ["lantern-crew", "A tiny helper arrives", "A lantern mouse scampers alongside you. Very official.", "mouse", "companion"],
    ["arcade-lights", "The Lost Arcade", "The whole marquee bursts into color. The arcade is open again!", "arcade", "finish"]
  ] as const;
  const targetDistance = Math.max(400, Math.round(course.distance_km * 1000));
  return {
    id: `offline-${Date.now()}`,
    title: "Relight the Lost Arcade",
    world_name: "The Lost Arcade",
    course_name: course.name,
    intent: "surprise",
    opening_line: "A forgotten arcade sign blinks awake. A lantern mouse has volunteered as your guide.",
    finish_line: "Every light is on. Somewhere inside, a pinball machine just woke up.",
    events: seeds.map((seed, index) => ({
      id: seed[0], trigger_kind: "distance", trigger_value: Math.max(1, Math.round(targetDistance * [0.18, 0.43, 0.72, 1.0][index])),
      kind: seed[4] as AdventureEvent["kind"], title: seed[1], message: seed[2], visual_key: seed[3],
      haptic: index === 3 ? "celebration" : index === 1 ? "success" : "tap"
    })),
    reward_preview: "An arcade light and a brass token",
    target_distance_m: targetDistance,
    haptics_enabled: true,
    health_data_enabled: false,
    intelligence: "fallback",
    runner_snapshot: {}
  };
}

export default function OverviewPage() {
  const { user } = useAuth();
  const api = useApi();
  const [started, setStarted] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [simulatePace, setSimulatePace] = useState(false);
  const [loot, setLoot] = useState<LootItem[] | null>(null);
  const [metrics, setMetrics] = useState<Metrics>({ pace: 3.5, streak: 0, xp: 0 });
  const [runKey, setRunKey] = useState(0);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [routeDetails, setRouteDetails] = useState<Record<string, RouteDetail>>({});
  const [activeCourseId, setActiveCourseId] = useState<string>(`${TEMPLATE_PREFIX}${COURSE_THEMES[0].key}`);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);
  const [arcadeWorld, setArcadeWorld] = useState<AdventureWorld | null>(null);
  const [cartridge, setCartridge] = useState<AdventureCartridge | null>(null);
  const [currentBeat, setCurrentBeat] = useState<AdventureEvent | null>(null);
  const [storyBeats, setStoryBeats] = useState<AdventureEvent[]>([]);
  const [practiceSummary, setPracticeSummary] = useState<RunSummary | null>(null);
  const cartridgeRef = useRef<AdventureCartridge | null>(null);
  const beatIdsRef = useRef<string[]>([]);
  const runBeatLogRef = useRef<Array<{ id: string }>>([]);

  const handleMetrics = useCallback((next: Metrics) => {
    setMetrics(next);
    const mission = cartridgeRef.current;
    if (!mission) return;
    for (const beat of mission.events) {
      if (beat.trigger_kind !== "distance" || (next.distance_m ?? 0) < beat.trigger_value) continue;
      if (beatIdsRef.current.includes(beat.id)) continue;
      beatIdsRef.current = [...beatIdsRef.current, beat.id];
      runBeatLogRef.current = [...runBeatLogRef.current, { id: beat.id }];
      setCurrentBeat(beat);
      setStoryBeats((current) => [...current, beat]);
      playCoin();
    }
  }, []);

  const refreshData = useCallback(
    async (preferredCourseId?: string) => {
      if (!user) return;
      setLoading(true);
      try {
        const [nextRoutes, nextWorld] = await Promise.all([
          api.listRoutes(),
          api.getAdventureWorld().catch(() => null)
        ]);
        setArcadeWorld(nextWorld);
        setPracticeSummary(null);
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
        stats: { points: 0, runs: [] }
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
  const lastStorySession = activeCourse?.route
    ? arcadeWorld?.recent_adventures?.find((session) => session.route_id === activeCourse.route?.id) ?? null
    : null;
  const quest = useMemo(() => buildQuest(activeCourse), [activeCourse]);

  const handleStart = useCallback(async () => {
    if (!activeCourse || preparing) return;
    setPreparing(true);
    playCoin();
    setApiError(null);
    setLoot(null);
    setPracticeSummary(null);
    setCurrentBeat(null);
    setStoryBeats([]);
    beatIdsRef.current = [];
    runBeatLogRef.current = [];
    setMetrics({ pace: 3.5, streak: 0, xp: 0 });
    setRunKey((k) => k + 1);
    cartridgeRef.current = localArcadeCartridge(activeCourse);
    setCartridge(cartridgeRef.current);
    setPreparing(false);
    setStarted(true);
  }, [activeCourse, preparing]);

  const handleGameOver = useCallback(
    (summary: RunSummary) => {
      setStarted(false);
      setPracticeSummary(summary);
      setLoot(rollLoot(summary));
    },
    []
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
              <span className="rounded-full border border-white/20 px-3 py-1">Story</span>
              <span className="rounded-full border border-white/20 px-3 py-1">Discover</span>
              <span className="rounded-full border border-white/20 px-3 py-1">Collect</span>
              <span className="rounded-full border border-white/20 px-3 py-1">Come back</span>
            </div>
            <h1 className="font-pixel text-4xl md:text-6xl text-neon-pink animate-glowpulse">JOGMANIA OUTSIDE</h1>
            <p className="text-white/70 max-w-2xl mx-auto">
              Lace up, step outside, and bring a tiny impossible arcade back to life. Every kind of run moves the story forward.
            </p>
          </header>

          <section className="relative overflow-hidden rounded-3xl border border-neon-blue/40 bg-gradient-to-br from-[#251042] via-[#151532] to-[#063642] p-5 md:p-7">
            <div className="absolute -right-8 -top-10 h-40 w-40 rounded-full bg-neon-pink/15 blur-2xl" />
            <div className="relative flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
              <div className="max-w-xl">
                <div className="font-pixel text-neon-yellow text-[10px] uppercase tracking-[0.24em]">Your growing world</div>
                <h2 className="mt-2 font-pixel text-2xl text-white">{arcadeWorld?.name ?? "The Lost Arcade"}</h2>
                <p className="mt-2 text-sm text-white/70">{arcadeWorld?.chapter ?? "Marquee Mystery"} · {arcadeWorld?.arcade?.runs ?? 0} little adventures so far</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {(arcadeWorld?.arcade?.chapter_lights?.length ? arcadeWorld.arcade.chapter_lights : ["the marquee is waiting for its first spark"]).map((light) => (
                    <span key={light} className="rounded-full border border-neon-yellow/30 bg-black/25 px-3 py-1 text-[11px] text-neon-yellow">✦ {light}</span>
                  ))}
                </div>
              </div>
              <div className="min-w-[180px] rounded-2xl border border-white/10 bg-black/35 p-4 text-center">
                <div className="font-pixel text-neon-cyan text-[10px]">ARCADE KEEPER</div>
                <div className="mt-2 font-pixel text-5xl text-neon-yellow">{arcadeWorld?.player_level ?? 1}</div>
                <div className="mt-1 text-xs text-white/60">Level {arcadeWorld?.player_level ?? 1} · {arcadeWorld?.sparks ?? totalPoints} sparks</div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-gradient-to-r from-neon-green via-neon-cyan to-neon-pink" style={{ width: `${arcadeWorld ? Math.min(100, ((600 - (arcadeWorld.next_level_sparks ?? 600)) / 600) * 100) : Math.min(100, (totalPoints % 600) / 6)}%` }} />
                </div>
                <div className="mt-2 text-[10px] text-white/50">{arcadeWorld?.next_level_sparks ?? 600} sparks to the next surprise</div>
              </div>
            </div>
            <div className="relative mt-5 overflow-hidden rounded-2xl">
              <ArcadeWorldScene
                chapter={arcadeWorld?.chapter ?? "Marquee Mystery"}
                lights={arcadeWorld?.arcade?.chapter_lights ?? []}
                decorations={arcadeWorld?.decorations ?? []}
              />
              <div className="absolute bottom-2 left-3 rounded-full bg-black/55 px-3 py-1 text-[9px] uppercase tracking-[0.2em] text-white/60">
                A little world, built one real run at a time
              </div>
            </div>
            <a href="/world" className="relative mt-3 inline-flex rounded-full border border-neon-yellow/25 bg-black/35 px-4 py-2 text-xs text-neon-yellow transition hover:bg-neon-yellow/10">
              Tinker with the arcade →
            </a>
          </section>

          <div className="grid gap-8 lg:grid-cols-[1.35fr_0.65fr]">
            <section className="space-y-6">
              <div className="relative crt h-[520px] md:h-[560px] pixel-border">
                <RunnerGame
                  key={`${runKey}-${activeCourse?.id ?? "course"}`}
                  running={started}
                  simulatePace={simulatePace}
                  themeKey={activeCourse?.themeKey}
                  onMetrics={handleMetrics}
                  onGameOver={handleGameOver}
                />
                <InsertCoin started={started} onStart={handleStart} />
                <div className="scanline" />
              </div>

              <div className="rounded-2xl border border-neon-pink/25 bg-gradient-to-r from-[#20102d] to-[#0e1d2a] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="font-pixel text-neon-pink text-[10px]">{started ? "PRACTICE ROUND · LIVE BEAT" : "PRACTICE CABINET"}</div>
                    <div className="mt-1 text-lg text-white">{currentBeat?.title ?? cartridge?.title ?? quest?.title ?? "The arcade sign is waiting"}</div>
                  </div>
                  <span className="text-3xl" aria-hidden="true">{currentBeat?.kind === "companion" ? "🐭" : currentBeat?.kind === "collectible" ? "🪙" : "✨"}</span>
                </div>
                <p className="mt-2 text-sm text-white/70">{currentBeat?.message ?? cartridge?.opening_line ?? quest?.goal ?? "Choose a course and the practice cabinet will pack a tiny story for the way."}</p>
                {cartridge ? (
                  <div className="mt-3">
                    <div className="h-2 overflow-hidden rounded-full bg-black/50">
                      <div className="h-full rounded-full bg-gradient-to-r from-neon-cyan to-neon-pink transition-[width]" style={{ width: `${Math.min(100, ((metrics.distance_m ?? 0) / cartridge.target_distance_m) * 100)}%` }} />
                    </div>
                    <div className="mt-1 flex justify-between text-[10px] text-white/45">
                      <span>{storyBeats.length} surprises found</span>
                      <span>{Math.round(Math.min(100, ((metrics.distance_m ?? 0) / cartridge.target_distance_m) * 100))}%</span>
                    </div>
                  </div>
                ) : null}
                {preparing ? <div className="mt-2 text-xs text-neon-yellow">The Worldkeeper is packing your story...</div> : null}
              </div>

              {practiceSummary ? (
                <div className="rounded-2xl border border-neon-yellow/25 bg-black/45 p-4">
                  <div className="font-pixel text-neon-yellow text-[10px]">Practice round complete</div>
                  <p className="mt-2 text-sm text-white">{formatDistance(practiceSummary.distance_m)} · {formatDuration(practiceSummary.duration_s)} · {storyBeats.length} story surprises</p>
                  <p className="mt-1 text-xs text-white/55">This cabinet is just for fun. Runs captured on iPhone or Apple Watch grow your saved arcade world.</p>
                </div>
              ) : null}

              <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
                <div className="rounded-2xl bg-black/50 p-4">
                  <div className="font-pixel text-neon-blue text-xs mb-2">Your Trail</div>
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
                      Visits{" "}
                      <span className="text-neon-green">{activeCourse?.stats.runs.length ?? 0}</span>
                    </div>
                    <div>
                      Arcade lights{" "}
                      <span className="text-neon-yellow">{arcadeWorld?.arcade?.chapter_lights?.length ?? 0}</span>
                    </div>
                  </div>
                </div>
                <Hud pace={metrics.pace} streak={metrics.streak} xp={metrics.xp} sessionPoints={sessionPoints} />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl bg-black/40 p-4">
                  <div className="font-pixel text-neon-yellow text-xs mb-2">A Postcard from the Trail</div>
                  {lastRun ? (
                    <div className="space-y-3 text-xs text-white/70">
                      {typeof lastStorySession?.recap.headline === "string" ? (
                        <div className="rounded-xl border border-neon-yellow/20 bg-black/35 p-3">
                          <div className="font-pixel text-neon-yellow text-[10px]">{lastStorySession.recap.headline}</div>
                          {typeof lastStorySession.recap.story === "string" ? <p className="mt-2 text-sm text-white/80">{lastStorySession.recap.story}</p> : null}
                          {typeof lastStorySession.recap.next_hook === "string" ? <p className="mt-2 text-[10px] text-neon-cyan">Next: {lastStorySession.recap.next_hook}</p> : null}
                        </div>
                      ) : null}
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
                        <span className="text-white/60">Adventure moments</span>
                        <span className="text-neon-green">{lastStorySession?.event_log?.length ?? 0}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-white/60">Arcade sparks</span>
                        <span className="text-neon-yellow font-pixel">+{lastRun.points}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm text-white/60">Take a course and bring back a little story.</div>
                  )}
                </div>

                <div className="rounded-2xl bg-black/40 p-4">
                  <div className="font-pixel text-neon-green text-xs mb-2">Course Postcards</div>
                  {activeCourse?.stats.runs.length ? (
                    <div className="space-y-3 text-xs text-white/70">
                      {activeCourse.stats.runs.slice(0, 4).map((run, index) => (
                        <div key={run.id} className="rounded-xl bg-black/50 p-3">
                          <div className="flex items-center justify-between">
                            <span className="text-white">Run {activeCourse.stats.runs.length - index}</span>
                            <span className="text-white/50">{run.label}</span>
                          </div>
                          <div className="mt-2 flex items-center justify-between">
                            <span className="text-white/60">Arcade sparks</span>
                            <span className="text-neon-yellow">+{run.points}</span>
                          </div>
                          <div className="mt-1 text-white/60">{formatDistance(run.distance_m)} explored · {formatDuration(run.duration_s)} outside</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm text-white/60">Your little course memories will collect here.</div>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-4">
                <PaceToggle enabled={simulatePace} onToggle={() => setSimulatePace((v) => !v)} />
                <div className="rounded-full border border-white/20 bg-black/40 px-4 py-2 text-xs uppercase text-white/80">
                  Practice sparks: <span className="font-pixel text-neon-yellow">{sessionPoints}</span>
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
                              <div className="text-[10px] text-white/50">sparks</div>
                            </div>
                          </div>
                          <div className="mt-2 flex items-center justify-between text-[10px] text-white/60">
                            <span>{course.stats.runs.length} visits</span>
                            <span>{lastCourseRun ? formatDistance(lastCourseRun.distance_m) : "First visit awaits"}</span>
                          </div>
                          <div className="mt-2 text-[10px] text-white/60">{lastCourseRun ? "There is a story here now." : "A new chapter is waiting."}</div>
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
                <div className="font-pixel text-neon-green text-xs mb-3">Arcade Sparks</div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-white/70">Worldkeeper Level {arcadeWorld?.player_level ?? 1}</span>
                  <span className="font-pixel text-neon-pink text-lg">{arcadeWorld?.sparks ?? totalPoints}</span>
                </div>
                <div className="mt-3 text-xs text-white/70">Every run adds a little color to your own arcade world.</div>
                <div className="mt-3 rounded-xl bg-black/40 p-3 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-white/60">Arcade keepsake</span>
                    <span className="font-pixel text-neon-yellow">
                      {totalPoints >= 2000 ? "Starry" : totalPoints >= 1200 ? "Golden" : totalPoints >= 600 ? "Glowing" : "New"}
                    </span>
                  </div>
                  <div className="mt-2 h-2 rounded-full bg-white/10">
                    <div
                      className="h-2 rounded-full bg-gradient-to-r from-neon-green to-neon-yellow"
                      style={{ width: `${Math.min(100, (totalPoints / 2000) * 100)}%` }}
                    />
                  </div>
                  <div className="mt-2 flex justify-between text-[10px] text-white/40">
                    <span>0 sparks</span>
                    <span>2000 sparks</span>
                  </div>
                </div>
              </div>

              <ControlHints />

              <div className="pixel-border rounded-2xl bg-black/40 p-4 text-xs text-white/70">
                <div className="font-pixel text-neon-pink text-xs mb-2">Arcade Feed</div>
                <div>Every run lights something, at any pace.</div>
                <div>Familiar paths grow new little details.</div>
                <div>Watch surprises follow your real distance.</div>
              </div>
            </aside>
          </div>
        </div>
      </ArcadeCabinet>

      <LootModal items={loot} onClose={() => setLoot(null)} />
    </div>
  );
}
