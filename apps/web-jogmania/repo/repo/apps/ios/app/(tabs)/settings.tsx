import { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { useAuth } from "../../components/AuthProvider";
import { createApiClient } from "../../services/api";
import { formatPlatformName } from "../../services/devices";
import type { Device } from "@jogmania/api-client";

export default function SettingsScreen() {
  const { token, logout } = useAuth();
  const [devices, setDevices] = useState<Device[]>([]);

  useEffect(() => {
    if (!token) return;
    const api = createApiClient(token);
    api.listDevices().then(setDevices).catch(() => setDevices([]));
  }, [token]);

  const pairingCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    devices.forEach((device) => {
      if (!device.companion_device_id) return;
      counts[device.companion_device_id] = (counts[device.companion_device_id] ?? 0) + 1;
    });
    return counts;
  }, [devices]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 24 }}>
      <Text style={styles.title}>Settings</Text>
      <Text style={styles.subtitle}>Device status and sync info for this runner.</Text>
      <View style={styles.card}>
        <Text style={styles.cardLabel}>Connected Devices</Text>
        <Text style={styles.cardValue}>{devices.length ? `${devices.length} connected` : "No devices connected"}</Text>
        {devices.map((device) => {
          const linked = Boolean(device.companion_device_id || pairingCounts[device.device_id]);
          return (
            <View key={device.id} style={styles.deviceRow}>
              <View>
                <Text style={styles.deviceName}>{device.name ?? formatPlatformName(device.platform)}</Text>
                <Text style={styles.deviceMeta}>
                  {formatPlatformName(device.platform)} · Last seen {new Date(device.last_seen_at).toLocaleString()}
                </Text>
                <Text style={styles.deviceMeta}>
                  {device.last_sync_at
                    ? `Last workout sync ${new Date(device.last_sync_at).toLocaleString()}`
                    : "Waiting for first workout sync"}
                </Text>
              </View>
              <Text style={styles.deviceBadge}>{linked ? "Linked" : "Solo"}</Text>
            </View>
          );
        })}
        {devices.length === 0 ? (
          <Text style={styles.deviceMeta}>Start a run or sync a watch workout to register a device.</Text>
        ) : null}
      </View>
      <Pressable style={styles.button} onPress={() => logout()}>
        <Text style={styles.buttonText}>Sign out</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0a0b12" },
  title: { fontSize: 28, color: "#f5f7ff", fontWeight: "700" },
  subtitle: { color: "#8a91b4", marginTop: 4, marginBottom: 16 },
  card: { backgroundColor: "#1a1f33", borderRadius: 16, padding: 16, marginBottom: 16 },
  cardLabel: { color: "#8a91b4", fontSize: 12, textTransform: "uppercase" },
  cardValue: { color: "#f5f7ff", fontSize: 16, marginTop: 8 },
  deviceRow: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#2a324e",
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12
  },
  deviceName: { color: "#f5f7ff", fontSize: 14 },
  deviceMeta: { color: "#8a91b4", fontSize: 12, marginTop: 4, maxWidth: 220 },
  deviceBadge: { color: "#37e6ff", fontSize: 12, fontWeight: "700", marginTop: 2 },
  button: { backgroundColor: "#ff3bc7", padding: 14, borderRadius: 999, alignItems: "center" },
  buttonText: { color: "#0a0b12", fontWeight: "700" }
});
