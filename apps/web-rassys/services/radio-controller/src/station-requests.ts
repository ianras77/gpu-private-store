import { createHash, randomUUID } from "crypto";
import { redis } from "./redis";
import { sanitizeRequest } from "./utils/selection";
import type { RecommendationStatus } from "./station-chat";

const REQUESTS_KEY = "station:requests";
const SKIP_TRACKS_KEY = "station:skip:tracks";
const REQUEST_LIMIT = 80;

export type StationRequestKind = "track" | "skip";
export type StationRequestTarget = "current" | "locked";
export type StationRequestSource = "chat" | "form" | "featured";
export type StationRequestIntent = "track" | "artist" | "album" | "genre" | "era" | "mood" | "special" | "broad";
export type StationRequestStatus = Exclude<RecommendationStatus, "none"> | "queued" | "fulfilled";

export type StationRequest = {
  id: string;
  kind: StationRequestKind;
  summary: string;
  listenerMessage?: string | null;
  trackId?: string | null;
  trackIds?: string[];
  reason?: string | null;
  response?: string | null;
  createdAt: number;
  target?: StationRequestTarget | null;
  source?: StationRequestSource | null;
  status?: StationRequestStatus | null;
  intent?: StationRequestIntent | null;
};

type StoredStationRequest = StationRequest & {
  raw: string;
};

export type PublicStationRequest = Omit<StoredStationRequest, "raw">;

const safeJson = <T>(value: string | null): T | null => {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
};

