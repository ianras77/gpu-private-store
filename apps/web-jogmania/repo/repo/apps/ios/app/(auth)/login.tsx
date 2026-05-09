import { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "../../components/AuthProvider";

export default function LoginScreen() {
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const handleLogin = async () => {
    try {
      setError(null);
      setNotice(null);
      const res = await login(email, password);
      if (res.requires_verification) {
        setNotice(res.message ?? "Check your inbox to verify your account before signing in.");
        return;
      }
      if (!res.access_token) {
        setError(res.message ?? "Login failed. Try again.");
        return;
      }
      router.replace("/(tabs)/home");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed. Try again.");
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Jogmania</Text>
      <Text style={styles.subtitle}>Neon fitness adventures await.</Text>
      {error && <Text style={styles.error}>{error}</Text>}
      {notice && <Text style={styles.notice}>{notice}</Text>}
      <TextInput
        placeholder="Email"
        placeholderTextColor="#8a91b4"
        style={styles.input}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
      />
      <TextInput
        placeholder="Password"
        placeholderTextColor="#8a91b4"
        style={styles.input}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />
      <Pressable style={styles.button} onPress={handleLogin}>
        <Text style={styles.buttonText}>Sign in</Text>
      </Pressable>
      <Pressable onPress={() => router.push("/(auth)/register")}>
        <Text style={styles.link}>Create account</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0a0b12", padding: 24, justifyContent: "center" },
  title: { fontSize: 32, color: "#37e6ff", fontWeight: "700" },
  subtitle: { color: "#f5f7ff", marginTop: 8, marginBottom: 24 },
  input: {
    backgroundColor: "#1a1f33",
    color: "#f5f7ff",
    padding: 12,
    borderRadius: 12,
    marginBottom: 12
  },
  button: { backgroundColor: "#ff3bc7", padding: 14, borderRadius: 999, alignItems: "center", marginTop: 8 },
  buttonText: { color: "#0a0b12", fontWeight: "700" },
  link: { color: "#1dffb2", marginTop: 16 },
  error: { color: "#ff3bc7", marginBottom: 12 },
  notice: { color: "#37e6ff", marginBottom: 12 }
});
