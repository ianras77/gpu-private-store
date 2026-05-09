import { useContext, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView } from "react-native";
import { Audio } from "expo-av";
import { createTale, polishStory, transcribeAudio } from "../lib/api";
import { AuthContext } from "../lib/auth";

export default function ComposeScreen() {
  const { session } = useContext(AuthContext);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [polishing, setPolishing] = useState(false);
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [transcribing, setTranscribing] = useState(false);

  async function handleSubmit() {
    if (!session) {
      setMessage("Sign in to submit a tale.");
      return;
    }
    if (!title || !body) return;
    setLoading(true);
    setMessage(null);
    try {
      await createTale({ title, body, token: session.access_token });
      setTitle("");
      setBody("");
      setMessage("Submitted for moderation.");
    } catch (_err) {
      setMessage("Unable to submit tale.");
    } finally {
      setLoading(false);
    }
  }

  async function handlePolish() {
    if (!session) {
      setMessage("Sign in to polish a tale.");
      return;
    }
    if (!body) return;
    setPolishing(true);
    try {
      const res = await polishStory({ text: body, token: session.access_token });
      setBody(res.text ?? body);
    } catch (_err) {
      setMessage("Polish unavailable.");
    } finally {
      setPolishing(false);
    }
  }

  async function startRecording() {
    if (!session) {
      setMessage("Sign in to record audio.");
      return;
    }
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (permission.status !== "granted") {
        setMessage("Microphone permission denied.");
        return;
      }
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true
      });
      const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      setRecording(recording);
      setMessage("Recording...");
    } catch (_err) {
      setMessage("Unable to start recording.");
    }
  }

  async function stopRecording() {
    if (!recording || !session) return;
    setTranscribing(true);
    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      setRecording(null);
      if (!uri) throw new Error("Missing recording");
      const res = await transcribeAudio({ uri, token: session.access_token });
      const text = res.text ?? "";
      if (text.length > 0) {
        setBody((prev) => (prev ? `${prev}\n\n${text}` : text));
      }
      setMessage("Transcription added.");
    } catch (_err) {
      setMessage("Transcription failed.");
    } finally {
      setTranscribing(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 32 }}>
      <Text style={styles.title}>Compose a Tale</Text>
      <TextInput
        style={styles.input}
        placeholder="Title"
        value={title}
        onChangeText={setTitle}
      />
      <TextInput
        style={[styles.input, styles.textarea]}
        placeholder="400–2,500 words of righteous storytelling."
        value={body}
        onChangeText={setBody}
        multiline
      />
      <View style={styles.actions}>
        <Pressable style={styles.ghost} onPress={handlePolish}>
          <Text style={styles.ghostText}>{polishing ? "Polishing..." : "Polish with Magic"}</Text>
        </Pressable>
        <Pressable
          style={styles.ghost}
          onPress={recording ? stopRecording : startRecording}
          disabled={transcribing}
        >
          <Text style={styles.ghostText}>
            {recording ? "Stop Recording" : transcribing ? "Transcribing..." : "Speak"}
          </Text>
        </Pressable>
        <Pressable style={styles.button} onPress={handleSubmit}>
          <Text style={styles.buttonText}>{loading ? "Submitting..." : "Submit"}</Text>
        </Pressable>
      </View>
      {message && <Text style={styles.notice}>{message}</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8f1e7", padding: 20 },
  title: { fontSize: 24, fontWeight: "700", color: "#2c1f1a", marginBottom: 12 },
  input: {
    borderWidth: 1,
    borderColor: "#d8c5b1",
    borderRadius: 14,
    padding: 12,
    backgroundColor: "#fff",
    marginBottom: 12
  },
  textarea: { minHeight: 180, textAlignVertical: "top" },
  actions: { flexDirection: "row", gap: 12, alignItems: "center" },
  button: { backgroundColor: "#d96b3f", padding: 12, borderRadius: 999 },
  buttonText: { color: "white", fontWeight: "600" },
  ghost: {
    borderWidth: 1,
    borderColor: "#d8c5b1",
    padding: 12,
    borderRadius: 999
  },
  ghostText: { color: "#5d4d45", fontSize: 12 },
  notice: { marginTop: 12, color: "#2f5d50" }
});
