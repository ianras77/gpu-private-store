import { useContext, useEffect, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  TextInput,
  ScrollView,
} from "react-native";
import {
  fetchMyTales,
  fetchProfile,
  updateProfile,
  type TaleSummary,
} from "../lib/api";
import { AuthContext } from "../lib/auth";

export default function ProfileScreen({ navigation }: { navigation: any }) {
  const { session, signOut } = useContext(AuthContext);
  const [profile, setProfile] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [tales, setTales] = useState<TaleSummary[]>([]);

  async function load() {
    if (!session) {
      setError("Sign in to open your studio.");
      return;
    }
    try {
      const [data, mine] = await Promise.all([
        fetchProfile(session.access_token),
        fetchMyTales(session.access_token),
      ]);
      setProfile(data);
      setDisplayName(data.displayName || "");
      setBio(data.bio || "");
      setTales(mine);
      setError(null);
    } catch (_err) {
      setError("Unable to load profile.");
    }
  }

  useEffect(() => {
    load();
  }, [session]);

  async function save() {
    if (!session) return;
    setStatus(null);
    try {
      const updated = await updateProfile({
        displayName: displayName || null,
        bio: bio || null,
        token: session.access_token,
      });
      setProfile(updated);
      setStatus("Studio profile saved.");
    } catch (_err) {
      setStatus("Update failed.");
    }
  }

  if (error) {
    return (
      <View style={styles.container}>
        <Text style={styles.error}>{error}</Text>
        <Pressable
          style={styles.primary}
          onPress={() => navigation.navigate("Login")}
        >
          <Text style={styles.primaryText}>Go to login</Text>
        </Pressable>
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={styles.container}>
        <Text style={styles.meta}>Loading studio...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: 34 }}
    >
      <Text style={styles.kicker}>Story studio</Text>
      <Text style={styles.title}>
        {profile.displayName || profile.pseudonym}
      </Text>
      <Text style={styles.copy}>
        {profile.creditsTotal} cred / {profile.role}
      </Text>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Public mark</Text>
        <TextInput
          style={styles.input}
          placeholder="Storyteller name"
          placeholderTextColor="#766856"
          value={displayName}
          onChangeText={setDisplayName}
        />
        <TextInput
          style={[styles.input, styles.bio]}
          placeholder="Short bio"
          placeholderTextColor="#766856"
          value={bio}
          onChangeText={setBio}
          multiline
        />
        <Pressable style={styles.primary} onPress={save}>
          <Text style={styles.primaryText}>Save studio</Text>
        </Pressable>
        {status && <Text style={styles.notice}>{status}</Text>}
      </View>

      <View style={styles.panelDark}>
        <Text style={styles.panelTitleDark}>Your sheets</Text>
        {tales.length === 0 && (
          <Text style={styles.darkCopy}>No tales yet.</Text>
        )}
        {tales.map((tale) => (
          <View key={tale.id} style={styles.taleRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.taleTitle}>{tale.title}</Text>
              <Text style={styles.taleMeta}>
                {tale.status} / {tale.upvotes} hearts
              </Text>
            </View>
            {tale.status === "NEEDS_EDITS" && (
              <Pressable
                style={styles.smallButton}
                onPress={() => navigation.navigate("EditTale", { id: tale.id })}
              >
                <Text style={styles.smallButtonText}>Edit</Text>
              </Pressable>
            )}
          </View>
        ))}
      </View>

      <Pressable style={styles.secondary} onPress={signOut}>
        <Text style={styles.secondaryText}>Sign out</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8f1df", padding: 18 },
  kicker: {
    color: "#c7472b",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  title: {
    fontSize: 34,
    lineHeight: 36,
    fontWeight: "900",
    color: "#15120f",
    marginTop: 4,
  },
  copy: { color: "#5f5344", lineHeight: 22, marginTop: 8, marginBottom: 14 },
  meta: { color: "#5f5344" },
  panel: {
    backgroundColor: "#fffaf0",
    borderWidth: 1,
    borderColor: "#d2c09b",
    borderRadius: 8,
    padding: 14,
    gap: 10,
    marginBottom: 14,
  },
  panelDark: {
    backgroundColor: "#15120f",
    borderRadius: 8,
    padding: 14,
    gap: 10,
    marginBottom: 14,
  },
  panelTitle: { color: "#15120f", fontSize: 18, fontWeight: "900" },
  panelTitleDark: { color: "#f8f1df", fontSize: 20, fontWeight: "900" },
  input: {
    borderWidth: 1,
    borderColor: "#d2c09b",
    borderRadius: 8,
    padding: 11,
    backgroundColor: "#f8f1df",
    color: "#15120f",
  },
  bio: { minHeight: 86, textAlignVertical: "top" },
  primary: {
    backgroundColor: "#c7472b",
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  primaryText: { color: "#fffaf0", fontWeight: "900" },
  secondary: {
    borderWidth: 1,
    borderColor: "#d2c09b",
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  secondaryText: { color: "#5f5344", fontWeight: "800" },
  notice: { color: "#2f7d73" },
  darkCopy: { color: "rgba(248,241,223,0.66)" },
  taleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "rgba(248,241,223,0.12)",
    borderRadius: 8,
    padding: 10,
  },
  taleTitle: { color: "#f8f1df", fontWeight: "800" },
  taleMeta: { color: "rgba(248,241,223,0.58)", fontSize: 12, marginTop: 3 },
  smallButton: {
    backgroundColor: "#d8a23f",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  smallButtonText: { color: "#15120f", fontWeight: "900" },
  error: { color: "#c7472b", marginBottom: 12 },
});
