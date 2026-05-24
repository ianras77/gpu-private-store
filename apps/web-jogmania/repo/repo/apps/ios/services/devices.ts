import * as SecureStore from "expo-secure-store";
import { SECURE_STORE_OPTIONS } from "./auth";
import type { DeviceRegisterPayload } from "@jogmania/api-client";

const PHONE_DEVICE_ID_KEY = "jm-phone-device-id";
const WATCH_DEVICE_ID_KEY = "jm-watch-device-id";

function buildId(prefix: string) {
  return `jm-${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

async function getOrCreateValue(key: string, prefix: string) {
  const existing = await SecureStore.getItemAsync(key, SECURE_STORE_OPTIONS);
  if (existing) return existing;
  const created = buildId(prefix);
  await SecureStore.setItemAsync(key, created, SECURE_STORE_OPTIONS);
  return created;
}

export async function getPhoneDevicePayload(): Promise<DeviceRegisterPayload> {
  const device_id = await getOrCreateValue(PHONE_DEVICE_ID_KEY, "ios");

  return {
    platform: "ios",
    device_id,
    name: "Jogmania iPhone",
    metadata_json: {
      app: "ios",
      sync: "primary"
    }
  };
}

export async function getWatchDevicePayload(): Promise<DeviceRegisterPayload> {
  const companion_device_id = await getOrCreateValue(PHONE_DEVICE_ID_KEY, "ios");
  const device_id = await getOrCreateValue(WATCH_DEVICE_ID_KEY, "watch");

  return {
    platform: "watch",
    device_id,
    name: "Jogmania Apple Watch",
    companion_device_id,
    metadata_json: {
      app: "watch-sync",
      simulated: true
    }
  };
}

export function formatPlatformName(platform: string) {
  if (platform === "watch" || platform === "watchos") return "Apple Watch";
  if (platform === "ios") return "iPhone";
  return platform;
}
