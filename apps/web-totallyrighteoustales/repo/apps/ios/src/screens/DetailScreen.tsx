import { useContext, useEffect, useState } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet } from "react-native";
import { fetchTale, voteTale } from "../lib/api";
import { AuthContext } from "../lib/auth";

export default function DetailScreen({ route }: { route: any }) {
  const { session } = useContext(AuthContext);
  const [tale, setTale] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const token = session?.access_token;
      const data = await fetchTale(route.params.id, token);
      setTale(data);
    } catch (_err) {
      setError("Unable to load tale.");
    }
  }

  useEffect(() => {
    load();
  }, [route.params.id, session?.access_token]);

  async function handleVote(value: 1 | -1) {
    if (!session) {
      setError("Sign in to vote.");
      return;
    }
    try {
      const result = await voteTale({ id: route.params.id, value, token: session.access_token });
      setTale((prev: any) => ({ ...prev, ...result }));
    } catch (_err) {
      setError("Unable to vote.");
    }
  }

  if (error) {
    return (
      <View style={styles.container}>
        <Text style={styles.error}>{error}</Text>
      </View>
    );
  }

  if (!tale) {
    return (
      <View style={styles.container}>
        <Text style={styles.meta}>Loading...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 32 }}>
      <Text style={styles.meta}>{tale.authorPseudonym}</Text>
      <Text style={styles.title}>{tale.title}</Text>
      <Text style={styles.body}>{tale.body}</Text>
      <View style={styles.voteRow}>
        <Pressable style={styles.voteButton} onPress={() => handleVote(1)}>
          <Text style={styles.voteText}>▲ {tale.upvotes}</Text>
        </Pressable>
        <Pressable style={styles.voteButton} onPress={() => handleVote(-1)}>
          <Text style={styles.voteText}>▼ {tale.downvotes}</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8f1e7", padding: 20 },
  meta: { fontSize: 12, color: "#8a7567", textTransform: "uppercase", letterSpacing: 2 },
  title: { fontSize: 26, fontWeight: "700", color: "#2c1f1a", marginTop: 10 },
  body: { fontSize: 16, color: "#4a3a33", marginTop: 16, lineHeight: 22 },
  voteRow: { flexDirection: "row", gap: 10, marginTop: 20 },
  voteButton: {
    borderWidth: 1,
    borderColor: "#d8c5b1",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999
  },
  voteText: { color: "#5d4d45" },
  error: { color: "#b4533c" }
});
