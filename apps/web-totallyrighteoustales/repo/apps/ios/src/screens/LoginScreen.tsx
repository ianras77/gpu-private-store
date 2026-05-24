import { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet } from "react-native";
import { supabase } from "../lib/supabase";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSignIn() {
    setError(null);
    if (!email) return;
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: "totallyrighteoustales://" },
    });
    if (error) {
      setError(error.message);
      return;
    }
    setSent(true);
  }

  return (
    <View style={styles.screen}>
      <View style={styles.panel}>
        <Text style={styles.kicker}>Studio key</Text>
        <Text style={styles.title}>Open the press room</Text>
        <Text style={styles.copy}>
          We send one magic link. No password ceremony, just a door into your
          story studio.
        </Text>
        <TextInput
          style={styles.input}
          placeholder="you@legendary.world"
          placeholderTextColor="#766856"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <Pressable style={styles.button} onPress={handleSignIn}>
          <Text style={styles.buttonText}>Send magic link</Text>
        </Pressable>
        {sent && <Text style={styles.notice}>Check your inbox.</Text>}
        {error && <Text style={styles.error}>{error}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#f8f1df",
    padding: 18,
    justifyContent: "center",
  },
  panel: { gap: 12, backgroundColor: "#15120f", borderRadius: 8, padding: 20 },
  kicker: {
    color: "#d8a23f",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  title: { fontSize: 32, lineHeight: 34, fontWeight: "900", color: "#f8f1df" },
  copy: { color: "rgba(248,241,223,0.68)", lineHeight: 22 },
  input: {
    borderWidth: 1,
    borderColor: "rgba(248,241,223,0.2)",
    borderRadius: 8,
    padding: 12,
    backgroundColor: "rgba(248,241,223,0.08)",
    color: "#f8f1df",
  },
  button: { backgroundColor: "#c7472b", padding: 13, borderRadius: 8 },
  buttonText: { color: "#fffaf0", fontWeight: "900", textAlign: "center" },
  notice: { color: "#8ccdc5" },
  error: { color: "#ff9a81" },
});
