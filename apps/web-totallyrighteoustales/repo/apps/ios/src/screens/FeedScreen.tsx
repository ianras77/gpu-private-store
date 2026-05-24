import { useContext, useEffect, useState } from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  RefreshControl,
  TextInput,
} from "react-native";
import { fetchTales, searchTales, type TaleSummary } from "../lib/api";
import { AuthContext } from "../lib/auth";

export default function FeedScreen({ navigation }: { navigation: any }) {
  const { session, signOut } = useContext(AuthContext);
  const [tales, setTales] = useState<TaleSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("hot");

  async function load(nextSort = sort) {
    setLoading(true);
    try {
      const data = query.trim()
        ? await searchTales(query.trim())
        : await fetchTales(nextSort);
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

  function setSortAndLoad(nextSort: string) {
    setSort(nextSort);
    setQuery("");
    load(nextSort);
  }

  return (
    <View style={styles.container}>
      <Text style={styles.kicker}>Totally Righteous Tales</Text>
      <Text style={styles.title}>Modern Gutenberg stories</Text>
      <Text style={styles.copy}>
        Read crafted tall tales, then set your own type when a story starts
        knocking.
      </Text>

      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search mood or wonder"
          placeholderTextColor="#766856"
          value={query}
          onChangeText={setQuery}
        />
        <Pressable style={styles.primary} onPress={() => load()}>
          <Text style={styles.primaryText}>Search</Text>
        </Pressable>
      </View>

      <View style={styles.actions}>
        {["hot", "new", "top"].map((item) => (
          <Pressable
            key={item}
            style={[styles.tab, sort === item && styles.tabActive]}
            onPress={() => setSortAndLoad(item)}
          >
            <Text
              style={[styles.tabText, sort === item && styles.tabTextActive]}
            >
              {item.toUpperCase()}
            </Text>
          </Pressable>
        ))}
        <Pressable
          style={styles.tab}
          onPress={() => navigation.navigate("Compose")}
        >
          <Text style={styles.tabText}>SET TYPE</Text>
        </Pressable>
        <Pressable
          style={styles.tab}
          onPress={() => navigation.navigate("Profile")}
        >
          <Text style={styles.tabText}>STUDIO</Text>
        </Pressable>
        {session ? (
          <Pressable style={styles.linkButton} onPress={signOut}>
            <Text style={styles.linkText}>Sign out</Text>
          </Pressable>
        ) : (
          <Pressable
            style={styles.linkButton}
            onPress={() => navigation.navigate("Login")}
          >
            <Text style={styles.linkText}>Sign in</Text>
          </Pressable>
        )}
      </View>

      <FlatList
        data={tales}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={() => load()}
            tintColor="#15120f"
          />
        }
        renderItem={({ item }) => (
          <Pressable
            style={styles.card}
            onPress={() => navigation.navigate("Detail", { id: item.id })}
          >
            <View style={styles.cardTop}>
              <Text style={styles.tag}>
                {item.assistMode === "STUDIO" ? "STUDIO NOTES" : "HAND-LED"}
              </Text>
              <Text style={styles.tag}>{item.upvotes} HEARTS</Text>
            </View>
            <Text style={styles.cardTitle}>{item.title}</Text>
            <Text style={styles.cardMeta}>{item.authorPseudonym}</Text>
            <Text numberOfLines={4} style={styles.cardExcerpt}>
              {item.excerpt}...
            </Text>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8f1df", padding: 18, gap: 10 },
  kicker: {
    color: "#c7472b",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  title: { fontSize: 34, lineHeight: 36, fontWeight: "900", color: "#15120f" },
  copy: { color: "#5f5344", lineHeight: 22, marginBottom: 4 },
  searchRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  searchInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#d2c09b",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#fffaf0",
    color: "#15120f",
  },
  primary: {
    backgroundColor: "#c7472b",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 8,
  },
  primaryText: { color: "#fffaf0", fontSize: 12, fontWeight: "800" },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tab: {
    borderWidth: 1,
    borderColor: "#d2c09b",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: "rgba(255,250,240,0.7)",
  },
  tabActive: { backgroundColor: "#15120f", borderColor: "#15120f" },
  tabText: {
    color: "#5f5344",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  tabTextActive: { color: "#f8f1df" },
  linkButton: { paddingHorizontal: 8, paddingVertical: 8 },
  linkText: { color: "#c7472b", fontSize: 12, fontWeight: "700" },
  card: {
    backgroundColor: "#fffaf0",
    borderWidth: 1,
    borderColor: "#d2c09b",
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#15120f",
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  cardTop: { flexDirection: "row", gap: 8, marginBottom: 10 },
  tag: {
    borderWidth: 1,
    borderColor: "#d2c09b",
    borderRadius: 5,
    paddingHorizontal: 7,
    paddingVertical: 4,
    color: "#5f5344",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1,
  },
  cardTitle: {
    fontSize: 22,
    lineHeight: 25,
    fontWeight: "900",
    color: "#15120f",
  },
  cardMeta: { marginTop: 6, fontSize: 12, color: "#8a4a31", fontWeight: "700" },
  cardExcerpt: {
    marginTop: 10,
    fontSize: 14,
    lineHeight: 21,
    color: "#5f5344",
  },
});
