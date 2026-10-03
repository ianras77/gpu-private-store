import { useEffect, useState } from "react";
import { useRouter } from "expo-router";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import type { AdventureWorld, InventoryItem, Reward } from "@jogmania/api-client";
import type { AdventureSummary, Workout } from "@jogmania/shared";
import { useAuth } from "../../components/AuthProvider";
import { createApiClient } from "../../services/api";
import {
  formatInventoryLabel,
  getAdventureHeadline,
  getRewardCopy,
  loadAdventureContext
} from "../../services/adventure";

export default function HomeScreen() {
  const { token } = useAuth();
  const router = useRouter();
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [worldName, setWorldName] = useState<string | null>(null);
  const [courseName, setCourseName] = useState<string | null>(null);
  const [courseCount, setCourseCount] = useState(0);
  const [latestAdventure, setLatestAdventure] = useState<AdventureSummary | null>(null);
  const [world, setWorld] = useState<AdventureWorld | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshEpoch, setRefreshEpoch] = useState(0);

  useEffect(() => {
    if (!token) {
      setWorkouts([]);
      setRewards([]);
      setInventory([]);
      setWorldName(null);
      setCourseName(null);
      setCourseCount(0);
      setLatestAdventure(null);
      setWorld(null);
      setRefreshing(false);
      return;
    }

    let cancelled = false;
    const api = createApiClient(token);

    void Promise.all([
      api.listWorkouts(),
      api.getRewards(),
      api.getInventory(),
      loadAdventureContext(api),
      api.getAdventureWorld().catch(() => null)
    ])
      .then(async ([nextWorkouts, nextRewards, nextInventory, context, nextWorld]) => {
        if (cancelled) return;
        setWorkouts(nextWorkouts);
        setRewards(nextRewards);
        setInventory(nextInventory);
        setWorldName(context.party?.world?.name ?? null);
        setCourseName(context.activeCourse?.name ?? null);
        setCourseCount(context.courses.length);
        setWorld(nextWorld);

        if (!nextWorkouts[0]) {
          setLatestAdventure(null);
          return;
        }

        const adventure = await api.getAdventuresByWorkout(nextWorkouts[0].id).catch(() => null);
        if (cancelled) return;
        setLatestAdventure(adventure);
      })
      .catch(() => {
        if (cancelled) return;
        setWorkouts([]);
        setRewards([]);
        setInventory([]);
        setWorldName(null);
        setCourseName(null);
        setCourseCount(0);
        setLatestAdventure(null);
        setWorld(null);
      })
      .finally(() => {
        if (!cancelled) setRefreshing(false);
      });

    return () => {
      cancelled = true;
    };
  }, [token, refreshEpoch]);

  const distance = workouts.reduce((acc, workout) => acc + workout.distance_m, 0) / 1000;
  const arcadeTokens = inventory.find((item) => item.item_key === "arcade-token")?.quantity ?? 0;
  const latestRewards = rewards.slice(0, 3);
  const featuredInventory = inventory.slice(0, 4);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: 24 }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            setRefreshEpoch((epoch) => epoch + 1);
          }}
          tintColor="#1dffb2"
          colors={["#1dffb2"]}
        />
      }
    >
      <Text style={styles.title}>Arcade</Text>
      <Text style={styles.subtitle}>A tiny arcade gets brighter every time you head outside.</Text>
      <Pressable style={styles.playButton} onPress={() => router.push("/(tabs)/run")}>
        <Text style={styles.playButtonText}>Pick a course and play →</Text>
      </Pressable>

      <View style={styles.heroCard}>
        <Text style={styles.cardLabel}>YOUR OUTDOOR ARCADE</Text>
        <Text style={styles.heroTitle}>{worldName ?? "Arcade Vanguard"}</Text>
        <Text style={styles.heroMeta}>{world?.chapter ?? "Marquee Mystery"} · Level {world?.player_level ?? 1} · {world?.arcade?.runs ?? 0} adventures</Text>
        <Text style={styles.heroMeta}>Current trail: {courseName ?? "Loading..."}</Text>
        <View style={styles.lightsRow}>
          {(world?.arcade?.chapter_lights?.length ? world.arcade.chapter_lights : ["marquee waiting for its first spark"]).map((light) => (
            <Text key={light} style={styles.lightPill}>✦ {light}</Text>
          ))}
        </View>
        {world?.recent_adventures?.[0]?.recap && typeof world.recent_adventures[0].recap.story === "string" ? (
          <View style={styles.recapCard}>
            <Text style={styles.recapTitle}>{String(world.recent_adventures[0].recap.headline ?? "From the Worldkeeper")}</Text>
            <Text style={styles.heroFlavor}>{world.recent_adventures[0].recap.story}</Text>
            {typeof world.recent_adventures[0].recap.next_hook === "string" ? <Text style={styles.recapHook}>Next: {world.recent_adventures[0].recap.next_hook}</Text> : null}
          </View>
        ) : <Text style={styles.heroMeta}>Latest mission: {getAdventureHeadline(latestAdventure)}</Text>}
        {latestAdventure?.scenes[0] ? <Text style={styles.heroFlavor}>{latestAdventure.scenes[0]}</Text> : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>Distance Explored</Text>
        <Text style={styles.cardValue}>{distance.toFixed(1)} km</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.cardLabel}>Runs Logged</Text>
        <Text style={styles.cardValue}>{workouts.length}</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.cardLabel}>Arcade Tokens</Text>
        <Text style={styles.cardValue}>{arcadeTokens}</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.cardLabel}>Courses Ready</Text>
        <Text style={styles.cardValue}>{courseCount}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>Recent Rewards</Text>
        {latestRewards.map((reward) => {
          const copy = getRewardCopy(reward);
          return (
            <View key={reward.id} style={styles.listItem}>
              <Text style={styles.listText}>{copy.label}</Text>
              <Text style={styles.listMuted}>{copy.summary || reward.type}</Text>
            </View>
          );
        })}
        {latestRewards.length === 0 ? <Text style={styles.listMuted}>Your starter pack is standing by.</Text> : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>Inventory</Text>
        {featuredInventory.map((item) => (
          <View key={item.id} style={styles.listItem}>
            <Text style={styles.listText}>{formatInventoryLabel(item.item_key)}</Text>
            <Text style={styles.listMuted}>x{item.quantity}</Text>
          </View>
        ))}
        {featuredInventory.length === 0 ? <Text style={styles.listMuted}>No loot collected yet.</Text> : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>Recent Runs</Text>
        {workouts.slice(0, 3).map((run) => (
          <View key={run.id} style={styles.listItem}>
            <Text style={styles.listText}>{new Date(run.started_at).toLocaleDateString()}</Text>
            <Text style={styles.listMuted}>{(run.distance_m / 1000).toFixed(2)} km</Text>
          </View>
        ))}
        {workouts.length === 0 ? <Text style={styles.listMuted}>No runs yet.</Text> : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0a0b12" },
  title: { fontSize: 28, color: "#f5f7ff", fontWeight: "700" },
  subtitle: { color: "#8a91b4", marginTop: 4, marginBottom: 16 },
  playButton: { backgroundColor: "#1dffb2", borderRadius: 14, paddingHorizontal: 18, paddingVertical: 14, marginBottom: 16 },
  playButtonText: { color: "#07140f", fontSize: 15, fontWeight: "800", textAlign: "center" },
  heroCard: {
    backgroundColor: "#131a2d",
    borderRadius: 20,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#243050"
  },
  heroTitle: { color: "#1dffb2", fontSize: 24, marginTop: 8, fontWeight: "700" },
  heroMeta: { color: "#f5f7ff", fontSize: 13, marginTop: 8 },
  heroFlavor: { color: "#8a91b4", fontSize: 12, marginTop: 10, lineHeight: 18 },
  lightsRow: { flexDirection: "row", flexWrap: "wrap", marginTop: 12, gap: 6 },
  lightPill: { color: "#ffd84d", borderColor: "#635128", borderWidth: 1, borderRadius: 999, overflow: "hidden", paddingHorizontal: 9, paddingVertical: 5, fontSize: 10 },
  recapCard: { backgroundColor: "#0b1020", borderRadius: 14, borderWidth: 1, borderColor: "#51426c", marginTop: 14, padding: 12 },
  recapTitle: { color: "#ffd84d", fontWeight: "700" },
  recapHook: { color: "#37e6ff", fontSize: 11, marginTop: 8 },
  card: {
    backgroundColor: "#1a1f33",
    borderRadius: 16,
    padding: 16,
    marginBottom: 12
  },
  cardLabel: { color: "#8a91b4", fontSize: 12, textTransform: "uppercase" },
  cardValue: { color: "#37e6ff", fontSize: 24, marginTop: 8 },
  listItem: { marginTop: 10 },
  listText: { color: "#f5f7ff" },
  listMuted: { color: "#8a91b4", fontSize: 12, marginTop: 4 }
});
