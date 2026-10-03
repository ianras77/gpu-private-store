import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View, Vibration } from "react-native";
import type { AdventureSummary, Route } from "@jogmania/shared";
import type { AdventureCartridge, AdventureEvent, AdventureSession, WorkoutCreatePayload } from "@jogmania/api-client";
import { useAuth } from "../../components/AuthProvider";
import { createApiClient } from "../../services/api";
import {
  formatInventoryLabel,
  getAdventureHeadline,
  getWorkoutProgression,
  getWorkoutWorldEvents,
  loadAdventureContext
} from "../../services/adventure";
import { elevationGainMeters, haversineMeters } from "../../services/geo";
import { createHealthKitService, resolveCaptureMode, type LocationPoint } from "../../services/healthkit";
import { getPhoneDevicePayload } from "../../services/devices";
import {
  listQueuedRuns,
  ownerIdFromToken,
  queueOfflineRun,
  readQueuedRunsForOwner,
  removeQueuedRun
} from "../../services/offlineRuns";

const CAPTURE_MODE = resolveCaptureMode();

function offlineCartridge(course: Route): AdventureCartridge {
  const seeds = [
    ["marquee", "A sign in the weeds", "A little neon sign flickers awake. It says ARCADE!", "marquee", "discovery"],
    ["prize-counter", "The rattling prize tin", "A brass token rolls out and lands in the prize tin.", "token", "collectible"],
    ["lantern-crew", "A tiny helper arrives", "A lantern mouse scampers alongside you. Very official.", "mouse", "companion"],
    ["arcade-lights", "The Lost Arcade", "The whole marquee bursts into color. The arcade is open again!", "arcade", "finish"]
  ] as const;
  return {
    id: `offline-${Date.now()}`,
    title: "Relight the Lost Arcade",
    world_name: "The Lost Arcade",
    course_name: course.name,
    intent: "surprise",
    opening_line: "A forgotten arcade sign blinks awake. A lantern mouse has volunteered as your guide.",
    finish_line: "Every light is on. Somewhere inside, a pinball machine just woke up.",
    events: seeds.map((seed, index) => ({
      id: seed[0],
      trigger_kind: "distance",
      trigger_value: Math.max(1, Math.round(Math.max(400, course.distance_m ?? 3200) * [0.18, 0.43, 0.72, 1.0][index])),
      kind: seed[4] as AdventureEvent["kind"],
      title: seed[1],
      message: seed[2],
      visual_key: seed[3],
      haptic: index === 3 ? "celebration" : index === 1 ? "success" : "tap"
    })),
    reward_preview: "An arcade light and a brass token",
    target_distance_m: Math.max(400, Math.round(course.distance_m ?? 3200)),
    haptics_enabled: true,
    health_data_enabled: false,
    intelligence: "fallback",
    runner_snapshot: {}
  };
}

type RunReport = {
  courseName: string;
  points: number;
  rewards: string[];
  inventory: Array<[string, number]>;
  worldEvents: string[];
};

