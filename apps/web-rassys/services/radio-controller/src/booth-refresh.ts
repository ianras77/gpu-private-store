import { config } from "./config";
import { redis } from "./redis";

const CHAT_ACTIVITY_KEY = "station:chat:recent_activity";
const BOOTH_REFRESH_ACTIVITY_KEY = "station:dj:hears:last_refresh_at";

const readActivityTimestamp = async (key: string) => {
  const raw = await redis.get(key);
  const parsed = Number(raw ?? 0);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

export const noteRecentChatActivity = async () => {
  const ttlSeconds = Math.max(60, Math.ceil((config.RADIO_CHAT_ACTIVITY_GRACE_MS + 15_000) / 1000));
  await redis.set(CHAT_ACTIVITY_KEY, String(Date.now()), "EX", ttlSeconds);
};

export const hasRecentChatActivity = async () => {
  const recentAt = await readActivityTimestamp(CHAT_ACTIVITY_KEY);
  return recentAt > 0 && Date.now() - recentAt < config.RADIO_CHAT_ACTIVITY_GRACE_MS;
};

export const shouldQueueBoothRefresh = async (existingSnapshotAt?: number | null) => {
  if (await hasRecentChatActivity()) return false;

  const lastRefreshAt = await readActivityTimestamp(BOOTH_REFRESH_ACTIVITY_KEY);
  if (
    lastRefreshAt > 0 &&
    Date.now() - lastRefreshAt < config.RADIO_HEARS_BACKGROUND_MIN_INTERVAL_MS
  ) {
    return false;
  }

  if (typeof existingSnapshotAt === "number" && Number.isFinite(existingSnapshotAt)) {
    return (
      Date.now() - existingSnapshotAt >=
      Math.min(config.RADIO_HEARS_BACKGROUND_MIN_INTERVAL_MS, 90_000)
    );
  }

  return true;
};

export const noteBoothRefreshQueued = async () => {
  const ttlSeconds = Math.max(
    600,
    Math.ceil((config.RADIO_HEARS_BACKGROUND_MIN_INTERVAL_MS * 2) / 1000)
  );
  await redis.set(BOOTH_REFRESH_ACTIVITY_KEY, String(Date.now()), "EX", ttlSeconds);
};
