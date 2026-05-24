import { useContext, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ScrollView,
} from "react-native";
import { Audio } from "expo-av";
import {
  createTale,
  craftNotes,
  polishStory,
  transcribeAudio,
} from "../lib/api";
import { AuthContext } from "../lib/auth";

function words(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export default function ComposeScreen({ navigation }: { navigation: any }) {
  const { session } = useContext(AuthContext);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [premise, setPremise] = useState("");
  const [character, setCharacter] = useState("");
  const [stakes, setStakes] = useState("");
  const [turn, setTurn] = useState("");
  const [voice, setVoice] = useState("");
  const [notes, setNotes] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [polishing, setPolishing] = useState(false);
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [transcribing, setTranscribing] = useState(false);

  async function handleSubmit() {
    if (!session) {
      setMessage("Sign in to submit a tale.");
      navigation.navigate("Login");
      return;
    }
    if (!title.trim() || body.trim().length < 600) {
      setMessage(
        "Set a title and draft at least 600 characters before publishing.",
      );
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      await createTale({
        title,
        body,
        token: session.access_token,
        isAnonymous: true,
        assistMode: notes.length > 0 ? "STUDIO" : "HANDMADE",
        storyPrompt: premise || null,
        personaVoice: voice || null,
        personaSignature: premise || null,
      });
      setTitle("");
      setBody("");
      setNotes([]);
      setMessage("Submitted to the moderation desk.");
    } catch (_err) {
      setMessage("Unable to submit tale.");
    } finally {
      setLoading(false);
    }
  }

  async function handleNotes() {
    setMessage(null);
    try {
      const res = await craftNotes({
        title,
        body,
        premise,
        character,
        stakes,
        turn,
        voice,
      });
      setNotes(res.notes);
    } catch (_err) {
      setMessage("Craft notes are unavailable.");
    }
  }

  async function handlePolish() {
    if (!session) {
      setMessage("Sign in for a proof pass.");
      return;
    }
    if (!body.trim()) return;
    setPolishing(true);
    try {
      const res = await polishStory({
        text: body,
        token: session.access_token,
      });
      setBody(res.text ?? body);
    } catch (_err) {
      setMessage("Proof pass unavailable.");
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
        playsInSilentModeIOS: true,
      });
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY,
      );
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
      if (res.text)
        setBody((prev) => (prev ? `${prev}\n\n${res.text}` : res.text));
      setMessage("Transcription added.");
    } catch (_err) {
      setMessage("Transcription failed.");
    } finally {
      setTranscribing(false);
    }
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: 34 }}
    >
      <Text style={styles.kicker}>Compose desk</Text>
      <Text style={styles.title}>Set a tale in type</Text>
      <Text style={styles.copy}>
        Build the spine before chasing sparkle. Notes help; you still own every
        line.
      </Text>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Story spine</Text>
        <TextInput
          style={styles.input}
          placeholder="Premise"
          placeholderTextColor="#766856"
          value={premise}
          onChangeText={setPremise}
        />
        <TextInput
          style={styles.input}
          placeholder="Character"
          placeholderTextColor="#766856"
          value={character}
          onChangeText={setCharacter}
        />
        <TextInput
          style={styles.input}
          placeholder="Stakes"
          placeholderTextColor="#766856"
          value={stakes}
          onChangeText={setStakes}
        />
        <TextInput
          style={styles.input}
          placeholder="Turn"
          placeholderTextColor="#766856"
          value={turn}
          onChangeText={setTurn}
        />
        <TextInput
          style={styles.input}
          placeholder="Voice"
          placeholderTextColor="#766856"
          value={voice}
          onChangeText={setVoice}
        />
      </View>

      <View style={styles.panelDark}>
        <Text style={styles.panelTitleDark}>Draft table</Text>
        <TextInput
          style={styles.inputDark}
          placeholder="Title"
          placeholderTextColor="#b9aa8b"
          value={title}
          onChangeText={setTitle}
        />
        <TextInput
          style={[styles.inputDark, styles.textarea]}
          placeholder="Draft in scenes. Aim for medium-to-long form."
          placeholderTextColor="#b9aa8b"
          value={body}
          onChangeText={setBody}
          multiline
        />
        <Text style={styles.counter}>
          {words(body)} words / {body.length} characters
        </Text>
        <View style={styles.actions}>
          <Pressable style={styles.ghostDark} onPress={handleNotes}>
            <Text style={styles.ghostDarkText}>Craft notes</Text>
          </Pressable>
          <Pressable
            style={styles.ghostDark}
            onPress={recording ? stopRecording : startRecording}
            disabled={transcribing}
          >
            <Text style={styles.ghostDarkText}>
              {recording ? "Stop" : transcribing ? "Transcribing" : "Speak"}
            </Text>
          </Pressable>
          <Pressable style={styles.ghostDark} onPress={handlePolish}>
            <Text style={styles.ghostDarkText}>
              {polishing ? "Proofing" : "Proof pass"}
            </Text>
          </Pressable>
          <Pressable style={styles.primaryDark} onPress={handleSubmit}>
            <Text style={styles.primaryDarkText}>
              {loading ? "Submitting" : "Submit"}
            </Text>
          </Pressable>
        </View>
      </View>

      {notes.map((note) => (
        <View key={note} style={styles.note}>
          <Text style={styles.noteText}>{note}</Text>
        </View>
      ))}
      {message && <Text style={styles.notice}>{message}</Text>}
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
  panel: {
    backgroundColor: "#fffaf0",
    borderWidth: 1,
    borderColor: "#d2c09b",
    borderRadius: 8,
    padding: 14,
    gap: 10,
    marginBottom: 14,
  },
  panelTitle: { color: "#15120f", fontSize: 18, fontWeight: "900" },
  panelDark: {
    backgroundColor: "#15120f",
    borderRadius: 8,
    padding: 14,
    gap: 10,
    marginBottom: 14,
  },
  panelTitleDark: { color: "#f8f1df", fontSize: 20, fontWeight: "900" },
  input: {
    borderWidth: 1,
    borderColor: "#d2c09b",
    borderRadius: 8,
    padding: 11,
    backgroundColor: "#f8f1df",
    color: "#15120f",
  },
  inputDark: {
    borderWidth: 1,
    borderColor: "rgba(248,241,223,0.18)",
    borderRadius: 8,
    padding: 11,
    backgroundColor: "rgba(248,241,223,0.08)",
    color: "#f8f1df",
  },
  textarea: { minHeight: 240, textAlignVertical: "top" },
  counter: { color: "rgba(248,241,223,0.58)", fontSize: 12, fontWeight: "700" },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  ghostDark: {
    borderWidth: 1,
    borderColor: "rgba(248,241,223,0.2)",
    paddingHorizontal: 11,
    paddingVertical: 10,
    borderRadius: 8,
  },
  ghostDarkText: { color: "#f8f1df", fontSize: 12, fontWeight: "800" },
  primaryDark: {
    backgroundColor: "#c7472b",
    paddingHorizontal: 13,
    paddingVertical: 11,
    borderRadius: 8,
  },
  primaryDarkText: { color: "#fffaf0", fontSize: 12, fontWeight: "900" },
  note: {
    backgroundColor: "#fffaf0",
    borderWidth: 1,
    borderColor: "#d2c09b",
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  noteText: { color: "#5f5344", lineHeight: 20 },
  notice: { color: "#2f7d73", lineHeight: 20, marginTop: 4 },
});