export default function RunScreen() {
  const { token } = useAuth();
  const api = createApiClient(token ?? undefined);
  const [running, setRunning] = useState(false);
  const [points, setPoints] = useState<LocationPoint[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [distance, setDistance] = useState(0);
  const [courses, setCourses] = useState<Route[]>([]);
  const [partyId, setPartyId] = useState<string | null>(null);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [lastAdventure, setLastAdventure] = useState<AdventureSummary | null>(null);
  const [lastRunReport, setLastRunReport] = useState<RunReport | null>(null);
  const [cartridge, setCartridge] = useState<AdventureCartridge | null>(null);
  const [currentBeat, setCurrentBeat] = useState<AdventureEvent | null>(null);
  const [lastNarrative, setLastNarrative] = useState<AdventureSession | null>(null);
  const [queuedRunCount, setQueuedRunCount] = useState(0);
  const [syncingQueuedRuns, setSyncingQueuedRuns] = useState(false);
  const serviceRef = useRef(createHealthKitService(CAPTURE_MODE));
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const pointsRef = useRef<LocationPoint[]>([]);
  const lastPointRef = useRef<LocationPoint | null>(null);
  const distanceRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef<string | null>(null);
  const startClockRef = useRef<number | null>(null);
  const cartridgeRef = useRef<AdventureCartridge | null>(null);
  const eventLogRef = useRef<Array<{ id: string }>>([]);
  const cartridgeServerBackedRef = useRef(false);

  const selectedCourse = courses.find((route) => route.id === selectedCourseId) ?? null;

  const refreshQueuedRunCount = async () => {
    try {
      setQueuedRunCount((await listQueuedRuns()).length);
    } catch {
      setQueuedRunCount(0);
    }
  };

  const refreshAdventureContext = async () => {
    if (!token) {
      setCourses([]);
      setPartyId(null);
      setSelectedCourseId(null);
      return;
    }

    try {
      const context = await loadAdventureContext(api);
      setCourses(context.courses);
      setPartyId(context.party?.id ?? null);
      setSelectedCourseId((current) => {
        if (current && context.courses.some((route) => route.id === current)) {
          return current;
        }
        return context.activeCourse?.id ?? context.courses[0]?.id ?? null;
      });
    } catch (err) {
      setCourses([]);
      setPartyId(null);
      setSelectedCourseId(null);
      setError(err instanceof Error ? err.message : "Unable to load your adventure courses.");
    }
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
      void serviceRef.current.stopWorkout();
    };
  }, []);

  useEffect(() => {
    void refreshAdventureContext();
  }, [token]);

  useEffect(() => {
    void refreshQueuedRunCount();
  }, []);

  const syncQueuedRuns = async () => {
    if (!token || syncingQueuedRuns) return;
    setSyncingQueuedRuns(true);
    setError(null);
    const ownerId = ownerIdFromToken(token);
    try {
      const queued = await readQueuedRunsForOwner(ownerId);
      if (!queued.length) {
        setNotice("Saved runs belong to a different sign-in, or this token cannot identify its account.");
        await refreshQueuedRunCount();
        return;
      }
      let synced = 0;
      for (const run of queued) {
        await api.createWorkout(run.payload);
        await removeQueuedRun(run.id);
        synced += 1;
      }
      await refreshQueuedRunCount();
      setNotice(`${synced} saved ${synced === 1 ? "adventure is" : "adventures are"} back in the arcade.`);
      await refreshAdventureContext();
    } catch (err) {
      await refreshQueuedRunCount();
      setError(err instanceof Error ? err.message : "Could not sync saved runs. They are still on this phone.");
    } finally {
      setSyncingQueuedRuns(false);
    }
  };

  const startTimer = () => {
    startClockRef.current = Date.now();
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    timerRef.current = setInterval(() => {
      if (!startClockRef.current) return;
      setElapsed(Math.floor((Date.now() - startClockRef.current) / 1000));
    }, 1000);
  };

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    startClockRef.current = null;
  };

  const setActiveCourse = async (routeId: string) => {
    setSelectedCourseId(routeId);
    setError(null);

    const nextCourse = courses.find((route) => route.id === routeId);
    if (!token || !partyId) {
      if (nextCourse) {
        setNotice(`${nextCourse.name} will be used for your next run.`);
      }
      return;
    }

    try {
      await api.enterWorld(partyId, routeId);
      if (nextCourse) {
        setNotice(`${nextCourse.name} is now your active adventure course.`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not switch courses.");
    }
  };

  const startRun = async () => {
    setError(null);
    setNotice(null);
    setLastAdventure(null);
    setLastRunReport(null);
    setLastNarrative(null);
    setCurrentBeat(null);
    eventLogRef.current = [];
    cartridgeRef.current = null;
    cartridgeServerBackedRef.current = false;
    setCartridge(null);

    if (token && selectedCourse) {
      try {
        const mission = await api.createAdventureCartridge(selectedCourse.id, "surprise");
        cartridgeRef.current = mission;
        cartridgeServerBackedRef.current = true;
        setCartridge(mission);
        setNotice(mission.opening_line);
      } catch {
        const mission = offlineCartridge(selectedCourse);
        cartridgeRef.current = mission;
        cartridgeServerBackedRef.current = false;
        setCartridge(mission);
        setNotice("The Lost Arcade is waiting. Your run will still be saved if the story service is away.");
      }
    }

    const permitted = await serviceRef.current.getHealthPermission();
    if (!permitted) {
      setError("Location permission is required to capture a run.");
      return;
    }

    await serviceRef.current.startWorkout();
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }
    setPoints([]);
    pointsRef.current = [];
    lastPointRef.current = null;
    distanceRef.current = 0;
    startedAtRef.current = null;
    setDistance(0);
    setElapsed(0);
    setRunning(true);
    startTimer();

    unsubscribeRef.current = serviceRef.current.streamLocationPoints((point) => {
      if (!startedAtRef.current) {
        startedAtRef.current = point.timestamp;
      }
      if (lastPointRef.current) {
        distanceRef.current += haversineMeters(
          lastPointRef.current.lat,
          lastPointRef.current.lon,
          point.lat,
          point.lon
        );
        setDistance(distanceRef.current);
      }
      lastPointRef.current = point;
      const next = [...pointsRef.current, point];
      pointsRef.current = next;
      setPoints(next);
      const mission = cartridgeRef.current;
      if (mission) {
        for (const beat of mission.events) {
          if (beat.trigger_kind !== "distance" || distanceRef.current < beat.trigger_value) continue;
          if (eventLogRef.current.some((event) => event.id === beat.id)) continue;
          eventLogRef.current = [...eventLogRef.current, { id: beat.id }];
          setCurrentBeat(beat);
          if (mission.haptics_enabled) Vibration.vibrate(65);
        }
      }
    });
  };

  const stopRun = async () => {
    await serviceRef.current.stopWorkout();
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }
    setRunning(false);
    stopTimer();

    const captured = pointsRef.current;
    if (captured.length < 2) {
      setError("Not enough GPS points yet. Keep moving a little longer.");
      return;
    }

    const startedAt = startedAtRef.current ?? captured[0]?.timestamp ?? new Date().toISOString();
    const endedAt = captured[captured.length - 1]?.timestamp ?? new Date().toISOString();
    const duration = Math.max(
      1,
      (new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 1000
    );
    const pace = distanceRef.current > 0 ? duration / (distanceRef.current / 1000) : 0;
    const elevation = elevationGainMeters(captured);
    setElapsed(Math.round(duration));

    let queuedRunId: string;
    let payload: WorkoutCreatePayload;
    try {
      const device = await getPhoneDevicePayload();
      payload = {
        source: "ios",
        started_at: startedAt,
        ended_at: endedAt,
        duration_s: Math.round(duration),
        distance_m: distanceRef.current,
        avg_pace_s_per_km: pace,
        calories_kcal: CAPTURE_MODE === "mock" ? 320 : null,
        avg_hr: CAPTURE_MODE === "mock" ? 150 : null,
        elevation_gain_m: elevation,
        route_id: selectedCourse?.id ?? null,
        device_id: device.device_id,
        raw_payload_json: {
          capture_mode: CAPTURE_MODE,
          point_count: captured.length,
          device_id: device.device_id,
          course_id: selectedCourse?.id ?? null,
          course_name: selectedCourse?.name ?? null,
          ...(cartridgeRef.current && cartridgeServerBackedRef.current ? { adventure_session_id: cartridgeRef.current.id } : {}),
          adventure_events: eventLogRef.current
        },
        gps_points: captured
      };
      const queued = await queueOfflineRun(payload, ownerIdFromToken(token));
      queuedRunId = queued.id;
      await refreshQueuedRunCount();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not protect this run on the phone.");
      return;
    }

    if (!token) {
      setError("Your run is safe on this phone. Sign in, then sync saved adventures.");
      return;
    }

    try {
      const workout = await api.createWorkout(payload);
      await removeQueuedRun(queuedRunId);
      await refreshQueuedRunCount();

      const [progression, worldEvents, adventure] = await Promise.all([
        Promise.resolve(getWorkoutProgression(workout.raw_payload_json ?? undefined)),
        Promise.resolve(getWorkoutWorldEvents(workout.raw_payload_json ?? undefined)),
        api.getAdventuresByWorkout(workout.id).catch(() => null)
      ]);

      setLastAdventure(adventure);
      if (cartridgeRef.current && cartridgeServerBackedRef.current) {
        const session = await api.getAdventureSession(cartridgeRef.current.id).catch(() => null);
        setLastNarrative(session);
      }
      setLastRunReport({
        courseName: selectedCourse?.name ?? "Adventure Course",
        points: progression?.points ?? 0,
        rewards: progression?.rewards.map(formatInventoryLabel) ?? [],
        inventory: Object.entries(progression?.inventory ?? {}),
        worldEvents: worldEvents.map((event) => event.title)
      });
      setNotice(`${selectedCourse?.name ?? "Adventure course"} synced to your dashboard.`);
      setError(null);
      await refreshAdventureContext();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save run.";
      setError(`${message} Your run is safe on this phone; retry the saved adventure when you're back online.`);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 24 }}>
      <Text style={styles.title}>Capture Run</Text>
      <Text style={styles.subtitle}>
        {CAPTURE_MODE === "mock" ? "Simulated run mode for development." : "Live GPS capture on device."}
      </Text>
      <Text style={styles.mode}>Mode: {CAPTURE_MODE === "mock" ? "Mock" : "Live GPS"}</Text>
      {error && <Text style={styles.error}>{error}</Text>}
      {notice && <Text style={styles.notice}>{notice}</Text>}

      {queuedRunCount > 0 ? (
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Saved on this phone</Text>
          <Text style={styles.cardValue}>{queuedRunCount} {queuedRunCount === 1 ? "adventure" : "adventures"}</Text>
          <Text style={styles.cardHint}>Your GPS route and arcade moments stay encrypted here until their run can reach the arcade.</Text>
          {token ? (
            <Pressable style={[styles.button, styles.syncButton]} onPress={() => { void syncQueuedRuns(); }} disabled={syncingQueuedRuns}>
              <Text style={styles.buttonText}>{syncingQueuedRuns ? "Syncing saved runs…" : "Sync saved runs"}</Text>
            </Pressable>
          ) : <Text style={styles.cardHint}>Sign in with the same account to sync its saved adventures.</Text>}
        </View>
      ) : null}

      {(cartridge || currentBeat) ? (
        <View style={styles.arcadeCard}>
          <Text style={styles.arcadeKicker}>{cartridge?.world_name ?? "THE LOST ARCADE"} · FIELD ADVENTURE</Text>
          <Text style={styles.arcadeTitle}>{currentBeat?.title ?? cartridge?.title ?? "A secret is nearby"}</Text>
          <Text style={styles.arcadeCopy}>{currentBeat?.message ?? cartridge?.opening_line}</Text>
          <View style={styles.arcadeTrack}>
            <View style={[styles.arcadeFill, { width: `${Math.min(100, cartridge ? distance / cartridge.target_distance_m * 100 : 0)}%` }]} />
          </View>
          <Text style={styles.arcadeFoot}>{currentBeat ? "A little surprise found" : cartridge?.reward_preview}</Text>
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.cardLabel}>Adventure Course</Text>
        <Text style={styles.cardValue}>{selectedCourse?.name ?? "Loading courses..."}</Text>
        <Text style={styles.cardHint}>
          Phone and watch uploads will flow into the active course so the same world keeps advancing.
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.courseRail}>
          {courses.map((course) => {
            const selected = course.id === selectedCourseId;
            return (
              <Pressable
                key={course.id}
                style={[styles.courseChip, selected && styles.courseChipSelected]}
                onPress={() => {
                  void setActiveCourse(course.id);
                }}
              >
                <Text style={[styles.courseChipText, selected && styles.courseChipTextSelected]}>
                  {course.name}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {lastRunReport ? (
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Mission Report</Text>
          <Text style={styles.cardValue}>{getAdventureHeadline(lastAdventure)}</Text>
          {lastNarrative?.recap && typeof lastNarrative.recap.story === "string" ? (
            <>
              <Text style={styles.arcadeTitle}>{String(lastNarrative.recap.headline ?? "Adventure complete")}</Text>
              <Text style={styles.flavor}>{lastNarrative.recap.story}</Text>
              {typeof lastNarrative.recap.next_hook === "string" ? <Text style={styles.arcadeFoot}>Next: {lastNarrative.recap.next_hook}</Text> : null}
            </>
          ) : null}
          <Text style={styles.cardHint}>{lastRunReport.courseName}</Text>
          <Text style={styles.reportLine}>+{lastRunReport.points} arcade sparks</Text>
          {lastRunReport.rewards.length ? (
            <Text style={styles.reportLine}>Unlocked: {lastRunReport.rewards.join(", ")}</Text>
          ) : null}
          {lastRunReport.inventory.map(([itemKey, quantity]) => (
            <Text key={itemKey} style={styles.reportLine}>
              +{quantity} {formatInventoryLabel(itemKey)}
            </Text>
          ))}
          {lastRunReport.worldEvents.map((title) => (
            <Text key={title} style={styles.reportLine}>
              World event: {title}
            </Text>
          ))}
          {lastAdventure?.scenes[0] ? <Text style={styles.flavor}>{lastAdventure.scenes[0]}</Text> : null}
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.cardLabel}>Surprises found</Text>
        <Text style={styles.cardValue}>{eventLogRef.current.length}</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.cardLabel}>Distance</Text>
        <Text style={styles.cardValue}>{(distance / 1000).toFixed(2)} km</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.cardLabel}>Elapsed</Text>
        <Text style={styles.cardValue}>{Math.floor(elapsed / 60)} min</Text>
      </View>
      <Pressable style={[styles.button, running && styles.buttonStop]} onPress={running ? stopRun : startRun}>
        <Text style={styles.buttonText}>{running ? "Stop Run" : "Start Run"}</Text>
      </Pressable>
      <Text style={styles.note}>
        Runs sync to the web dashboard once saved. Use EXPO_PUBLIC_CAPTURE_MODE=mock to force simulated points.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0a0b12" },
  title: { fontSize: 28, color: "#f5f7ff", fontWeight: "700" },
  subtitle: { color: "#8a91b4", marginTop: 4, marginBottom: 16 },
  mode: { color: "#5cc7ff", marginBottom: 12, fontSize: 12 },
  error: { color: "#ff6b6b", marginBottom: 12, fontSize: 12 },
  notice: { color: "#37e6ff", marginBottom: 12, fontSize: 12 },
  arcadeCard: { backgroundColor: "#2a1245", borderRadius: 18, borderColor: "#37e6ff", borderWidth: 1, padding: 16, marginBottom: 14 },
  arcadeKicker: { color: "#37e6ff", fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  arcadeTitle: { color: "#ffd84d", fontSize: 18, fontWeight: "800", marginTop: 8 },
  arcadeCopy: { color: "#f5f7ff", fontSize: 13, lineHeight: 19, marginTop: 6 },
  arcadeTrack: { height: 8, borderRadius: 9, backgroundColor: "#120923", overflow: "hidden", marginTop: 12 },
  arcadeFill: { height: 8, borderRadius: 9, backgroundColor: "#1dffb2" },
  arcadeFoot: { color: "#aab5d5", fontSize: 11, marginTop: 7 },
  card: { backgroundColor: "#1a1f33", borderRadius: 16, padding: 16, marginBottom: 16 },
  cardLabel: { color: "#8a91b4", fontSize: 12, textTransform: "uppercase" },
  cardValue: { color: "#1dffb2", fontSize: 24, marginTop: 8 },
  cardHint: { color: "#8a91b4", fontSize: 12, marginTop: 8 },
  courseRail: { marginTop: 14 },
  courseChip: {
    borderWidth: 1,
    borderColor: "#2a324e",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginRight: 10
  },
  courseChipSelected: {
    backgroundColor: "#37e6ff",
    borderColor: "#37e6ff"
  },
  courseChipText: { color: "#f5f7ff", fontSize: 12, fontWeight: "600" },
  courseChipTextSelected: { color: "#0a0b12" },
  reportLine: { color: "#f5f7ff", fontSize: 13, marginTop: 8 },
  flavor: { color: "#8a91b4", fontSize: 12, marginTop: 10, lineHeight: 18 },
  button: { backgroundColor: "#37e6ff", padding: 14, borderRadius: 999, alignItems: "center" },
  syncButton: { marginTop: 14, backgroundColor: "#ffd84d" },
  buttonStop: { backgroundColor: "#ff3bc7" },
  buttonText: { color: "#0a0b12", fontWeight: "700" },
  note: { color: "#8a91b4", marginTop: 16, fontSize: 12 }
});
