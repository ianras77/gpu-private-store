import { useContext, useEffect, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { fetchTale, requestImageUpload } from "../lib/api";
import { AuthContext } from "../lib/auth";

export default function EditTaleScreen({ route, navigation }: { route: any; navigation: any }) {
  const { session } = useContext(AuthContext);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [reason, setReason] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [imageId, setImageId] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    async function load() {
      if (!session) return;
      try {
        const tale = await fetchTale(route.params.id, session.access_token);
        setTitle(tale.title);
        setBody(tale.body);
        setReason(tale.rejectionReason ?? null);
        setStatus(tale.status);
      } catch (_err) {
        setMessage("Unable to load tale.");
      }
    }
    load();
  }, [route.params.id, session?.access_token]);

  async function handleSave() {
    if (!session) return;
    const payload: any = { title, body };
    if (imageId !== undefined) {
      payload.imageId = imageId;
    }

    const res = await fetch(`${process.env.EXPO_PUBLIC_API_URL || "http://localhost:4000"}/tales/${route.params.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`
      },
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      setMessage("Resubmitted for moderation.");
      navigation.goBack();
    } else {
      const data = await res.json().catch(() => ({}));
      setMessage(data.error || "Update failed.");
    }
  }

  async function handlePickImage() {
    if (!session) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setMessage("Photo permission denied.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8
    });

    if (result.canceled) return;
    const asset = result.assets?.[0];
    if (!asset?.uri) return;

    try {
      const filename = asset.fileName || "tale-image.jpg";
      const contentType = asset.mimeType || "image/jpeg";
      const upload = await requestImageUpload({ filename, contentType, token: session.access_token });
      const fileRes = await fetch(asset.uri);
      const blob = await fileRes.blob();
      await fetch(upload.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": contentType },
        body: blob
      });
      setImageId(upload.imageId);
      setMessage("Image attached and queued for review.");
    } catch (_err) {
      setMessage("Unable to upload image.");
    }
  }

  if (status && status !== "NEEDS_EDITS") {
    return (
      <View style={styles.container}>
        <Text style={styles.meta}>This tale is not marked for edits.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 32 }}>
      <Text style={styles.title}>Edit Tale</Text>
      {reason && (
        <View style={styles.noticeBox}>
          <Text style={styles.noticeTitle}>Needs edits</Text>
          <Text style={styles.noticeBody}>{reason}</Text>
        </View>
      )}
      <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="Title" />
      <TextInput
        style={[styles.input, styles.textarea]}
        value={body}
        onChangeText={setBody}
        placeholder="Revise your tale"
        multiline
      />
      <Pressable style={styles.ghost} onPress={handlePickImage}>
        <Text style={styles.ghostText}>Replace image</Text>
      </Pressable>
      <Pressable style={styles.button} onPress={handleSave}>
        <Text style={styles.buttonText}>Resubmit</Text>
      </Pressable>
      {message && <Text style={styles.meta}>{message}</Text>}
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
  button: { backgroundColor: "#d96b3f", padding: 12, borderRadius: 999 },
  buttonText: { color: "white", fontWeight: "600", textAlign: "center" },
  ghost: { borderWidth: 1, borderColor: "#d8c5b1", padding: 12, borderRadius: 999, marginBottom: 10 },
  ghostText: { color: "#5d4d45", textAlign: "center" },
  meta: { color: "#5d4d45", marginTop: 8 },
  noticeBox: {
    backgroundColor: "#fff4e5",
    borderRadius: 12,
    padding: 12,
    marginBottom: 12
  },
  noticeTitle: { fontWeight: "700", color: "#8a5a2b", marginBottom: 4 },
  noticeBody: { color: "#8a5a2b" }
});
