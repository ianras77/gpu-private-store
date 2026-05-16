import { randomUUID } from "crypto";
import { redis } from "./redis";

export type RecommendationStatus = "accepted" | "rejected" | "considering" | "none";

export type StationChatMessage = {
  id: string;
  role: "dj" | "listener";
  kind: "welcome" | "station-update" | "chat";
  text: string;
  createdAt: number;
  replyToMessageId?: string | null;
  replySource?: "llm" | "fallback" | "error" | null;
  mood?: string | null;
  recommendationStatus?: RecommendationStatus;
  recommendationSummary?: string | null;
  matchedTrackId?: string | null;
  trackIds?: string[];
};

const STATION_CHAT_KEY = "station:chat";
const STATION_CHAT_LIMIT = 80;
const STATION_CHAT_SESSION_KEY = "station:chat:session";
const STATION_CHAT_SESSION_LIMIT = 48;
const STATION_CHAT_SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
const STATION_CHAT_CLIENT_ID_PATTERN = /^[a-z0-9][a-z0-9:_-]{7,119}$/i;

const safeJson = <T>(value: string | null): T | null => {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
};

export const createStationChatMessage = (
  message: Omit<StationChatMessage, "id" | "createdAt"> & {
    id?: string;
    createdAt?: number;
  }
): StationChatMessage => ({
  id: message.id ?? randomUUID(),
  createdAt: message.createdAt ?? Date.now(),
  replyToMessageId: message.replyToMessageId ?? null,
  replySource: message.replySource ?? null,
  recommendationStatus: message.recommendationStatus ?? "none",
  recommendationSummary: message.recommendationSummary ?? null,
  matchedTrackId: message.matchedTrackId ?? null,
  trackIds: Array.isArray(message.trackIds) ? message.trackIds : [],
  ...message
});

export const normalizeStationChatClientId = (value?: string | null) => {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  if (!STATION_CHAT_CLIENT_ID_PATTERN.test(trimmed)) return null;
  return trimmed.slice(0, 120);
};

const buildStationChatSessionKey = (clientId: string) => `${STATION_CHAT_SESSION_KEY}:${clientId}`;

export const pushStationChatMessage = async (message: StationChatMessage) => {
  await redis.lpush(STATION_CHAT_KEY, JSON.stringify(message));
  await redis.ltrim(STATION_CHAT_KEY, 0, STATION_CHAT_LIMIT - 1);
  return message;
};

export const pushStationChatSessionMessage = async (
  clientId: string,
  message: StationChatMessage
) => {
  const normalizedClientId = normalizeStationChatClientId(clientId);
  if (!normalizedClientId) return null;

  const key = buildStationChatSessionKey(normalizedClientId);
  await redis
    .multi()
    .lpush(key, JSON.stringify(message))
    .ltrim(key, 0, STATION_CHAT_SESSION_LIMIT - 1)
    .expire(key, STATION_CHAT_SESSION_TTL_SECONDS)
    .exec();
  return message;
};

export const listStationChatMessages = async (limit = 24) => {
  const rows = await redis.lrange(STATION_CHAT_KEY, 0, Math.max(0, limit - 1));
  return rows
    .map((row) => safeJson<StationChatMessage>(row))
    .filter(Boolean)
    .reverse() as StationChatMessage[];
};

export const listStationChatSessionMessages = async (clientId: string, limit = 24) => {
  const normalizedClientId = normalizeStationChatClientId(clientId);
  if (!normalizedClientId) return [];

  const rows = await redis.lrange(
    buildStationChatSessionKey(normalizedClientId),
    0,
    Math.max(0, limit - 1)
  );
  return rows
    .map((row) => safeJson<StationChatMessage>(row))
    .filter(Boolean)
    .reverse() as StationChatMessage[];
};
