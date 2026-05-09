import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { AdventureSummary, Route } from "@jogmania/shared";
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

const CAPTURE_MODE = resolveCaptureMode();

type RunReport = {
  courseName: string;
  points: number;
  rewards: string[];
  inventory: Array<[string, number]>;
  worldEvents: string[];
  improvement: number | null;
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
  const serviceRef = useRef(createHealthKitService(CAPTURE_MODE));
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const pointsRef = useRef<LocationPoint[]>([]);
  const lastPointRef = useRef<LocationPoint | null>(null);
  const distanceRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef<string | null>(null);
  const startClockRef = useRef<number | null>(null);

  const selectedCourse = courses.find((route) => route.id === selectedCourseId) ?? null;
  const paceLive = distance > 0 && elapsed > 0 ? Math.round(elapsed / (distance / 1000)) : 0;

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

    if (!token) {
      setError("Sign in to save your run.");
      return;
    }

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

    try {
      const device = await getPhoneDevicePayload();
      const workout = await api.createWorkout({
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
          course_name: selectedCourse?.name ?? null
        },
        gps_points: captured
      });

      const [progression, worldEvents, adventure] = await Promise.all([
        Promise.resolve(getWorkoutProgression(workout.raw_payload_json ?? undefined)),
        Promise.resolve(getWorkoutWorldEvents(workout.raw_payload_json ?? undefined)),
        api.getAdventuresByWorkout(workout.id).catch(() => null)
      ]);

      setLastAdventure(adventure);
      setLastRunReport({
        courseName: selectedCourse?.name ?? "Adventure Course",
        points: progression?.points ?? 0,
        rewards: progression?.rewards.map(formatInventoryLabel) ?? [],
        inventory: Object.entries(progression?.inventory ?? {}),
        worldEvents: worldEvents.map((event) => event.title),
        improvement: progression?.improvement_s_per_km ?? null
      });
      setNotice(`${selectedCourse?.name ?? "Adventure course"} synced to your dashboard.`);
      setError(null);
      await refreshAdventureContext();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save run.";
      setError(message);
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
          <Text style={styles.cardHint}>{lastRunReport.courseName}</Text>
          <Text style={styles.reportLine}>+{lastRunReport.points} course points</Text>
          {lastRunReport.improvement && lastRunReport.improvement > 0 ? (
            <Text style={styles.reportLine}>
              Pace improved by {Math.round(lastRunReport.improvement)} s/km
            </Text>
          ) : null}
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
        <Text style={styles.cardLabel}>GPS Points</Text>
        <Text style={styles.cardValue}>{points.length}</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.cardLabel}>Distance</Text>
        <Text style={styles.cardValue}>{(distance / 1000).toFixed(2)} km</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.cardLabel}>Elapsed</Text>
        <Text style={styles.cardValue}>{Math.floor(elapsed / 60)} min</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.cardLabel}>Pace</Text>
        <Text style={styles.cardValue}>{paceLive ? `${paceLive} s/km` : "-"}</Text>
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
  buttonStop: { backgroundColor: "#ff3bc7" },
  buttonText: { color: "#0a0b12", fontWeight: "700" },
  note: { color: "#8a91b4", marginTop: 16, fontSize: 12 }
});