const normalizeSummary = (value: string) => sanitizeRequest(value).trim();
const normalizeMessage = (value?: string | null) => {
  if (typeof value !== "string") return null;
  const trimmed = value
    .trim()
    .slice(0, 220)
    .replace(/[^\w\s\-.'",!?()&:@/#]/g, "");
  return trimmed.length > 0 ? trimmed : null;
};
const normalizeTrackIds = (value?: string[] | null) =>
  Array.isArray(value)
    ? Array.from(new Set(value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)))
        .slice(0, 6)
    : [];

const isFacetRequest = (request: StationRequest) =>
  request.kind === "track" && Boolean(request.intent && request.intent !== "track");

export const isPendingStationRequest = (request: StationRequest) =>
  request.kind === "track" && request.status !== "queued" && request.status !== "fulfilled";

export const stationRequestsMatch = (request: StationRequest, candidate: StationRequest) => {
  if (request.kind !== candidate.kind) return false;
  if ((request.target ?? null) !== (candidate.target ?? null)) return false;

  const candidateTrackIds = normalizeTrackIds(candidate.trackIds);
  const requestTrackIds = normalizeTrackIds(request.trackIds);
  const candidateMessage = normalizeMessage(candidate.listenerMessage);
  const requestMessage = normalizeMessage(request.listenerMessage);
  const summariesMatch = normalizeSummary(request.summary) === normalizeSummary(candidate.summary);
  const messagesMatch = Boolean(candidateMessage && requestMessage && candidateMessage === requestMessage);

  if (isFacetRequest(request) || isFacetRequest(candidate)) {
    return summariesMatch || messagesMatch;
  }

  if ((request.trackId ?? null) !== (candidate.trackId ?? null)) return false;
  if (
    candidateTrackIds.length > 0 &&
    requestTrackIds.length > 0 &&
    candidateTrackIds.length === requestTrackIds.length &&
    candidateTrackIds.every((trackId) => requestTrackIds.includes(trackId))
  ) {
    return true;
  }
  if (candidate.trackId) return true;
  if (messagesMatch) return true;
  return summariesMatch;
};

const buildLegacyRequestId = (raw: string, index: number) =>
  `legacy-${createHash("sha1").update(raw).digest("hex").slice(0, 12)}-${index}`;

const toPublicStationRequest = (request: StoredStationRequest): PublicStationRequest => {
  const { raw: _raw, ...publicRequest } = request;
  return publicRequest;
};

const parseStationRequest = (raw: string, index: number): StoredStationRequest | null => {
  const parsed = safeJson<Partial<StationRequest>>(raw);
  if (!parsed || typeof parsed !== "object") {
    const summary = normalizeSummary(raw);
    if (!summary) return null;
    return {
      id: buildLegacyRequestId(raw, index),
      kind: "track",
      summary,
      listenerMessage: null,
      trackId: null,
      trackIds: [],
      reason: null,
      response: null,
      createdAt: 0,
      target: null,
      source: null,
      status: null,
      intent: null,
      raw
    };
  }

  const summary = normalizeSummary(typeof parsed.summary === "string" ? parsed.summary : "");
  if (!summary) return null;

  return {
    id:
      typeof parsed.id === "string" && parsed.id.trim().length > 0
        ? parsed.id
        : buildLegacyRequestId(raw, index),
    kind: parsed.kind === "skip" ? "skip" : "track",
    summary,
    listenerMessage: normalizeMessage(parsed.listenerMessage),
    trackId: typeof parsed.trackId === "string" && parsed.trackId.trim().length > 0 ? parsed.trackId : null,
    trackIds: normalizeTrackIds(parsed.trackIds),
    reason: typeof parsed.reason === "string" ? sanitizeRequest(parsed.reason) : null,
    response: normalizeMessage(parsed.response),
    createdAt: typeof parsed.createdAt === "number" && Number.isFinite(parsed.createdAt) ? parsed.createdAt : 0,
    target: parsed.target === "current" || parsed.target === "locked" ? parsed.target : null,
    source:
      parsed.source === "chat" || parsed.source === "form" || parsed.source === "featured"
        ? parsed.source
        : null,
    status:
      parsed.status === "accepted" ||
      parsed.status === "rejected" ||
      parsed.status === "considering" ||
      parsed.status === "queued" ||
      parsed.status === "fulfilled"
        ? parsed.status
        : null,
    intent:
      parsed.intent === "track" ||
      parsed.intent === "artist" ||
      parsed.intent === "album" ||
      parsed.intent === "genre" ||
      parsed.intent === "era" ||
      parsed.intent === "mood" ||
      parsed.intent === "special" ||
      parsed.intent === "broad"
        ? parsed.intent
        : null,
    raw
  };
};

const findMatchingRequest = (requests: StoredStationRequest[], candidate: StationRequest) =>
  requests.find((request) => stationRequestsMatch(request, candidate));

const removeStoredRequest = async (request?: StoredStationRequest | null) => {
  if (!request) return false;
  const removed = await redis.lrem(REQUESTS_KEY, 1, request.raw);
  return removed > 0;
};

const replaceStoredRequest = async (request: StoredStationRequest, nextRequest: StationRequest) => {
  const removed = await redis.lrem(REQUESTS_KEY, 1, request.raw);
  if (removed <= 0) return false;
  await redis.lpush(REQUESTS_KEY, JSON.stringify(nextRequest));
  await redis.ltrim(REQUESTS_KEY, 0, REQUEST_LIMIT - 1);
  return true;
};

export const buildTrackRequestSummary = (track: { title: string; artist: string }) =>
  sanitizeRequest(`${track.title} by ${track.artist}`);

export const listStationRequests = async (limit = 10) => {
  const rows = await redis.lrange(REQUESTS_KEY, 0, Math.max(0, limit - 1));
  return rows
    .map((row, index) => parseStationRequest(row, index))
    .filter(Boolean) as StoredStationRequest[];
};

export const readStationRequests = async (limit = 10) => {
  const requests = await listStationRequests(limit);
  return requests.map((request) => toPublicStationRequest(request));
};

export const countStationRequests = async () => {
  const rows = await listStationRequests(REQUEST_LIMIT);
  return rows.length;
};

export const readStationRequestSummaries = async (limit = 10) => {
  const requests = await listStationRequests(limit);
  return requests.map((request) => request.summary).filter(Boolean);
};

export const listPendingTrackRequests = async (limit = 10) => {
  const requests = await listStationRequests(limit);
  return requests.filter(isPendingStationRequest);
};

export const enqueueStationRequest = async (
  input: Omit<StationRequest, "id" | "createdAt"> & { id?: string; createdAt?: number }
) => {
  const summary = normalizeSummary(input.summary);
  if (!summary) return null;
  const trackIds = normalizeTrackIds(input.trackIds);
  const primaryTrackId =
    typeof input.trackId === "string" && input.trackId.trim().length > 0
      ? input.trackId
      : trackIds[0] ?? null;

  const request: StationRequest = {
    id: input.id ?? randomUUID(),
    kind: input.kind,
    summary,
    listenerMessage: normalizeMessage(input.listenerMessage),
    trackId: primaryTrackId,
    trackIds,
    reason: input.reason ? sanitizeRequest(input.reason) : null,
    response: normalizeMessage(input.response),
    createdAt: input.createdAt ?? Date.now(),
    target: input.target ?? null,
    source: input.source ?? null,
    status: input.status ?? null,
    intent: input.intent ?? null
  };

  const existing = await listStationRequests(40);
  if (findMatchingRequest(existing, request)) {
    return request;
  }

  await redis.lpush(REQUESTS_KEY, JSON.stringify(request));
  await redis.ltrim(REQUESTS_KEY, 0, REQUEST_LIMIT - 1);
  return request;
};

export const consumeTrackRequest = async (trackId: string) => {
  if (!trackId) return false;
  const requests = await listStationRequests(REQUEST_LIMIT);
  const match = requests.find(
    (request) =>
      request.kind === "track" &&
      (request.trackId === trackId || (Array.isArray(request.trackIds) && request.trackIds.includes(trackId)))
  );
  if (!match) return false;

  const remainingTrackIds = normalizeTrackIds(match.trackIds).filter((candidateTrackId) => candidateTrackId !== trackId);
  if ((match.trackId === trackId || !match.trackId) && remainingTrackIds.length === 0) {
    return replaceStoredRequest(match, {
      id: match.id,
      kind: match.kind,
      summary: match.summary,
      listenerMessage: match.listenerMessage ?? null,
      trackId: null,
      trackIds: [],
      reason: match.reason ?? null,
      response: match.response ?? null,
      createdAt: match.createdAt,
      target: match.target ?? null,
      source: match.source ?? null,
      status: "queued",
      intent: match.intent ?? null
    });
  }

  return replaceStoredRequest(match, {
    id: match.id,
    kind: match.kind,
    summary: match.summary,
    listenerMessage: match.listenerMessage ?? null,
    trackId: match.trackId === trackId ? remainingTrackIds[0] ?? null : match.trackId ?? remainingTrackIds[0] ?? null,
    trackIds: remainingTrackIds,
    reason: match.reason ?? null,
    response: match.response ?? null,
    createdAt: match.createdAt,
    target: match.target ?? null,
    source: match.source ?? null,
    status: remainingTrackIds.length > 0 ? match.status ?? "accepted" : "queued",
    intent: match.intent ?? null
  });
};

export const markTrackForSkip = async (trackId: string) => {
  if (!trackId) return false;
  const added = await redis.sadd(SKIP_TRACKS_KEY, trackId);
  return added > 0;
};

export const consumeMarkedSkip = async (trackId: string) => {
  if (!trackId) return false;
  const removed = await redis.srem(SKIP_TRACKS_KEY, trackId);
  return removed > 0;
};
