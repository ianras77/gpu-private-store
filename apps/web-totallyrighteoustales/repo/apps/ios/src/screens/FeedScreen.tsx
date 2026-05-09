import { useContext, useEffect, useState } from "react";
import { View, Text, FlatList, Pressable, StyleSheet, RefreshControl, TextInput } from "react-native";
import { fetchTales } from "../lib/api";
import { AuthContext } from "../lib/auth";

type TaleSummary = {
  id: string;
  title: string;
  excerpt: string;
  authorPseudonym: string;
  createdAt: string;
  upvotes: number;
  downvotes: number;
};

export default function FeedScreen({ navigation }: { navigation: any }) {
  const { session, signOut } = useContext(AuthContext);
  const [tales, setTales] = useState<TaleSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [searchMode, setSearchMode] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const data = await fetchTales("hot");
      setTales(data);
    } catch (_err) {
      setTales([]);
    } finally {
      setLoading(false);
    }
  }

  async function runSearch() {
    if (!query.trim()) {
      setSearchMode(false);
      load();
      return;
    }
    setLoading(true);
    setSearchMode(true);
    try {
      const res = await fetch(
        `${process.env.EXPO_PUBLIC_API_URL || "http://localhost:4000"}/tales/search?query=${encodeURIComponent(
          query.trim()
        )}`
      );
      if (!res.ok) throw new Error("Search failed");
      const data = await res.json();
      setTales(data);
    } catch (_err) {
      setTales([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>The Scroll</Text>
      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search tales"
          value={query}
          onChangeText={setQuery}
        />
        <Pressable style={styles.searchButton} onPress={runSearch}>
          <Text style={styles.searchButtonText}>Search</Text>
        </Pressable>
      </View>
      {searchMode && (
        <Pressable style={styles.clearButton} onPress={() => { setQuery(""); setSearchMode(false); load(); }}>
          <Text style={styles.clearText}>Clear search</Text>
        </Pressable>
      )}
      <View style={styles.actions}>
        <Pressable style={styles.pill} onPress={() => navigation.navigate("Compose")}>
          <Text style={styles.pillText}>Compose</Text>
        </Pressable>
        <Pressable style={styles.pill} onPress={() => navigation.navigate("Leaderboard")}>
          <Text style={styles.pillText}>Leaderboard</Text>
        </Pressable>
        <Pressable style={styles.pill} onPress={() => navigation.navigate("Profile")}>
          <Text style={styles.pillText}>Profile</Text>
        </Pressable>
        {session ? (
          <Pressable style={styles.ghost} onPress={signOut}>
            <Text style={styles.ghostText}>Sign out</Text>
          </Pressable>
        ) : (
          <Pressable style={styles.ghost} onPress={() => navigation.navigate("Login")}>
            <Text style={styles.ghostText}>Sign in</Text>
          </Pressable>
        )}
      </View>
      <FlatList
        data={tales}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={searchMode ? runSearch : load} tintColor="#2c1f1a" />}
        renderItem={({ item }) => (
          <Pressable style={styles.card} onPress={() => navigation.navigate("Detail", { id: item.id })}>
            <Text style={styles.cardTitle}>{item.title}</Text>
            <Text style={styles.cardMeta}>{item.authorPseudonym}</Text>
            <Text numberOfLines={3} style={styles.cardExcerpt}>
              {item.excerpt}...
            </Text>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8f1e7", padding: 20, gap: 12 },
  title: { fontSize: 26, fontWeight: "700", color: "#2c1f1a" },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  searchRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  searchInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#d8c5b1",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "#fff"
  },
  searchButton: {
    backgroundColor: "#d96b3f",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999
  },
  searchButtonText: { color: "white", fontSize: 12, fontWeight: "600" },
  clearButton: { alignSelf: "flex-start" },
  clearText: { color: "#2f5d50", fontSize: 12 },
  pill: {
    borderWidth: 1,
    borderColor: "#d8c5b1",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999
  },
  pillText: { color: "#5d4d45", fontSize: 12 },
  ghost: { paddingHorizontal: 12, paddingVertical: 6 },
  ghostText: { color: "#d96b3f", fontSize: 12 },
  card: {
    backgroundColor: "#fffaf2",
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#2c1f1a",
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 }
  },
  cardTitle: { fontSize: 18, fontWeight: "700", color: "#2c1f1a" },
  cardMeta: { marginTop: 4, fontSize: 12, color: "#8a7567" },
  cardExcerpt: { marginTop: 8, fontSize: 14, color: "#5d4d45" }
});
