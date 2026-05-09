const RADIO_CHAT_CLIENT_STORAGE_KEY = "mr-rassy-radio-chat-client-id";

const buildRandomId = () =>
  `listener-${Date.now().toString(36)}-${Math.round(Math.random() * 1_000_000).toString(36)}`;

export type RadioChatRecommendationStatus =
  | "accepted"
  | "rejected"
  | "considering"
  | "none";

export type RadioChatMessage = {
  id: string;
  role: "dj" | "listener";
  kind?: "welcome" | "station-update" | "chat";
  text: string;
  createdAt: number;
  recommendationStatus?: RadioChatRecommendationStatus;
  recommendationSummary?: string | null;
  matchedTrackId?: string | null;
  trackIds?: string[];
};

export const createRadioChatRequestId = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `chat-${Date.now()}-${Math.round(Math.random() * 1_000_000)}`;
};

export const normalizeRadioChatText = (value: string) =>
  value.replace(/\s+/g, " ").trim().toLowerCase();

export const isRapidDuplicateRadioChatSubmission = (
  message: string,
  lastMessage?: { text?: string | null; createdAt?: number | null } | null,
  windowMs = 12_000,
) => {
  if (!lastMessage?.text) return false;

  const normalizedIncoming = normalizeRadioChatText(message);
  const normalizedPrevious = normalizeRadioChatText(lastMessage.text);
  if (!normalizedIncoming || normalizedIncoming !== normalizedPrevious) {
    return false;
  }

  const createdAt =
    typeof lastMessage.createdAt === "number" && Number.isFinite(lastMessage.createdAt)
      ? lastMessage.createdAt
      : 0;
  if (!createdAt) return false;
  return Date.now() - createdAt < windowMs;
};

export const ensureRadioChatClientId = () => {
  if (typeof window === "undefined") return null;

  const existing = window.localStorage.getItem(RADIO_CHAT_CLIENT_STORAGE_KEY)?.trim();
  if (existing) return existing;

  const nextId =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? `listener-${crypto.randomUUID()}`
      : buildRandomId();
  window.localStorage.setItem(RADIO_CHAT_CLIENT_STORAGE_KEY, nextId);
  return nextId;
};

export const normalizeRadioChatMessages = <T extends { id?: string; createdAt?: number }>(
  messages: T[],
) => {
  const seen = new Map<string, T>();

  for (const message of messages) {
    if (!message || typeof message !== "object") continue;
    const fallbackId = `${message.createdAt ?? 0}:${JSON.stringify(message)}`;
    const messageId =
      typeof message.id === "string" && message.id.trim().length > 0
        ? message.id
        : fallbackId;
    seen.set(messageId, message);
  }

  return Array.from(seen.values()).sort((left, right) => {
    const leftTime =
      typeof left.createdAt === "number" && Number.isFinite(left.createdAt)
        ? left.createdAt
        : 0;
    const rightTime =
      typeof right.createdAt === "number" && Number.isFinite(right.createdAt)
        ? right.createdAt
        : 0;
    if (leftTime !== rightTime) {
      return leftTime - rightTime;
    }
    return (left.id ?? "").localeCompare(right.id ?? "");
  });
};

export const buildRadioChatUrl = (clientId?: string | null) =>
  clientId ? `/api/radio/chat?clientId=${encodeURIComponent(clientId)}` : "/api/radio/chat";
