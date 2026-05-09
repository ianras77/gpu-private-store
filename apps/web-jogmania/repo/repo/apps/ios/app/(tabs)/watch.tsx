import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { AdventureSummary } from "@jogmania/shared";
import { useAuth } from "../../components/AuthProvider";
import { createApiClient } from "../../services/api";
import {
  formatInventoryLabel,
  getAdventureHeadline,
  getWorkoutProgression,
  getWorkoutWorldEvents,
  loadAdventureContext
} from "../../services/adventure";
import { getWatchDevicePayload } from "../../services/devices";
import { buildMockWatchWorkout } from "../../services/watch";

type SyncReport = {
  courseName: string;
  points: number;
  rewards: string[];
  inventory: Array<[string, number]>;
  worldEvents: string[];
};

export default function WatchScreen() {
  const { token } = useAuth();
  const api = createApiClient(token ?? undefined);
  const [status, setStatus] = useState<"idle" | "syncing" | "done" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [partyId, setPartyId] = useState<string | null>(null);
  const [courseId, setCourseId] = useState<string | null>(null);
  const [courseName, setCourseName] = useState<string | null>(null);
  const [latestAdventure, setLatestAdventure] = useState<AdventureSummary | null>(null);
  const [report, setReport] = useState<SyncReport | null>(null);

  useEffect(() => {
    if (!token) {
      setPartyId(null);
      setCourseId(null);
      setCourseName(null);
      return;
    }

    let cancelled = false;
    api
      .listParties()
      .then(async (parties) => {
        if (cancelled) return;
        const context = await loadAdventureContext(api);
        if (cancelled) return;
        setPartyId(context.party?.id ?? parties[0]?.id ?? null);
        setCourseId(context.activeCourse?.id ?? null);
        setCourseName(context.activeCourse?.name ?? null);
      })
      .catch(() => {
        if (cancelled) return;
        setPartyId(null);
        setCourseId(null);
        setCourseName(null);
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  const syncMockWorkout = async () => {
    if (!token) {
      setStatus("error");
      setMessage("Sign in to sync watch data.");
      return;
    }

    setStatus("syncing");
    setMessage(null);
    setLatestAdventure(null);
    setReport(null);

    try {
      const device = await getWatchDevicePayload();
      if (partyId && courseId) {
        await api.enterWorld(partyId, courseId);
      }
      await api.registerDevice(device);
      const payload = buildMockWatchWorkout();
      const workout = await api.createWorkout({
        ...payload,
        route_id: courseId,
        device_id: device.device_id,
        raw_payload_json: {
          ...(payload.raw_payload_json ?? {}),
          device_id: device.device_id,
          companion_device_id: device.companion_device_id,
          synced_via: "ios",
          course_id: courseId,
          course_name: courseName
        }
      });

      const [progression, worldEvents, adventure] = await Promise.all([
        Promise.resolve(getWorkoutProgression(workout.raw_payload_json ?? undefined)),
        Promise.resolve(getWorkoutWorldEvents(workout.raw_payload_json ?? undefined)),
        api.getAdventuresByWorkout(workout.id).catch(() => null)
      ]);

      setLatestAdventure(adventure);
      setReport({
        courseName: courseName ?? "Adventure Course",
        points: progression?.points ?? 0,
        rewards: progression?.rewards.map(formatInventoryLabel) ?? [],
        inventory: Object.entries(progression?.inventory ?? {}),
        worldEvents: worldEvents.map((event) => event.title)
      });
      setStatus("done");
      setMessage("Watch run uploaded, linked, and pushed into your active course.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to sync.";
      setStatus("error");
      setMessage(msg);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 24 }}>
      <Text style={styles.title}>Watch Sync</Text>
      <Text style={styles.subtitle}>
        This is a simulated Apple Watch pipeline until the native watchOS target is ready.
      </Text>
      <View style={styles.card}>
        <Text style={styles.cardLabel}>Active Course</Text>
        <Text style={styles.cardValue}>{courseName ?? "Loading your world..."}</Text>
        <Text style={styles.message}>
          Synced watch runs inherit the same course as the phone app so rewards and world events stay unified.
        </Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.cardLabel}>Status</Text>
        <Text style={styles.cardValue}>
          {status === "idle" && "Ready"}
          {status === "syncing" && "Syncing..."}
          {status === "done" && "Synced"}
          {status === "error" && "Error"}
        </Text>
        {message && <Text style={styles.message}>{message}</Text>}
      </View>
      {report ? (
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Watch Mission</Text>
          <Text style={styles.cardValue}>{getAdventureHeadline(latestAdventure)}</Text>
          <Text style={styles.message}>{report.courseName}</Text>
          <Text style={styles.reportLine}>+{report.points} course points</Text>
          {report.rewards.length ? (
            <Text style={styles.reportLine}>Unlocked: {report.rewards.join(", ")}</Text>
          ) : null}
          {report.inventory.map(([itemKey, quantity]) => (
            <Text key={itemKey} style={styles.reportLine}>
              +{quantity} {formatInventoryLabel(itemKey)}
            </Text>
          ))}
          {report.worldEvents.map((title) => (
            <Text key={title} style={styles.reportLine}>
              World event: {title}
            </Text>
          ))}
          {latestAdventure?.scenes[0] ? <Text style={styles.message}>{latestAdventure.scenes[0]}</Text> : null}
        </View>
      ) : null}
      <Pressable style={styles.button} onPress={syncMockWorkout}>
        <Text style={styles.buttonText}>Sync Demo Watch Run</Text>
      </Pressable>
      <Text style={styles.note}>
        The sync also registers a linked watch profile so your account can track handset-to-watch status.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0a0b12" },
  title: { fontSize: 28, color: "#f5f7ff", fontWeight: "700" },
  subtitle: { color: "#8a91b4", marginTop: 4, marginBottom: 16 },
  card: { backgroundColor: "#1a1f33", borderRadius: 16, padding: 16, marginBottom: 16 },
  cardLabel: { color: "#8a91b4", fontSize: 12, textTransform: "uppercase" },
  cardValue: { color: "#37e6ff", fontSize: 20, marginTop: 8 },
  message: { color: "#8a91b4", marginTop: 8, fontSize: 12, lineHeight: 18 },
  reportLine: { color: "#f5f7ff", fontSize: 13, marginTop: 8 },
  button: { backgroundColor: "#37e6ff", padding: 14, borderRadius: 999, alignItems: "center" },
  buttonText: { color: "#0a0b12", fontWeight: "700" },
  note: { color: "#8a91b4", marginTop: 16, fontSize: 12 }
});
