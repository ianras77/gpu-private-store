import { useContext, useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet, TextInput } from "react-native";
import { fetchProfile } from "../lib/api";
import { AuthContext } from "../lib/auth";

export default function ProfileScreen({ navigation }: { navigation: any }) {
  const { session, signOut } = useContext(AuthContext);
  const [profile, setProfile] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [tales, setTales] = useState<any[]>([]);

  useEffect(() => {
    async function load() {
      if (!session) {
        setError("Sign in to view your profile.");
        return;
      }
      try {
        const data = await fetchProfile(session.access_token);
        setProfile(data);
        setDisplayName(data.displayName || "");
        const talesRes = await fetch(`${process.env.EXPO_PUBLIC_API_URL || "http://localhost:4000"}/tales/mine`, {
          headers: { Authorization: `Bearer ${session.access_token}` }
        });
        if (talesRes.ok) {
          setTales(await talesRes.json());
        }
      } catch (_err) {
        setError("Unable to load profile.");
      }
    }

    load();
  }, [session]);

  if (error) {
    return (
      <View style={styles.container}>
        <Text style={styles.error}>{error}</Text>
        <Pressable style={styles.link} onPress={() => navigation.navigate("Login")}>
          <Text style={styles.linkText}>Go to login</Text>
        </Pressable>
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={styles.container}>
        <Text style={styles.meta}>Loading...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Your Legend</Text>
      <Text style={styles.meta}>Pseudonym: {profile.displayName || profile.pseudonym}</Text>
      <Text style={styles.meta}>Credits: {profile.creditsTotal}</Text>
      <Text style={styles.meta}>Role: {profile.role}</Text>
      <TextInput
        style={styles.input}
        placeholder="Optional display name"
        value={displayName}
        onChangeText={setDisplayName}
      />
      <Pressable
        style={styles.ghost}
        onPress={async () => {
          if (!session) return;
          setStatus(null);
          const res = await fetch(`${process.env.EXPO_PUBLIC_API_URL || "http://localhost:4000"}/me/display-name`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${session.access_token}`
            },
            body: JSON.stringify({ displayName: displayName || null })
          });
          if (res.ok) {
            const data = await res.json();
            setProfile(data);
            setStatus("Updated.");
          } else {
            setStatus("Update failed.");
          }
        }}
      >
        <Text style={styles.ghostText}>Save display name</Text>
      </Pressable>
      {status && <Text style={styles.notice}>{status}</Text>}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Your Tales</Text>
        {tales.map((tale) => (
          <View key={tale.id} style={styles.taleRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.taleTitle}>{tale.title}</Text>
              <Text style={styles.taleMeta}>{tale.status}</Text>
            </View>
            {tale.status === "NEEDS_EDITS" && (
              <Pressable style={styles.editButton} onPress={() => navigation.navigate("EditTale", { id: tale.id })}>
                <Text style={styles.editButtonText}>Edit</Text>
              </Pressable>
            )}
          </View>
        ))}
        {tales.length === 0 && <Text style={styles.meta}>No tales yet.</Text>}
      </View>
      <Pressable style={styles.button} onPress={signOut}>
        <Text style={styles.buttonText}>Sign out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8f1e7", padding: 20, gap: 10 },
  title: { fontSize: 24, fontWeight: "700", color: "#2c1f1a" },
  meta: { fontSize: 14, color: "#5d4d45" },
  input: {
    borderWidth: 1,
    borderColor: "#d8c5b1",
    borderRadius: 12,
    padding: 10,
    backgroundColor: "#fff",
    marginTop: 10
  },
  ghost: { borderWidth: 1, borderColor: "#d8c5b1", padding: 10, borderRadius: 999 },
  ghostText: { color: "#5d4d45", fontSize: 12, textAlign: "center" },
  notice: { color: "#2f5d50", fontSize: 12 },
  button: { marginTop: 10, backgroundColor: "#d96b3f", padding: 12, borderRadius: 999 },
  buttonText: { color: "white", fontWeight: "600", textAlign: "center" },
  section: { marginTop: 16, gap: 8 },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: "#2c1f1a" },
  taleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#fffaf2",
    borderRadius: 12,
    padding: 10
  },
  taleTitle: { color: "#2c1f1a", fontWeight: "600" },
  taleMeta: { color: "#8a7567", fontSize: 12 },
  editButton: { backgroundColor: "#d96b3f", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  editButtonText: { color: "white", fontSize: 12 },
  link: { marginTop: 10 },
  linkText: { color: "#2f5d50" },
  error: { color: "#b4533c" }
});
