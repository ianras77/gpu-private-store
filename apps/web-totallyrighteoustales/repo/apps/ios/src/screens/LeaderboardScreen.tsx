import { useEffect, useState } from "react";
import { View, Text, FlatList, StyleSheet } from "react-native";
import { fetchLeaderboard } from "../lib/api";

export default function LeaderboardScreen() {
  const [leaders, setLeaders] = useState<any[]>([]);

  useEffect(() => {
    fetchLeaderboard().then(setLeaders).catch(() => setLeaders([]));
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Leaderboard</Text>
      <FlatList
        data={leaders}
        keyExtractor={(item) => item.userId}
        renderItem={({ item, index }) => (
          <View style={styles.row}>
            <Text style={styles.rank}>#{index + 1}</Text>
            <Text style={styles.name}>{item.displayName || item.pseudonym}</Text>
            <Text style={styles.score}>{item.creditsTotal} credits</Text>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8f1e7", padding: 20, gap: 12 },
  title: { fontSize: 24, fontWeight: "700", color: "#2c1f1a" },
  row: {
    backgroundColor: "#fffaf2",
    borderRadius: 16,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10
  },
  rank: { color: "#8a7567", fontSize: 12 },
  name: { color: "#2c1f1a", fontWeight: "600", flex: 1, marginLeft: 10 },
  score: { color: "#5d4d45", fontSize: 12 }
});
