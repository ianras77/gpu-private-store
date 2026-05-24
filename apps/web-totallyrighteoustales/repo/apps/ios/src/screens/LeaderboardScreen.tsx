import { useEffect, useState } from "react";
import { View, Text, FlatList, StyleSheet } from "react-native";
import { fetchLeaderboard, type LeaderboardData } from "../lib/api";

export default function LeaderboardScreen() {
  const [data, setData] = useState<LeaderboardData>({
    storytellers: [],
    stories: [],
  });

  useEffect(() => {
    fetchLeaderboard()
      .then(setData)
      .catch(() => setData({ storytellers: [], stories: [] }));
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.kicker}>Hall of type</Text>
      <Text style={styles.title}>The sheets with heat</Text>
      <FlatList
        data={data.storytellers}
        keyExtractor={(item) => item.userId}
        ListEmptyComponent={
          <Text style={styles.copy}>No storyteller rankings yet.</Text>
        }
        renderItem={({ item, index }) => (
          <View style={styles.row}>
            <Text style={styles.rank}>#{index + 1}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{item.displayName}</Text>
              <Text style={styles.meta}>
                {item.storyCount} stories / {item.totalHearts} hearts
              </Text>
            </View>
            <Text style={styles.score}>{item.creditsTotal}</Text>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8f1df", padding: 18, gap: 12 },
  kicker: {
    color: "#c7472b",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  title: { fontSize: 34, lineHeight: 36, fontWeight: "900", color: "#15120f" },
  copy: { color: "#5f5344", lineHeight: 22 },
  row: {
    backgroundColor: "#fffaf0",
    borderWidth: 1,
    borderColor: "#d2c09b",
    borderRadius: 8,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 10,
  },
  rank: { color: "#8a4a31", fontSize: 12, fontWeight: "900" },
  name: { color: "#15120f", fontWeight: "900", fontSize: 16 },
  meta: { color: "#5f5344", fontSize: 12, marginTop: 3 },
  score: { color: "#c7472b", fontSize: 18, fontWeight: "900" },
});
