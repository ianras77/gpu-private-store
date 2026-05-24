import { useContext, useEffect, useState } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet } from "react-native";
import { fetchTale, heartTale } from "../lib/api";
import { AuthContext } from "../lib/auth";

export default function DetailScreen({
  route,
  navigation,
}: {
  route: any;
  navigation: any;
}) {
  const { session } = useContext(AuthContext);
  const [tale, setTale] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const data = await fetchTale(route.params.id, session?.access_token);
      setTale(data);
      setError(null);
    } catch (_err) {
      setError("Unable to load tale.");
    }
  }

  useEffect(() => {
    load();
  }, [route.params.id, session?.access_token]);

  async function handleHeart() {
    if (!session) {
      navigation.navigate("Login");
      return;
    }
    try {
      const result = await heartTale({
        id: route.params.id,
        token: session.access_token,
      });
      setTale((prev: any) => ({ ...prev, ...result }));
    } catch (_err) {
      setError("Unable to heart this tale.");
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
        <Text style={styles.meta}>Loading sheet...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: 34 }}
    >
      <Text style={styles.meta}>
        {tale.assistMode === "STUDIO" ? "STUDIO NOTES" : "HAND-LED"} /{" "}
        {tale.authorPseudonym}
      </Text>
      <Text style={styles.title}>{tale.title}</Text>
      {tale.storyPrompt && (
        <Text style={styles.prompt}>{tale.storyPrompt}</Text>
      )}
      <Text style={styles.body}>{tale.body}</Text>
      <Pressable style={styles.heart} onPress={handleHeart}>
        <Text style={styles.heartText}>Heart this sheet / {tale.upvotes}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8f1df", padding: 20 },
  meta: {
    fontSize: 11,
    color: "#8a4a31",
    textTransform: "uppercase",
    letterSpacing: 1.5,
    fontWeight: "800",
  },
  title: {
    fontSize: 36,
    lineHeight: 38,
    fontWeight: "900",
    color: "#15120f",
    marginTop: 12,
  },
  prompt: {
    marginTop: 18,
    padding: 12,
    borderWidth: 1,
    borderColor: "#d8a23f",
    borderRadius: 8,
    color: "#5f5344",
    lineHeight: 20,
    backgroundColor: "#fff3cf",
  },
  body: { fontSize: 17, color: "#30271f", marginTop: 20, lineHeight: 27 },
  heart: {
    marginTop: 22,
    backgroundColor: "#15120f",
    padding: 14,
    borderRadius: 8,
    alignItems: "center",
  },
  heartText: { color: "#f8f1df", fontWeight: "900" },
  error: { color: "#c7472b", fontWeight: "700" },
});
