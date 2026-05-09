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
      options: { emailRedirectTo: "totallyrighteoustales://" }
    });
    if (error) {
      setError(error.message);
      return;
    }
    setSent(true);
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Enter the Commons</Text>
      <Text style={styles.subtitle}>We send a magic link to your email.</Text>
      <TextInput
        style={styles.input}
        placeholder="you@legendary.world"
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
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
    backgroundColor: "#fffaf2",
    borderRadius: 20,
    padding: 20
  },
  title: { fontSize: 22, fontWeight: "700", color: "#2c1f1a" },
  subtitle: { fontSize: 14, color: "#5d4d45" },
  input: {
    borderWidth: 1,
    borderColor: "#d8c5b1",
    borderRadius: 12,
    padding: 10,
    backgroundColor: "#fff"
  },
  button: {
    backgroundColor: "#d96b3f",
    padding: 12,
    borderRadius: 999
  },
  buttonText: { color: "white", fontWeight: "600", textAlign: "center" },
  notice: { color: "#2f5d50" },
  error: { color: "#b4533c" }
});
