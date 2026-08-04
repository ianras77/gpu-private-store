import { Prisma } from "@prisma/client";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import { createReadStream, promises as fs } from "fs";
import path from "path";
import { Readable } from "stream";
import { z } from "zod";
import { config } from "./config";
import { redis } from "./redis";
import { prisma } from "./db";
import { defaultDJ } from "./dj";
import type {
  DJContext,
  DJListenerLiveSnapshot,
  DJListenerReply,
  DJProgrammingInfo,
  DJRequestMatch,
  DJTrackPlaybackPlan
} from "./dj/interface";
import { buildBoothDossier } from "./dj/rassy";
import {
  buildContext,
  buildCurrentMoodFrame,
  getSnippetPlaybackGateState,
  library,
  publishDjScript,
  rememberRecentSnippet
} from "./scheduler";
import {
  isBrowserSafeImage,
  readArtwork,
  buildPodcastSeriesFallbackDescription,
  normalizePodcastEpisodeDescription,
  normalizePodcastEpisodeTitle,
  normalizePodcastSeriesDescription,
  normalizePodcastSeriesTitle
} from "./library";
import { rankTracks, sanitizeRequest } from "./utils/selection";
import { isLiquidsoapReady, pushToQueue, readQueuedRequests, skipCurrent } from "./liquidsoap/client";
import { buildSnippetQueueUri } from "./liquidsoap/uris";
import {
  buildRadioNoteExcerpt,
  buildRadioNoteTitle,
  parseNoteBoothDossier,
  parseNoteTrackList,
  parseTrackIds,
  toNoteTrack
} from "./notes";
import {
  buildBoothSignature,
  buildFallbackBoothDossier,
  toBoothDossierSnapshot,
  type BoothDossierSnapshot
} from "./booth-dossier";
import { buildBoothInputForContext } from "./booth-input";
import {
  buildTrackInsightScaffold,
  buildTrackTurnIntelligence,
  buildTrackKnowledgeCard,
  getTrackInsightMap,
  learnTrackInsightsFromBoothDossier,
  rankTracksForRequestLine
} from "./library/track-intelligence";
import { logger } from "./logger";
import {
  createStationChatMessage,
  listStationChatMessages,
  listStationChatSessionMessages,
  normalizeStationChatClientId,
  pushStationChatMessage,
  pushStationChatSessionMessage
} from "./station-chat";
import { PodcastEpisode, PodcastSeries, PhotoMedia, Track } from "./library/types";
import { ensureImagePreview, ensureVideoPoster } from "./photos-preview";
import {
  buildTrackRequestSummary,
  countStationRequests,
  enqueueStationRequest,
  readStationRequests,
  markTrackForSkip,
  readStationRequestSummaries
} from "./station-requests";
import {
  hasStrongSkipReason,
  looksLikeBroadLaneRequest as isBroadLaneRequest,
  looksLikeRecommendationRequest as looksLikeRecommendation,
  looksLikeSkipRequest
} from "./chat-intents";
import { resolveListenerRecommendationStatus } from "./chat-recommendations";
import {
  noteBoothRefreshQueued,
  noteRecentChatActivity,
  shouldQueueBoothRefresh
} from "./booth-refresh";

const QUEUE_KEY = "station:queue";
const NOW_KEY = "station:now";
const DJ_SAYS_KEY = "station:dj_says";
const DJ_SAYS_META_KEY = "station:dj:says_meta";
const DJ_HEARS_KEY = "station:dj:hears_meta";
const DJ_HEARS_BUILDING_KEY = "station:dj:hears_building";
const DJ_MODE_KEY = "station:dj:mode";
const DJ_LAST_DECISION_KEY = "station:dj:last_decision_at";
const DJ_LAST_PLAYLIST_KEY = "station:dj:last_playlist";
const LIBRARY_LAST_SCAN_KEY = "station:library:last_scan_at";
const FEEDBACK_SCORES_KEY = "station:feedback:scores";
const FEEDBACK_RECENT_KEY = "station:feedback:recent";
const CHAT_REQUEST_RESPONSE_KEY = "station:chat:request:response";
const CHAT_REQUEST_LOCK_KEY = "station:chat:request:lock";
const CHAT_MESSAGE_LOCK_KEY = "station:chat:message:lock";
const CHAT_SEED_LOCK_KEY = "station:chat:seed:lock";
const CHAT_SESSION_SEED_LOCK_KEY = "station:chat:session:seed:lock";
const CHAT_HISTORY_KEY = "station:history";

const boothBuildingKey = (signature: string) => `${DJ_HEARS_BUILDING_KEY}:${signature}`;
const buildChatSessionSeedLockKey = (clientId: string) => `${CHAT_SESSION_SEED_LOCK_KEY}:${clientId}`;
const buildChatMessageLockKey = (clientId: string, message: string) =>
  `${CHAT_MESSAGE_LOCK_KEY}:${clientId}:${hashText(normalizeSearchText(message))}`;
const AUDIO_CONTENT_TYPES: Record<string, string> = {
  ".mp3": "audio/mpeg",
  ".flac": "audio/flac",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".m4b": "audio/mp4",
  ".aac": "audio/aac",
  ".ogg": "audio/ogg"
};
const IMAGE_CONTENT_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".avif": "image/avif",
  ".heic": "image/heic",
  ".heif": "image/heif"
};
const VIDEO_CONTENT_TYPES: Record<string, string> = {
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".m4v": "video/mp4",
  ".webm": "video/webm"
};
const PODCAST_SHOW = {
  title: "Real Life Bedtime Stories",
  subtitle: "Books told softly, one chapter at a time.",
  description:
    "A bedtime podcast from Ian Rasmussen, built from a local library of books and chapters that can be played on the site, in the app, or through a podcast client."
};
const PODCAST_RSS_EXTENSIONS = new Set([".mp3", ".m4a"]);

const toStreamUrl = (value?: string) => {
  if (!value) return undefined;
  return /^https?:\/\//i.test(value) ? value : undefined;
};

const toPublicTrack = (track: Track) => ({
  id: track.id,
  title: track.title,
  artist: track.artist,
  album: track.album,
  year: track.year,
  genres: track.genres,
  duration: track.duration,
  bpm: track.bpm,
  energy: track.energy,
  albumArtUrl: toStreamUrl(track.albumArtUrl),
  streamUrl: toStreamUrl(track.path),
  hasArtwork: Boolean(track.hasArtwork || track.albumArtUrl),
  sourceKind: track.sourceKind ?? "music",
  format: track.format,
  sampleRate: track.sampleRate,
  bitsPerSample: track.bitsPerSample,
  bitrate: track.bitrate,
  lossless: track.lossless
});

const toPublicPodcastEpisode = (episode: PodcastEpisode) => {
  const seriesTitle = normalizePodcastSeriesTitle(episode.seriesTitle);
  const title = normalizePodcastEpisodeTitle(episode.title);

  return {
    id: episode.id,
    seriesId: episode.seriesId,
    seriesTitle,
    title,
    description: normalizePodcastEpisodeDescription(episode.description, seriesTitle, title),
    duration: episode.duration,
    publishedAt: episode.publishedAt,
    episodeNumber: episode.episodeNumber,
    seasonNumber: episode.seasonNumber,
    hasArtwork: Boolean(episode.hasArtwork),
    fileSize: episode.fileSize,
    format: episode.format,
    sampleRate: episode.sampleRate,
    bitsPerSample: episode.bitsPerSample,
    bitrate: episode.bitrate,
    lossless: episode.lossless,
    rssReady: PODCAST_RSS_EXTENSIONS.has(path.extname(episode.path).toLowerCase())
  };
};

const toPublicPodcastSeries = (series: PodcastSeries) => {
  const title = normalizePodcastSeriesTitle(series.title);
  const fallbackDescription = buildPodcastSeriesFallbackDescription(title);

  return {
    id: series.id,
    slug: series.slug,
    title,
    description: normalizePodcastSeriesDescription(series.description ?? fallbackDescription, title),
    hasArtwork: Boolean(series.hasArtwork),
    episodeCount: series.episodeCount,
    updatedAt: series.updatedAt,
    episodes: series.episodes.map(toPublicPodcastEpisode)
  };
};

const toPublicPhoto = (item: PhotoMedia) => ({
  id: item.id,
  title: item.title,
  relativePath: item.relativePath,
  kind: item.kind,
  extension: item.extension,
  mimeType: item.mimeType,
  fileSize: item.fileSize,
  capturedAt: item.capturedAt,
  updatedAt: item.updatedAt,
  source: item.source,
  sourceLabel: item.sourceLabel,
  collection: item.collection,
  description: item.description,
  width: item.width,
  height: item.height,
  durationSeconds: item.durationSeconds,
  location: item.location,
  camera: item.camera
});

const getAudioContentType = (filepath: string) =>
  AUDIO_CONTENT_TYPES[path.extname(filepath).toLowerCase()] ?? "application/octet-stream";

const getImageContentType = (filepath: string) =>
  IMAGE_CONTENT_TYPES[path.extname(filepath).toLowerCase()] ?? "application/octet-stream";

const getVideoContentType = (filepath: string) =>
  VIDEO_CONTENT_TYPES[path.extname(filepath).toLowerCase()] ?? "application/octet-stream";

const parseByteRange = (rangeHeader: string, size: number) => {
  const rangeValue = rangeHeader.replace(/^bytes=/i, "").split(",")[0]?.trim();
  if (!rangeValue) return null;

  const [startToken = "", endToken = ""] = rangeValue.split("-", 2).map((value) => value.trim());
  if (!startToken && !endToken) return null;

  if (!startToken) {
    const suffixLength = Number(endToken);
    if (!Number.isInteger(suffixLength) || suffixLength <= 0) return null;
    const chunkSize = Math.min(size, suffixLength);
    return {
      start: Math.max(0, size - chunkSize),
      end: Math.max(0, size - 1)
    };
  }

  const start = Number(startToken);
  const end = endToken ? Number(endToken) : size - 1;
  if (!Number.isInteger(start) || !Number.isInteger(end)) return null;
  if (start < 0 || end < start || start >= size) return null;

  return {
    start,
    end: Math.min(size - 1, end)
  };
};

const isHighResTrack = (track: {
  sampleRate?: number;
  bitsPerSample?: number;
  lossless?: boolean;
}) =>
  Boolean(track.lossless) &&
  ((track.bitsPerSample ?? 0) > 16 || (track.sampleRate ?? 0) > 48000);

const normalizeTrackSearch = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const matchesTrackQuery = (track: Track, query?: string | null) => {
  const q = normalizeTrackSearch(query ?? "");
  if (!q) return true;
  const haystack = normalizeTrackSearch(
    [track.title, track.artist, track.album, track.genres?.join(" "), track.relativePath]
      .filter(Boolean)
      .join(" ")
  );
  return haystack.includes(q);
};

const safeJson = <T>(value: string | null): T | null => {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
};

const getLockedQueueTarget = () => Math.max(1, config.RADIO_LOCKED_QUEUE_TRACKS);

const toQueuedTrackIds = (entries: string[]) =>
  entries.filter((entry) => typeof entry === "string" && !entry.startsWith("snippet:"));

const readQueuedTrackIds = async (limit?: number) => {
  const entries = await redis.lrange(QUEUE_KEY, 0, -1);
  const trackIds = toQueuedTrackIds(entries);
  if (typeof limit !== "number") return trackIds;
  return trackIds.slice(0, Math.max(0, limit));
};

const buildFeedbackContext = async () => {
  const raw = await redis.hgetall(FEEDBACK_SCORES_KEY);
  const scored = Object.entries(raw)
    .map(([trackId, value]) => ({
      trackId,
      score: Number(value ?? 0)
    }))
    .filter((item) => Number.isFinite(item.score) && item.score !== 0);

  const feedback = scored.slice(0, 8).map((item) => {
    const track = library.getTrackById(item.trackId);
    return {
      trackId: item.trackId,
      score: item.score,
      title: track?.title,
      artist: track?.artist
    };
  });

  const topLiked = scored
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map((item) => {
      const track = library.getTrackById(item.trackId);
      return {
        trackId: item.trackId,
        score: item.score,
        title: track?.title ?? "Unknown Track",
        artist: track?.artist ?? "Unknown Artist"
      };
    });

  const topDisliked = scored
    .filter((item) => item.score < 0)
    .sort((a, b) => a.score - b.score)
    .slice(0, 3)
    .map((item) => {
      const track = library.getTrackById(item.trackId);
      return {
        trackId: item.trackId,
        score: item.score,
        title: track?.title ?? "Unknown Track",
        artist: track?.artist ?? "Unknown Artist"
      };
    });

  return {
    feedback,
    topLiked,
    topDisliked
  };
};

const buildListenerLiveSnapshot = async (): Promise<DJListenerLiveSnapshot | null> => {
  const [djMetaRaw, boothRaw, requestLine] = await Promise.all([
    redis.get(DJ_SAYS_META_KEY),
    redis.get(DJ_HEARS_KEY),
    readStationRequests(6)
  ]);

  const djMeta = safeJson<{
    script?: string;
    reason?: string | null;
    programming?: DJProgrammingInfo | null;
  }>(djMetaRaw);
  const boothSnapshot = toBoothDossierSnapshot(safeJson<unknown>(boothRaw));

  const line = requestLine
    .filter((request) => request.kind === "track")
    .slice(0, 4)
    .map((request) => {
      const trackIds =
        Array.isArray(request.trackIds) && request.trackIds.length > 0
          ? request.trackIds
          : request.trackId
            ? [request.trackId]
            : [];
      const tracks = trackIds
        .map((trackId) => library.getTrackById(trackId))
        .filter((track): track is Track => Boolean(track))
        .slice(0, 3)
        .map((track) => ({
          title: track.title,
          artist: track.artist
        }));

      return {
        summary: request.summary,
        status: request.status ?? null,
        intent: request.intent ?? null,
        response: request.response ?? null,
        tracks
      };
    });

  if (!djMeta && !boothSnapshot && line.length === 0) {
    return null;
  }

  return {
    djScript: djMeta?.script ?? null,
    djReason: djMeta?.reason ?? null,
    boothHeadline: boothSnapshot?.headline ?? null,
    boothIntro: boothSnapshot?.intro ?? null,
    lineupNote: boothSnapshot?.sections.lineup.body ?? null,
    contextNote: boothSnapshot?.sections.context.body ?? null,
    listenForNote: boothSnapshot?.sections.listenFor.body ?? null,
    nextMove: boothSnapshot?.nextMove ?? null,
    programmingMode: djMeta?.programming?.mode ?? boothSnapshot?.programming?.mode ?? null,
    programmingLabel: djMeta?.programming?.label ?? boothSnapshot?.programming?.label ?? null,
    programmingDescription:
      djMeta?.programming?.description ?? boothSnapshot?.programming?.description ?? null,
    tags: boothSnapshot?.tags ?? [],
    requestLine: line
  };
};

const buildListenerChatContext = async (): Promise<DJContext> => {
  const [storedMood, historyRows, queuedTrackIds, nowRaw, feedbackContext, requests] = await Promise.all([
    redis.get("station:mood"),
    redis.lrange(CHAT_HISTORY_KEY, 0, 9),
    readQueuedTrackIds(10),
    redis.get(NOW_KEY),
    buildFeedbackContext(),
    readStationRequestSummaries(10)
  ]);

  const recentTracks = historyRows
    .map((item) => {
      try {
        return JSON.parse(item) as { id?: string; title?: string; artist?: string };
      } catch {
        return { id: "", title: "", artist: "" };
      }
    })
    .map((item) => ({
      id: item.id ?? "",
      title: item.title ?? "",
      artist: item.artist ?? ""
    }))
    .filter((item) => item.title || item.artist);
  const recentArtists = recentTracks.map((track) => track.artist).filter(Boolean);

  const parsedNowPlaying = safeJson<{
    id?: string;
    title?: string;
    artist?: string;
    album?: string;
    year?: number;
    genres?: string[];
    energy?: number;
  }>(nowRaw);
  const nowPlayingMatch = parsedNowPlaying?.id
    ? library.getTrackById(parsedNowPlaying.id)
    : library.findByTitleArtist(parsedNowPlaying?.title, parsedNowPlaying?.artist);
  const nowPlaying = parsedNowPlaying
    ? {
        ...parsedNowPlaying,
        ...(parsedNowPlaying.id ?? nowPlayingMatch?.id ? { id: parsedNowPlaying.id ?? nowPlayingMatch?.id } : {}),
        ...(parsedNowPlaying.title ?? nowPlayingMatch?.title
          ? { title: parsedNowPlaying.title ?? nowPlayingMatch?.title ?? "" }
          : {}),
        ...(parsedNowPlaying.artist ?? nowPlayingMatch?.artist
          ? { artist: parsedNowPlaying.artist ?? nowPlayingMatch?.artist ?? "" }
          : {}),
        ...(parsedNowPlaying.album ?? nowPlayingMatch?.album
          ? { album: parsedNowPlaying.album ?? nowPlayingMatch?.album }
          : {}),
        ...(parsedNowPlaying.year ?? nowPlayingMatch?.year
          ? { year: parsedNowPlaying.year ?? nowPlayingMatch?.year }
          : {}),
        ...(parsedNowPlaying.genres ?? nowPlayingMatch?.genres
          ? { genres: parsedNowPlaying.genres ?? nowPlayingMatch?.genres }
          : {}),
        ...(parsedNowPlaying.energy ?? nowPlayingMatch?.energy
          ? { energy: parsedNowPlaying.energy ?? nowPlayingMatch?.energy }
          : {})
      }
    : null;

  const queueTracks = queuedTrackIds
    .map((trackId) => library.getTrackById(trackId))
    .filter((track): track is Track => Boolean(track))
    .slice(0, 10);
  const queuePreview = queueTracks.map((track) => ({
    id: track.id,
    title: track.title,
    artist: track.artist,
    album: track.album,
    year: track.year,
    genres: track.genres,
    energy: track.energy
  }));

  const moodFrame = buildCurrentMoodFrame({
    rawMood: storedMood,
    now: new Date(),
    queueDepth: queuedTrackIds.length,
    requestCount: requests.length,
    recentLead: recentTracks[0]?.artist || recentTracks[0]?.title || nowPlaying?.artist || nowPlaying?.title
  });
  const { dayOfWeek, dayPart, emotionalWeather, mood, timeOfDay } = moodFrame;

  const requestSeedTracks = (
    await Promise.all(requests.slice(0, 4).map((request) => findRequestMatches(request, 2)))
  )
    .flat()
    .map((match) => library.getTrackById(match.id))
    .filter((track): track is Track => Boolean(track));
  const queuedTrackIdSet = new Set(queuedTrackIds);
  const librarySeed = library
    .getTracks()
    .filter((track) => !queuedTrackIdSet.has(track.id) && track.id !== nowPlaying?.id)
    .slice(0, 18);
  const librarySample = Array.from(
    new Map(
      [...requestSeedTracks, ...queueTracks, ...librarySeed].map((track) => [track.id, track] as const)
    ).values()
  ).slice(0, 18);

  return {
    mood,
    timeOfDay,
    dayOfWeek,
    dayPart,
    emotionalWeather,
    recentTracks,
    recentArtists,
    queueDepth: queuedTrackIds.length,
    lockedQueueSize: getLockedQueueTarget(),
    nowPlaying,
    librarySample,
    queuePreview,
    lockedQueuePreview: queuePreview.slice(0, getLockedQueueTarget()),
    snippetSample: [],
    libraryProfile: library.getProfile(),
    feedback: feedbackContext.feedback,
    feedbackTopLiked: feedbackContext.topLiked,
    feedbackTopDisliked: feedbackContext.topDisliked,
    requests,
    bans: {
      trackIds: [],
      artists: []
    },
    programming: null
  };
};

const buildHearsContext = async (): Promise<DJContext> => {
  const [queuedTrackIds, nowRaw, storedMood, requests, requestCount, feedbackContext] = await Promise.all([
    readQueuedTrackIds(),
    redis.get(NOW_KEY),
    redis.get("station:mood"),
    readStationRequestSummaries(4),
    countStationRequests(),
    buildFeedbackContext()
  ]);

  const parsedNow = safeJson<{
    id?: string;
    title?: string;
    artist?: string;
    album?: string;
    year?: number;
    genres?: string[];
    energy?: number;
  }>(nowRaw);
  const nowPlayingMatch =
    parsedNow?.id && typeof parsedNow.id === "string"
      ? library.getTrackById(parsedNow.id)
      : parsedNow?.title && parsedNow?.artist
        ? library.findByTitleArtist(parsedNow.title, parsedNow.artist)
        : null;

  const nowPlaying =
    parsedNow || nowPlayingMatch
      ? {
          ...(parsedNow?.id ?? nowPlayingMatch?.id ? { id: parsedNow?.id ?? nowPlayingMatch?.id } : {}),
          ...(parsedNow?.title ?? nowPlayingMatch?.title
            ? { title: parsedNow?.title ?? nowPlayingMatch?.title }
            : {}),
          ...(parsedNow?.artist ?? nowPlayingMatch?.artist
            ? { artist: parsedNow?.artist ?? nowPlayingMatch?.artist }
            : {}),
          ...(parsedNow?.album ?? nowPlayingMatch?.album
            ? { album: parsedNow?.album ?? nowPlayingMatch?.album }
            : {}),
          ...(parsedNow?.year ?? nowPlayingMatch?.year
            ? { year: parsedNow?.year ?? nowPlayingMatch?.year }
            : {}),
          ...(parsedNow?.genres ?? nowPlayingMatch?.genres
            ? { genres: parsedNow?.genres ?? nowPlayingMatch?.genres }
            : {}),
          ...(parsedNow?.energy ?? nowPlayingMatch?.energy
            ? { energy: parsedNow?.energy ?? nowPlayingMatch?.energy }
            : {})
        }
      : null;

  const queuePreview = queuedTrackIds
    .slice(0, Math.max(3, getLockedQueueTarget()))
    .map((trackId) => library.getTrackById(trackId))
    .filter((track): track is Track => Boolean(track))
    .map((track) => ({
      id: track.id,
      title: track.title,
      artist: track.artist,
      ...(track.album ? { album: track.album } : {}),
      ...(track.year ? { year: track.year } : {}),
      ...(track.genres?.length ? { genres: track.genres } : {}),
      energy: track.energy
    }));

  const moodFrame = buildCurrentMoodFrame({
    rawMood: storedMood ?? config.RADIO_MOOD,
    queueDepth: queuedTrackIds.length,
    requestCount,
    recentLead:
      nowPlaying?.artist ??
      nowPlaying?.title ??
      queuePreview[0]?.artist ??
      queuePreview[0]?.title
  });

  return {
    mood: moodFrame.mood,
    timeOfDay: moodFrame.timeOfDay,
    dayOfWeek: moodFrame.dayOfWeek,
    dayPart: moodFrame.dayPart,
    emotionalWeather: moodFrame.emotionalWeather,
    recentTracks: [],
    recentArtists: [],
    queueDepth: queuedTrackIds.length,
    lockedQueueSize: getLockedQueueTarget(),
    nowPlaying,
    librarySample: [],
    queuePreview,
    lockedQueuePreview: queuePreview.slice(0, getLockedQueueTarget()),
    snippetSample: [],
    libraryProfile: library.getProfile(),
    feedback: feedbackContext.feedback,
    feedbackTopLiked: feedbackContext.topLiked,
    feedbackTopDisliked: feedbackContext.topDisliked,
    requests,
    bans: {
      trackIds: [],
      artists: []
    }
  };
};

const trimSlash = (value: string) => value.replace(/\/+$/, "");

const buildPhotoSourceSummary = (items: PhotoMedia[]) => {
  const summarize = (source: PhotoMedia["source"]) => {
    const scopedItems = items.filter((item) => item.source === source);
    const firstItem = scopedItems[0];
    return {
      label:
        source === "immich"
          ? firstItem?.collection || config.IMMICH_ALBUM_NAME || "Immich album"
          : firstItem?.collection || "Local library",
      total: scopedItems.length,
      images: scopedItems.filter((item) => item.kind === "image").length,
      videos: scopedItems.filter((item) => item.kind === "video").length
    };
  };

  return {
    immich: summarize("immich"),
    local: summarize("local")
  };
};

const buildImmichAssetUrl = (item: PhotoMedia, variant: "file" | "preview" | "poster") => {
  if (item.source !== "immich" || !item.remoteAssetId || !config.IMMICH_BASE_URL.trim()) {
    return null;
  }

  const baseUrl = trimSlash(config.IMMICH_BASE_URL);
  if (item.kind === "video" && variant === "file") {
    return `${baseUrl}/api/assets/${item.remoteAssetId}/video/playback`;
  }

  return `${baseUrl}/api/assets/${item.remoteAssetId}/thumbnail?size=preview`;
};

const setProxyHeaders = (reply: FastifyReply, headers: Headers) => {
  const allowedHeaders = [
    "content-type",
    "content-length",
    "accept-ranges",
    "content-range",
    "cache-control",
    "etag",
    "last-modified"
  ];
  for (const name of allowedHeaders) {
    const value = headers.get(name);
    if (value) {
      reply.header(name, value);
    }
  }
  reply.header("Access-Control-Allow-Origin", "*");
  reply.header("X-Robots-Tag", "noindex");
};

const proxyRemoteMedia = async (
  request: FastifyRequest,
  reply: FastifyReply,
  sourceUrl: string,
  options: {
    headers?: Record<string, string | undefined>;
    timeoutMs?: number;
  } = {}
) => {
  const headers = new Headers();
  const range = request.headers.range;
  if (typeof range === "string") headers.set("range", range);
  for (const [name, value] of Object.entries(options.headers ?? {})) {
    if (value) headers.set(name, value);
  }
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs ?? 12000);

  try {
    let response = await fetch(sourceUrl, {
      method: request.raw.method,
      headers,
      cache: "no-store",
      signal: controller.signal
    });

    if (request.raw.method === "HEAD" && !response.ok) {
      response.body?.cancel();
      const fallbackHeaders = new Headers(headers);
      fallbackHeaders.set("range", "bytes=0-0");
      response = await fetch(sourceUrl, {
        method: "GET",
        headers: fallbackHeaders,
        cache: "no-store",
        signal: controller.signal
      });
    }

    setProxyHeaders(reply, response.headers);
    reply.code(response.status);

    if (request.raw.method === "HEAD") {
      response.body?.cancel();
      return reply.send();
    }

    if (!response.body) {
      return reply.send();
    }

    return reply.send(Readable.fromWeb(response.body as any));
  } finally {
    clearTimeout(timeoutId);
  }
};

const sendLocalFile = async (
  request: FastifyRequest,
  reply: FastifyReply,
  filepath: string,
  contentType: string
) => {
  const stat = await fs.stat(filepath);
  const rangeHeader = request.headers.range;
  const size = stat.size;

  reply.header("Content-Type", contentType);
  reply.header("Accept-Ranges", "bytes");
  reply.header("Cache-Control", "no-store");
  reply.header("X-Robots-Tag", "noindex");
  reply.header("Access-Control-Allow-Origin", "*");
  reply.header("Last-Modified", stat.mtime.toUTCString());

  if (typeof rangeHeader === "string" && /^bytes=/.test(rangeHeader)) {
    const parsedRange = parseByteRange(rangeHeader, size);
    if (!parsedRange) {
      reply.code(416);
      reply.header("Content-Range", `bytes */${size}`);
      return reply.send();
    }

    const { start, end } = parsedRange;
    const chunkSize = end - start + 1;

    reply.code(206);
    reply.header("Content-Length", chunkSize);
    reply.header("Content-Range", `bytes ${start}-${end}/${size}`);

    if (request.raw.method === "HEAD") {
      return reply.send();
    }

    return reply.send(createReadStream(filepath, { start, end }));
  }

  reply.code(200);
  reply.header("Content-Length", size);
  if (request.raw.method === "HEAD") {
    return reply.send();
  }

  return reply.send(createReadStream(filepath));
};

const withSoftTimeout = async <T>(promise: Promise<T>, timeoutMs: number) => {
  return new Promise<T | null>((resolve) => {
    const timeoutId = setTimeout(() => resolve(null), Math.max(250, timeoutMs));
    promise
      .then((value) => {
        clearTimeout(timeoutId);
        resolve(value);
      })
      .catch(() => {
        clearTimeout(timeoutId);
        resolve(null);
      });
  });
};

const sanitizeChatMessage = (value: string) =>
  value
    .trim()
    .slice(0, 360)
    .replace(/[^\w\s\-.'",!?()&:@/#]/g, "");

const normalizeSearchText = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const tokenizeSearchText = (value: string) =>
  normalizeSearchText(value)
    .split(" ")
    .filter((token) => token.length >= 2);

const nonEmptyText = (value?: string | null) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

const buildTrackLabel = (track: {
  title: string;
  artist: string;
  album?: string;
  year?: number;
}) => {
  const albumLine = track.album ? ` off ${track.album}` : "";
  const yearLine = track.year ? ` (${track.year})` : "";
  return `${track.title} by ${track.artist}${albumLine}${yearLine}`;
};

const soundsLikeSkipReply = (reply?: string | null) =>
  /\b(can(?:not|'t)? skip|skip(?:ping)?|move on|next song|current song)\b/i.test(reply ?? "");

const describeEnergy = (energy?: number) => {
  if (typeof energy !== "number") return "a loose midnight pulse";
  if (energy < 0.3) return "a candlelit drift";
  if (energy < 0.55) return "a slow-burn glide";
  if (energy < 0.75) return "a steady shoulder-roll";
  return "a bright electric charge";
};

const describeEra = (year?: number) => {
  if (!year) return "timeless";
  const decade = Math.floor(year / 10) * 10;
  return `${decade}s`;
};

const describeGenreEdge = (genres?: string[] | null) => {
  if (!Array.isArray(genres) || genres.length === 0) return "";
  return genres.filter(Boolean).slice(0, 2).join(" / ");
};

const hashText = (value: string) =>
  Array.from(value).reduce((total, character) => total * 31 + character.charCodeAt(0), 7);

const pickBySeed = <T,>(items: readonly T[], seed: number) => items[Math.abs(seed) % items.length];

const joinReplyLines = (...parts: Array<string | null | undefined>) =>
  parts
    .map((part) => part?.replace(/\s+/g, " ").trim())
    .filter((part): part is string => Boolean(part))
    .join(" ");

const takeFirstSentence = (value?: string | null) => {
  const cleaned = value?.replace(/\s+/g, " ").trim();
  if (!cleaned) return null;
  const first = cleaned.split(/(?<=[.!?])\s+/)[0]?.trim();
  return first && first.length > 0 ? first : cleaned;
};

const asksWhyThisTrack = (message: string) =>
  /\b(why this|why that|why now|how does this fit|why does this fit|why this song|why this track|why this record|why that record)\b/i.test(
    message
  );

const asksForMusicContext = (message: string) =>
  /\b(tell me about|take me deeper|deeper into|history|recording|recorded|structure|listen for|what should i hear|what am i hearing|how is this built|artist context|album context)\b/i.test(
    message
  );

const asksAboutLife = (message: string) =>
  /\b(life|love|lonely|alone|sad|heart|grief|miss|loss|lost|scared|anxious|anxiety|stress|stressed|work|job|family|friend|marriage|divorce|kids|tired|burned out|burnt out|wrung out|worn out|drained|fried|overwhelmed|overworked)\b/i.test(
    message
  );

const isConversationalCheckIn = (message: string) =>
  /\b(hello|hey|hi|yo|you there|what'?s up|how are you|how'?s it going|talk to me|tell me something|who are you)\b/i.test(
    message
  );

const messageMentionsTrack = (
  message: string,
  track?: { title?: string; artist?: string; album?: string } | null
) => {
  if (!track?.title && !track?.artist) return false;
  const normalizedMessage = normalizeSearchText(message);
  const title = normalizeSearchText(track.title ?? "");
  const artist = normalizeSearchText(track.artist ?? "");
  const album = normalizeSearchText(track.album ?? "");

  if (title && normalizedMessage.includes(title)) return true;
  if (artist && normalizedMessage.includes(artist)) return true;
  if (album && normalizedMessage.includes(album)) return true;

  const tokens = tokenizeSearchText(message);
  const titleHits = title
    ? tokens.filter((token) => title.split(" ").some((part) => part === token)).length
    : 0;
  const artistHits = artist
    ? tokens.filter((token) => artist.split(" ").some((part) => part === token)).length
    : 0;

  return titleHits >= 2 || artistHits >= 2;
};

const buildQueueListLine = (
  tracks: Array<{ title: string; artist: string; album?: string; year?: number }>
) => {
  if (tracks.length === 0) return "The next turn of the set is still being sketched in the headphones.";
  if (tracks.length === 1) return `On deck, I've got ${buildTrackLabel(tracks[0])}.`;
  return `On deck, I've got ${buildTrackLabel(tracks[0])}, then ${buildTrackLabel(tracks[1])}.`;
};

const listChatMessagesForClient = async (clientId?: string | null, limit = 24) => {
  const normalizedClientId = normalizeStationChatClientId(clientId);
  if (normalizedClientId) {
    return listStationChatSessionMessages(normalizedClientId, limit);
  }
  return listStationChatMessages(limit);
};

const syncBoothDossierNotes = async (signature: string, payload: BoothDossierSnapshot) => {
  try {
    await prisma.djScript.updateMany({
      where: {
        boothSignature: signature
      },
      data: {
        boothDossier: payload as Prisma.InputJsonValue
      }
    });
  } catch (error) {
    logger.error({ error, signature }, "Failed to sync booth dossier into notes");
  }
};

const rememberBoothDossierIntelligence = async (payload: BoothDossierSnapshot) => {
  try {
    await learnTrackInsightsFromBoothDossier(payload, {
      resolveTrack: (track) =>
        track.trackId
          ? library.getTrackById(track.trackId) ?? library.findByTitleArtist(track.title, track.artist)
          : library.findByTitleArtist(track.title, track.artist)
    });
  } catch (error) {
    logger.error({ error }, "Failed to teach track intelligence from booth dossier");
  }
};

const queueBoothDossierRefresh = async (
  context: DJContext,
  input: {
    djScript?: string | null;
    djReason?: string | null;
    programming?: DJProgrammingInfo | null;
    playbackPlans?: DJTrackPlaybackPlan[];
  },
  signature: string,
  existingSnapshotAt?: number | null
) => {
  if (!config.CHESHIRE_BASE_URL) return;
  if (!(await shouldQueueBoothRefresh(existingSnapshotAt))) return;

  const acquired = await redis.set(
    boothBuildingKey(signature),
    "1",
    "EX",
    Number(process.env.RADIO_HEARS_LOCK_SECONDS ?? 90),
    "NX"
  );
  if (acquired !== "OK") return;
  await noteBoothRefreshQueued();

  void (async () => {
    try {
      const generated = await withSoftTimeout(
        buildBoothDossier(context, input),
        Number(process.env.RADIO_HEARS_BACKGROUND_TIMEOUT_MS ?? 45000)
      );
      if (!generated) return;
      const payload: BoothDossierSnapshot = {
        ...generated,
        at: Date.now(),
        signature,
        source: "llm"
      };
      await redis.set(DJ_HEARS_KEY, JSON.stringify(payload), "EX", 6 * 60 * 60);
      await syncBoothDossierNotes(signature, payload);
      await rememberBoothDossierIntelligence(payload);
    } finally {
      await redis.del(boothBuildingKey(signature));
    }
  })();
};
type RequestMatchList = DJRequestMatch[];

const toRequestMatch = (track: {
  id: string;
  title: string;
  artist: string;
  album?: string;
  year?: number;
  genres?: string[];
  energy?: number;
}): DJRequestMatch => ({
  id: track.id,
  title: track.title,
  artist: track.artist,
  album: track.album,
  year: track.year,
  genres: track.genres,
  energy: typeof track.energy === "number" ? track.energy : 0.5
});

const findRequestMatches = async (message: string, limit = 5): Promise<RequestMatchList> => {
  const matches = await rankTracksForRequestLine(message, library.getTracks(), limit);
  return matches.map((track) => toRequestMatch(track as Track));
};

const buildChatRequestResponseKey = (requestId: string) => `${CHAT_REQUEST_RESPONSE_KEY}:${requestId}`;
const buildChatRequestLockKey = (requestId: string) => `${CHAT_REQUEST_LOCK_KEY}:${requestId}`;

const sleep = async (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

const waitForChatResponse = async (requestId: string, waitMs = 3200) => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < waitMs) {
    const cached = safeJson<Record<string, unknown>>(await redis.get(buildChatRequestResponseKey(requestId)));
    if (cached) return cached;
    await sleep(150);
  }
  return null;
};

const buildListenerRequestCandidates = async (
  context: DJContext,
  message: string,
  requestMatches: RequestMatchList
): Promise<DJRequestMatch[]> => {
  const broadLaneRequest = isBroadLaneRequest(message);
  const seen = new Set<string>();
  const candidates: Track[] = [];
  const add = (track?: Partial<DJRequestMatch> | null) => {
    if (!track?.id || !track.title || !track.artist) return;
    if (seen.has(track.id)) return;
    seen.add(track.id);
    const existing = library.getTrackById(track.id);
    if (existing) {
      candidates.push(existing);
      return;
    }
    candidates.push({
      id: track.id,
      path: track.id,
      title: track.title,
      artist: track.artist,
      album: track.album,
      year: track.year,
      genres: track.genres,
      energy: typeof track.energy === "number" ? track.energy : 0.5,
      moodTags: []
    });
  };

  requestMatches.forEach(add);
  (context.lockedQueuePreview ?? context.queuePreview.slice(0, 3)).forEach(add);
  context.queuePreview.slice(0, 4).forEach(add);
  context.recentTracks.slice(0, broadLaneRequest ? 6 : 3).forEach(add);
  context.feedbackTopLiked.slice(0, broadLaneRequest ? 4 : 2).forEach(add);
  context.librarySample.slice(0, broadLaneRequest ? 24 : 10).forEach(add);

  const candidateLimit = broadLaneRequest ? 16 : 12;
  const reranked = await rankTracksForRequestLine(message, candidates, candidateLimit);
  const ordered = reranked.length > 0 ? reranked : candidates.slice(0, candidateLimit);
  return ordered.map((track) => toRequestMatch(track));
};

const normalizeRequestedTrackIds = (trackIds: string[], matchedTrackId?: string | null) =>
  Array.from(
    new Set(
      [...trackIds, ...(matchedTrackId ? [matchedTrackId] : [])].filter(
        (trackId): trackId is string => typeof trackId === "string" && trackId.trim().length > 0 && Boolean(library.getTrackById(trackId))
      )
    )
  ).slice(0, 3);

const inferRequestIntent = (
  message: string,
  selectedTrackIds: string[],
  requestMatches: RequestMatchList
): "track" | "artist" | "album" | "genre" | "era" | "mood" | "special" | "broad" => {
  if (selectedTrackIds.length === 1 && requestMatches[0]?.id === selectedTrackIds[0]) {
    return "track";
  }
  if (/\b(album|record|lp)\b/i.test(message)) return "album";
  if (/\bartist|same artist|more from\b/i.test(message)) return "artist";
  if (/\bgenre|soul|jazz|ambient|dub|rock|house|techno|folk|hip hop|hip-hop|country|rnb|r&b|funk|disco\b/i.test(message))
    return "genre";
  if (/\b(19\d0s|20\d0s|\d{2}s|decade)\b/i.test(message)) return "era";
  if (/\bdeep cut|same decade|same artist|album run|special|spotlight|deep cuts\b/i.test(message)) return "special";
  if (/\bmood|feel|feeling|tone|lane|something|anything|more like this|take it|keep it\b/i.test(message)) return "mood";
  return selectedTrackIds.length > 1 ? "broad" : "track";
};

const buildRequestFacetSummary = (
  message: string,
  intent: ReturnType<typeof inferRequestIntent>,
  tracks: Array<{
    title: string;
    artist: string;
    album?: string;
    year?: number;
    genres?: string[];
  }>,
  explicitSummary?: string | null
) => {
  const cleanedExplicit = sanitizeRequest(explicitSummary ?? "");
  if (cleanedExplicit) return cleanedExplicit;

  if (tracks.length === 0) return sanitizeRequest(message);

  const cleanedMessage = sanitizeRequest(message);
  if (
    cleanedMessage &&
    cleanedMessage.length >= 18 &&
    !/\b(something|anything|more like this|take it|keep it)\b/i.test(cleanedMessage)
  ) {
    return cleanedMessage;
  }

  const artists = Array.from(new Set(tracks.map((track) => track.artist).filter(Boolean))).slice(0, 2);
  const albums = Array.from(new Set(tracks.map((track) => track.album).filter(Boolean))).slice(0, 1);
  const decades = Array.from(
    new Set(
      tracks
        .map((track) =>
          typeof track.year === "number" && Number.isFinite(track.year)
            ? `${Math.floor(track.year / 10) * 10}s`
            : null
        )
        .filter(Boolean)
    )
  ).slice(0, 1);
  const genres = Array.from(
    new Set(
      tracks
        .flatMap((track) => (Array.isArray(track.genres) ? track.genres.slice(0, 2) : []))
        .filter(Boolean)
    )
  ).slice(0, 2);

  switch (intent) {
    case "track":
      return buildTrackRequestSummary(tracks[0]);
    case "artist":
      return sanitizeRequest(`${artists[0] ?? tracks[0].artist} lane`);
    case "album":
      return sanitizeRequest(`${albums[0] ?? tracks[0].title} request`);
    case "genre":
      return sanitizeRequest([genres[0] ?? "genre", artists[0], "lane"].filter(Boolean).join(" "));
    case "era":
      return sanitizeRequest([decades[0] ?? "era", genres[0] ?? artists[0], "lane"].filter(Boolean).join(" "));
    case "special":
      return sanitizeRequest([cleanedMessage || "special", artists[0] ?? genres[0]].filter(Boolean).join(" "));
    case "mood":
    case "broad":
    default:
      return sanitizeRequest(
        [genres[0], decades[0], artists[0], tracks.length > 1 ? "set" : "lane"]
          .filter(Boolean)
          .join(" ")
      );
  }
};

const buildRequestLineResponse = (reply?: string | null) => {
  if (typeof reply !== "string") return null;
  const cleaned = reply.replace(/\s+/g, " ").trim();
  return cleaned.length > 0 ? cleaned.slice(0, 200) : null;
};

const findSkipTarget = (context: DJContext, message: string) => {
  const lockedQueue = (context.lockedQueuePreview ?? context.queuePreview.slice(0, getLockedQueueTarget())).slice(
    0,
    getLockedQueueTarget()
  );
  const now = context.nowPlaying;

  if (
    now?.title &&
    (messageMentionsTrack(message, now) || /\b(this one|right now|currently|on now|playing now)\b/i.test(message))
  ) {
    return {
      target: "current" as const,
      track: now
    };
  }

  const queuedMention = lockedQueue.find((track) => messageMentionsTrack(message, track));
  if (queuedMention) {
    return {
      target: "locked" as const,
      track: queuedMention
    };
  }

  if (/\b(next|up next|on deck|queued|queue)\b/i.test(message) && lockedQueue[0]) {
    return {
      target: "locked" as const,
      track: lockedQueue[0]
    };
  }

  return null;
};

const buildFallbackSkipReply = (context: DJContext, message: string): DJListenerReply => {
  const now = context.nowPlaying;
  const nowLine = now?.title
    ? pickBySeed(
        [
          `I'm spinning ${buildTrackLabel({
            title: now.title,
            artist: now.artist ?? "Unknown Artist",
            album: now.album,
            year: now.year
          })} at the moment.`,
          `The speakers are carrying ${buildTrackLabel({
            title: now.title,
            artist: now.artist ?? "Unknown Artist",
            album: now.album,
            year: now.year
          })}.`,
          `This hour is parked on ${buildTrackLabel({
            title: now.title,
            artist: now.artist ?? "Unknown Artist",
            album: now.album,
            year: now.year
          })}.`
        ] as const,
        hashText(message)
      )
    : pickBySeed(
        [
          "The signal is up and the next move is still in my hands.",
          "The station is live and I'm still shaping the next turn.",
          "The speakers are warm and I'm holding the line open."
        ] as const,
        hashText(message)
      );
  const skipTarget = findSkipTarget(context, message);

  if (!skipTarget?.track?.title || !skipTarget.track.artist) {
    return {
      reply: `${nowLine} If you want something pulled out of the loaded run, name the record and tell me why it breaks the spell.`,
      recommendationStatus: "none",
      skipDecision: "rejected",
      reason: "No current or locked track identified.",
      trackIds: now?.id ? [now.id] : []
    };
  }

  if (!hasStrongSkipReason(message)) {
    return {
      reply: `${nowLine} I do not yank a loaded record on a shrug. Give me a real reason tied to repetition, pacing, feel, or energy and I'll make the call.`,
      recommendationStatus: "none",
      skipDecision: "rejected",
      matchedTrackId: skipTarget.track.id ?? null,
      reason: "Skip needs a stronger reason.",
      trackIds: skipTarget.track.id ? [skipTarget.track.id] : []
    };
  }

  const targetLabel = buildTrackLabel({
    title: skipTarget.track.title,
    artist: skipTarget.track.artist,
    album: skipTarget.track.album,
    year: skipTarget.track.year
  });

  if (skipTarget.target === "current") {
    return {
      reply: `${nowLine} Fair shot. ${targetLabel} is missing the mark for this pass, and I'm cutting it now.`,
      recommendationStatus: "none",
      skipDecision: "approved",
      matchedTrackId: skipTarget.track.id ?? null,
      reason: "Approved skip for the current song.",
      trackIds: skipTarget.track.id ? [skipTarget.track.id] : []
    };
  }

  return {
    reply: `${nowLine} That's a real call. ${targetLabel} is already loaded, but I'm marking it for the blade when its slot comes up.`,
    recommendationStatus: "none",
    skipDecision: "approved",
    matchedTrackId: skipTarget.track.id ?? null,
    reason: "Approved skip for a locked upcoming song.",
    trackIds: skipTarget.track.id ? [skipTarget.track.id] : []
  };
};

const resolveListenerTrack = (
  track?:
    | {
        id?: string;
        title?: string;
        artist?: string;
        album?: string;
        year?: number;
        genres?: string[];
        energy?: number;
      }
    | null
): Track | null => {
  if (!track?.title || !track.artist) return null;
  return (
    (track.id ? library.getTrackById(track.id) : null) ??
    library.findByTitleArtist(track.title, track.artist) ??
    {
      id: track.id ?? `${track.artist}::${track.title}`,
      path: track.id ?? `${track.artist}::${track.title}`,
      title: track.title,
      artist: track.artist,
      album: track.album,
      year: track.year,
      genres: track.genres,
      energy: typeof track.energy === "number" ? track.energy : 0.5,
      moodTags: []
    }
  );
};

const buildFallbackListenerReply = async (
  context: DJContext,
  message: string,
  requestMatches: RequestMatchList,
  liveSnapshot?: DJListenerLiveSnapshot | null,
  requestCandidates: DJRequestMatch[] = []
): Promise<DJListenerReply> => {
  const now = context.nowPlaying;
  const messageSeed = hashText(message);
  const genreEdge = describeGenreEdge(now?.genres);
  const era = describeEra(now?.year);
  const energy = describeEnergy(now?.energy);
  const boothIntro = takeFirstSentence(liveSnapshot?.boothIntro);
  const lineupNote = takeFirstSentence(liveSnapshot?.lineupNote);
  const contextNote = takeFirstSentence(liveSnapshot?.contextNote);
  const listenForNote = takeFirstSentence(liveSnapshot?.listenForNote);
  const programmingLabel = nonEmptyText(liveSnapshot?.programmingLabel);
  const programmingDescription = takeFirstSentence(liveSnapshot?.programmingDescription);
  const currentRequestLine = liveSnapshot?.requestLine?.[0] ?? null;
  const nowLine = now?.title
    ? pickBySeed(
        [
          `${buildTrackLabel({
            title: now.title,
            artist: now.artist ?? "Unknown Artist",
            album: now.album,
            year: now.year
          })} is sitting at the center of this turn.`,
          `I've got ${buildTrackLabel({
            title: now.title,
            artist: now.artist ?? "Unknown Artist",
            album: now.album,
            year: now.year
          })} on the speakers at the moment.`,
          `The cut in the air is ${buildTrackLabel({
            title: now.title,
            artist: now.artist ?? "Unknown Artist",
            album: now.album,
            year: now.year
          })}.`,
          `At this minute the dial belongs to ${buildTrackLabel({
            title: now.title,
            artist: now.artist ?? "Unknown Artist",
            album: now.album,
            year: now.year
          })}.`
        ] as const,
        messageSeed
      )
    : pickBySeed(
        [
          "The station is live and I'm still shaping the next turn.",
          "The speakers are warm and the next move is still taking shape.",
          "The signal is up and the next record is still in my hands."
        ] as const,
        messageSeed
      );
  const queueLead = context.queuePreview.slice(0, 2);
  const queueLine = buildQueueListLine(queueLead);
  const currentMention =
    messageMentionsTrack(message, now) ||
    context.recentTracks.some((track) => messageMentionsTrack(message, track));
  const queueMention = queueLead.find((track) => messageMentionsTrack(message, track));
  const asksAboutIanTaste = /\bian\b|\bpersonal\b|\btaste\b/i.test(message);
  const broadLaneRequest = isBroadLaneRequest(message);
  const requestLaneTracks =
    (requestMatches.length > 0 ? requestMatches : requestCandidates).slice(0, 3);
  const boothFrameLine =
    lineupNote ??
    boothIntro ??
    (programmingLabel
      ? `${programmingLabel} is the shape of the turn and ${now?.title ?? "the current record"} is holding the center of it.`
      : null);
  const nextMoveLine =
    takeFirstSentence(liveSnapshot?.nextMove)
      ? `Next I am threading toward ${takeFirstSentence(liveSnapshot?.nextMove)}`
      : queueLine;
  const currentLineSummary = currentRequestLine?.summary
    ? `The line is also humming with ${currentRequestLine.summary}.`
    : context.requests[0]
      ? `The line is also humming with ${context.requests[0]}.`
      : "";
  const nowResolved = resolveListenerTrack(now);
  const nextResolved = resolveListenerTrack(queueLead[0]);
  const requestLaneResolved = requestLaneTracks
    .map((track) => resolveListenerTrack(track))
    .filter((track): track is Track => Boolean(track));
  const insightTracks = Array.from(
    new Map(
      [nowResolved, nextResolved, ...requestLaneResolved]
        .filter((track): track is Track => Boolean(track))
        .map((track) => [track.id, track] as const)
    ).values()
  );
  const insightMap = insightTracks.length > 0 ? await getTrackInsightMap(insightTracks) : new Map();
  const resolveInsight = (track?: Track | null) => (track ? insightMap.get(track.id) ?? null : null);
  const buildKnowledge = (track?: Track | null) =>
    track ? buildTrackKnowledgeCard(track, resolveInsight(track) ?? buildTrackInsightScaffold(track)) : null;
  const nowKnowledge = buildKnowledge(nowResolved);
  const nowTurn = nowResolved
    ? buildTrackTurnIntelligence(nowResolved, {
        insight: resolveInsight(nowResolved) ?? undefined,
        nextTrack: nextResolved,
        context
      })
    : null;

  if (looksLikeSkipRequest(message)) {
    return buildFallbackSkipReply(context, message);
  }

  if (looksLikeRecommendation(message) || broadLaneRequest) {
    const match = requestMatches[0];
    if (!match && currentMention && now?.title && now?.artist) {
      return {
        reply: `${nowLine} ${buildTrackLabel({
          title: now.title,
          artist: now.artist,
          album: now.album,
          year: now.year
        })} is already in the smoke right now, so I am not doubling back that fast. Let this one breathe and hit me with the next left turn.`,
        recommendationStatus: "rejected",
        recommendationSummary: `${now.title} by ${now.artist}`,
        matchedTrackId: now.id ?? null,
        reason: "Current record already on air.",
        trackIds: now.id ? [now.id] : []
      };
    }
    if (!match && queueMention) {
      return {
        reply: `${nowLine} ${buildTrackLabel(queueMention)} is already tucked into the run, so you and I are thinking the same dirty little thought. Stay with me and you'll hear it soon.`,
        recommendationStatus: "accepted",
        recommendationSummary: `${queueMention.title} by ${queueMention.artist}`,
        matchedTrackId: queueMention.id,
        reason: "Already in the live queue.",
        trackIds: [queueMention.id]
      };
    }
    if (!match && broadLaneRequest && requestLaneTracks.length > 0) {
      const leadTrack = requestLaneTracks[0]!;
      const leadResolved = resolveListenerTrack(leadTrack);
      const leadKnowledge = buildKnowledge(leadResolved);
      const leadTurn = leadResolved
        ? buildTrackTurnIntelligence(leadResolved, {
            insight: resolveInsight(leadResolved) ?? undefined,
            previousTrack: nowResolved,
            context
          })
        : null;
      const leadContext = takeFirstSentence(
        leadKnowledge?.historicalAnchor ?? leadKnowledge?.trackStory ?? leadTurn?.context
      );
      const leadSetReason = takeFirstSentence(leadKnowledge?.setReason ?? leadTurn?.whyItFits);
      return {
        reply: joinReplyLines(
          programmingLabel
            ? `${programmingLabel} is already giving this hour a shape, and your ask slides into it clean.`
            : boothFrameLine ?? nowLine,
          `That is a real lane. I can answer it with ${requestLaneTracks
            .map((track) => buildTrackLabel(track))
            .join(", ")}. ${buildTrackLabel(leadTrack)} is the front door. ${leadSetReason ?? "It gives the request line a real shape instead of a vague nod."}`,
          leadContext,
          currentLineSummary || "I'm pinning that ask to the line and waiting for the seam."
        ),
        recommendationStatus: "accepted",
        recommendationSummary: null,
        matchedTrackId: leadTrack.id,
        reason: "Pinned broad lane request with candidate tracks.",
        trackIds: requestLaneTracks.map((track) => track.id)
      };
    }
    if (!match) {
      return {
        reply: joinReplyLines(
          nowLine,
          boothFrameLine,
          "I am not getting a clean pull for that one in the crates tonight, so I am passing for now.",
          "Give me an artist, a title, or even just the shape of the feeling and I will dig deeper through the shelves."
        ),
        recommendationStatus: "rejected",
        reason: "No close library match.",
        trackIds: now?.id ? [now.id] : []
      };
    }

    if (broadLaneRequest && requestLaneTracks.length > 1) {
      const leadTrack = requestLaneTracks[0];
      const leadResolved = resolveListenerTrack(leadTrack);
      const leadKnowledge = buildKnowledge(leadResolved);
      const leadTurn = leadResolved
        ? buildTrackTurnIntelligence(leadResolved, {
            insight: resolveInsight(leadResolved) ?? undefined,
            previousTrack: nowResolved,
            context
          })
        : null;
      const leadContext = takeFirstSentence(
        leadKnowledge?.historicalAnchor ?? leadKnowledge?.trackStory ?? leadTurn?.context
      );
      const leadSetReason = takeFirstSentence(leadKnowledge?.setReason ?? leadTurn?.whyItFits);
      return {
        reply: joinReplyLines(
          nowLine,
          programmingLabel
            ? `${programmingLabel} is already giving me a contour, and your ask fits it instead of fighting it.`
            : boothFrameLine,
          `That is a real lane, not just a single cut. I can answer it with ${requestLaneTracks
            .map((track) => buildTrackLabel(track))
            .join(", ")}. ${buildTrackLabel(leadTrack)} leads the turn. ${leadSetReason ?? "It actually moves the stack instead of just matching the label on the ask."}`,
          leadContext,
          currentLineSummary
        ),
        recommendationStatus: "accepted",
        recommendationSummary: null,
        matchedTrackId: leadTrack.id,
        reason: "Pinned broad request to the line.",
        trackIds: requestLaneTracks.map((track) => track.id)
      };
    }

    const matchResolved = resolveListenerTrack(match);
    const matchKnowledge = buildKnowledge(matchResolved);
    const matchTurn = matchResolved
      ? buildTrackTurnIntelligence(matchResolved, {
          insight: resolveInsight(matchResolved) ?? undefined,
          previousTrack: nowResolved,
          context
        })
      : null;
    return {
      reply: joinReplyLines(
        nowLine,
        boothFrameLine,
        `${buildTrackLabel(match)} is exactly the sort of trouble I like. ${takeFirstSentence(matchKnowledge?.setReason ?? matchTurn?.whyItFits) ?? "It does more than fit the ask; it actually gives the hour a sharper contour."}`,
        takeFirstSentence(matchKnowledge?.historicalAnchor ?? matchKnowledge?.trackStory ?? matchTurn?.context),
        currentLineSummary
      ),
      recommendationStatus: "accepted",
      recommendationSummary: null,
      matchedTrackId: match.id,
      reason: "Pinned to the request line.",
      trackIds: [match.id]
    };
  }

  if (asksAboutLife(message)) {
    const humanLine = pickBySeed(
      [
        "Some hours are less about answers and more about having a real voice on the other end.",
        "That sounds like the kind of thing music cannot fix, but it can absolutely sit with.",
        "I hear the weight in that, and I am not going to brush it off with a throwaway line.",
        "That kind of feeling deserves a little company before it needs a plan."
      ] as const,
      messageSeed + 1
    );
    const laneLine =
      broadLaneRequest && now?.title && now.artist
        ? boothFrameLine ??
          `${buildTrackLabel({
            title: now.title,
            artist: now.artist,
            album: now.album,
            year: now.year
          })} is the hand on the shoulder for this stretch. ${
            takeFirstSentence(nowKnowledge?.setReason ?? nowTurn?.whyItFits) ??
            "it holds the air without trying to clean up the edges of the night."
          }`
        : null;
    const whyLine =
      asksWhyThisTrack(message) && now?.title && now.artist
        ? lineupNote ??
          (takeFirstSentence(nowKnowledge?.setReason ?? nowTurn?.whyItFits) ??
            (genreEdge
              ? `${genreEdge} is the color in it, but the real reason it belongs is the way the record keeps the pulse alive without crowding your head.`
              : `The reason it belongs is the way it keeps the pulse alive without crowding your head.`))
        : null;
    const musicLine = now?.title
      ? contextNote ??
        (takeFirstSentence(nowKnowledge?.historicalAnchor ?? nowKnowledge?.trackStory ?? nowTurn?.context) ??
          `${buildTrackLabel({
            title: now.title,
            artist: now.artist ?? "Unknown Artist",
            album: now.album,
            year: now.year
          })} is carrying some of that weight for me tonight, with ${energy} and ${
            genreEdge ? `${genreEdge.toLowerCase()} written into the arrangement` : `${era} character around the edges`
          }.`)
      : queueLine;

    return {
      reply: joinReplyLines(
        nowLine,
        humanLine,
        laneLine ?? musicLine,
        whyLine,
        broadLaneRequest ? nextMoveLine : null
      ),
      recommendationStatus: "none",
      reason: "Life conversation fallback.",
      trackIds: [now?.id, ...queueLead.map((track) => track.id)].filter(Boolean) as string[]
    };
  }

  if (isConversationalCheckIn(message)) {
    const checkInLine = pickBySeed(
      [
        "I'm here, ears open, hands on the faders, and still chasing the next right turn.",
        "Very much here. I'm listening to the air, the stack, and whatever you've got on your mind.",
        "I'm good in the way a DJ gets good: a live signal, a strong record, and somebody talking back.",
        "Right here. Tell me what you need and I'll answer from the shelves instead of from a script."
      ] as const,
      messageSeed + 11
    );

    return {
      reply: joinReplyLines(checkInLine, boothFrameLine ?? nowLine, nextMoveLine),
      recommendationStatus: "none",
      reason: "Conversational check-in fallback.",
      trackIds: [now?.id, ...queueLead.map((track) => track.id)].filter(Boolean) as string[]
    };
  }

  if (asksAboutIanTaste) {
    const tasteLine = now?.title
      ? `If you want Ian's taste in one glance, it is ${genreEdge ? `${genreEdge.toLowerCase()} with ` : ""}${energy} and a ${era} heartbeat.`
      : "If you want Ian's taste in one glance, it is all about mood, left turns, and records that leave a mark after the needle lifts.";
    return {
      reply: joinReplyLines(nowLine, tasteLine, boothFrameLine, nextMoveLine),
      recommendationStatus: "none",
      reason: "Personal taste update.",
      trackIds: [now?.id, ...queueLead.map((track) => track.id)].filter(Boolean) as string[]
    };
  }

  if (asksWhyThisTrack(message) && now?.title && now.artist) {
    const whyFitsLine =
      lineupNote ??
      (takeFirstSentence(nowKnowledge?.setReason ?? nowTurn?.whyItFits) ??
        (genreEdge
          ? `${genreEdge} is the color of it, but the real reason it fits here is that it keeps ${energy} moving while still leaving the next record somewhere to go.`
          : `The reason it fits is that it carries ${energy} and still leaves the next move a clean opening.`));
    const transitionLine =
      listenForNote ?? takeFirstSentence(nowKnowledge?.listenFor ?? nowTurn?.listenFor) ??
      (queueLead[0] && queueLead[0].title && queueLead[0].artist
        ? `It also points cleanly toward ${buildTrackLabel(queueLead[0])} instead of tripping over it.`
        : nextMoveLine);

    return {
      reply: joinReplyLines(nowLine, whyFitsLine, transitionLine),
      recommendationStatus: "none",
      reason: "Current track fit explanation.",
      trackIds: [now.id, ...queueLead.map((track) => track.id)].filter(Boolean) as string[]
    };
  }

  if (asksForMusicContext(message)) {
    const focusTrack = requestMatches[0] ?? queueMention ?? now ?? queueLead[0];
    const focusResolved = resolveListenerTrack(focusTrack);
    const focusKnowledge = buildKnowledge(focusResolved);
    const focusTurn = focusResolved
      ? buildTrackTurnIntelligence(focusResolved, {
          insight: resolveInsight(focusResolved) ?? undefined,
          previousTrack: nowResolved,
          nextTrack: nextResolved,
          context
        })
      : null;
    const focusGenreEdge = describeGenreEdge(focusTrack?.genres);
    const focusEra = describeEra(focusTrack?.year);
    const focusEnergy = describeEnergy(focusTrack?.energy);

    if (focusTrack?.title && focusTrack.artist) {
      const focusLabel = buildTrackLabel({
        title: focusTrack.title,
        artist: focusTrack.artist,
        album: focusTrack.album,
        year: focusTrack.year
      });
      const contextLine =
        contextNote ??
        (takeFirstSentence(focusKnowledge?.historicalAnchor ?? focusKnowledge?.trackStory ?? focusTurn?.context) ??
          (focusGenreEdge
            ? `${focusLabel} carries ${focusGenreEdge.toLowerCase()} in the arrangement, the rhythm pocket, and the way the record breathes, not just on the sleeve.`
            : `${focusLabel} works because the pocket stays alive without overselling itself.`));
      const structureLine = focusTrack.album
        ? `Hearing it against ${focusTrack.album} matters too, because that album frame changes where the tension sits.`
        : `The shape is in the balance between ${focusEnergy} and that ${focusEra} texture around the edges.`;
      const listenLine =
        listenForNote ?? takeFirstSentence(focusKnowledge?.listenFor ?? focusTurn?.listenFor) ??
        (now?.id && focusTrack.id === now.id
          ? "Stay with the little shifts in weight inside the rhythm section; that is where the record really opens up."
          : `If it lands tonight, listen for how it changes the pocket around ${now?.title ?? "the current turn"}.`);

      return {
        reply: joinReplyLines(nowLine, contextLine, structureLine, listenLine),
        recommendationStatus: "none",
        reason: "Music context fallback.",
        trackIds: [focusTrack.id, now?.id, ...queueLead.map((track) => track.id)].filter(Boolean) as string[]
      };
    }
  }

  const factLine = now?.title
    ? takeFirstSentence(nowKnowledge?.historicalAnchor ?? nowKnowledge?.trackStory ?? nowTurn?.factLine) ??
      `${genreEdge ? `${genreEdge} is painting the edges, ` : ""}${era} on the clock, ${energy} in the floorboards.`
    : "";
  const requestLine = currentLineSummary;
  const fallbackTurnLine = pickBySeed(
    [
      nextMoveLine,
      queueLine,
      "I am keeping the next move close to the live stack instead of chasing yesterday's loudest nod.",
      "The next answer is coming from the current turn, the queue, and the shape of your ask."
    ] as const,
    messageSeed + 23
  );

  return {
    reply: joinReplyLines(
      nowLine,
      boothFrameLine ?? factLine,
      contextNote,
      fallbackTurnLine,
      requestLine
    ),
    recommendationStatus: "none",
    reason: "Station update.",
    trackIds: [now?.id, ...queueLead.map((track) => track.id)].filter(Boolean) as string[]
  };
};

const requireAdmin = (request: { headers: Record<string, string | string[] | undefined> }) => {
  const key = request.headers["x-admin-key"];
  if (!key || (Array.isArray(key) ? key[0] : key) !== config.RADIO_ADMIN_API_KEY) {
    throw new Error("Unauthorized");
  }
};

export const buildServer = () => {
  const app = Fastify({ logger: true });
  let featuredCache: { data: any; ts: number } | null = null;

  app.register(cors, { origin: true });

  const buildChatWelcomeMessage = async () => {
    const [mood, nowRaw, djMetaRaw] = await Promise.all([
      redis.get("station:mood"),
      redis.get(NOW_KEY),
      redis.get(DJ_SAYS_META_KEY)
    ]);
    const now = safeJson<{
      id?: string;
      title?: string;
      artist?: string;
      album?: string;
      year?: number;
    }>(nowRaw);
    const djMeta = safeJson<{
      script?: string;
      mood?: string;
      trackIds?: string[];
    }>(djMetaRaw);

    const welcomeSeed = hashText(
      [djMeta?.mood ?? mood ?? config.RADIO_MOOD, now?.title ?? "", now?.artist ?? ""].join("::"),
    );
    const seededScript = now?.title
      ? pickBySeed(
          [
            `Come on in. I've got ${buildTrackLabel({
              title: now.title,
              artist: now.artist ?? "Unknown Artist",
              album: now.album,
              year: now.year
            })} moving through the speakers. Ask why it's here, steer the lane, or tell me what's on your mind.`,
            `Line's open. ${buildTrackLabel({
              title: now.title,
              artist: now.artist ?? "Unknown Artist",
              album: now.album,
              year: now.year
            })} is on the turntable. Throw me a request, a mood, or something from your life.`,
            `Step in. ${buildTrackLabel({
              title: now.title,
              artist: now.artist ?? "Unknown Artist",
              album: now.album,
              year: now.year
            })} is carrying the air. Ask for context, ask for a lane, or just talk to me.`
          ] as const,
          welcomeSeed
        )
      : pickBySeed(
          [
            "Come on in. Tell me what you're hearing, what you need, or throw something on the line.",
            "Line's open. Ask for a cut, a mood, or just tell me how the night is landing.",
            "Step in. Give me a record, a feeling, or a real thought and I'll answer from the speakers."
          ] as const,
          welcomeSeed
        );

    return createStationChatMessage({
      role: "dj",
      kind: "welcome",
      text: seededScript,
      mood: djMeta?.mood ?? mood ?? config.RADIO_MOOD,
      trackIds: djMeta?.trackIds ?? (now?.id ? [now.id] : [])
    });
  };

  const ensureChatSeeded = async () => {
    const existing = await listStationChatMessages(1);
    if (existing.length > 0) return;

    const acquired = await redis.set(CHAT_SEED_LOCK_KEY, "1", "EX", 12, "NX");
    if (acquired !== "OK") {
      await sleep(120);
      return;
    }

    try {
      const latest = await listStationChatMessages(1);
      if (latest.length > 0) return;
      await pushStationChatMessage(await buildChatWelcomeMessage());
    } finally {
      await redis.del(CHAT_SEED_LOCK_KEY);
    }
  };

  const ensureChatSessionSeeded = async (clientId?: string | null) => {
    const normalizedClientId = normalizeStationChatClientId(clientId);
    if (!normalizedClientId) return null;

    const existing = await listStationChatSessionMessages(normalizedClientId, 1);
    if (existing.length > 0) return normalizedClientId;

    const acquired = await redis.set(
      buildChatSessionSeedLockKey(normalizedClientId),
      "1",
      "EX",
      12,
      "NX"
    );
    if (acquired !== "OK") {
      await sleep(120);
      return normalizedClientId;
    }

    try {
      const latest = await listStationChatSessionMessages(normalizedClientId, 1);
      if (latest.length > 0) return normalizedClientId;

      await pushStationChatSessionMessage(normalizedClientId, await buildChatWelcomeMessage());
      return normalizedClientId;
    } finally {
      await redis.del(buildChatSessionSeedLockKey(normalizedClientId));
    }
  };

  app.get("/healthz", async () => ({ ok: true, ts: Date.now() }));

  app.get("/readyz", async (_request, reply) => {
    const [liquidsoapReady, liquidsoapQueue, libraryLastScanRaw, nowRaw] = await Promise.all([
      isLiquidsoapReady(),
      readQueuedRequests(),
      redis.get(LIBRARY_LAST_SCAN_KEY),
      redis.get(NOW_KEY)
    ]);
    const libraryLastScanAt = libraryLastScanRaw ? Number(libraryLastScanRaw) : null;
    const hasRecentLibraryScan =
      typeof libraryLastScanAt === "number" &&
      Number.isFinite(libraryLastScanAt) &&
      Date.now() - libraryLastScanAt <
        Math.max(5 * 60 * 1000, config.RADIO_LIBRARY_REFRESH_SECONDS * 12 * 1000);
    const trackCount = library.getTracks().length;
    const hasFallbackSource = Boolean(config.MPLAYER_STREAM_URL);
    const hasProgramSource = trackCount > 0 || hasFallbackSource;
    const now = safeJson<{ startedAt?: string }>(nowRaw);
    const nowStartedAt = now?.startedAt ? Date.parse(now.startedAt) : Number.NaN;
    const recentPlaybackWindowMs = Math.max(20 * 60 * 1000, config.RADIO_LIBRARY_REFRESH_SECONDS * 8 * 1000);
    const hasRecentPlayback =
      Number.isFinite(nowStartedAt) && Date.now() - nowStartedAt < recentPlaybackWindowMs;
    const queueDepth = Array.isArray(liquidsoapQueue) ? liquidsoapQueue.length : null;
    const hasLiveBuffer = (queueDepth ?? 0) > 0 || hasRecentPlayback || hasFallbackSource;
    const ok = liquidsoapReady && hasRecentLibraryScan && hasProgramSource && hasLiveBuffer;

    reply.code(ok ? 200 : 503);
    return {
      ok,
      ts: Date.now(),
      checks: {
        liquidsoap: {
          ok: liquidsoapReady,
          queueDepth
        },
        library: {
          ok: hasProgramSource && hasRecentLibraryScan,
          tracks: trackCount,
          snippets: library.getSnippets().length,
          podcasts: library.getPodcasts().length,
          lastScanAt: libraryLastScanAt,
          recent: hasRecentLibraryScan
        },
        playback: {
          ok: hasLiveBuffer,
          fallbackSourceConfigured: hasFallbackSource,
          recentTrackActivity: hasRecentPlayback,
          recentTrackWindowMs: recentPlaybackWindowMs,
          nowStartedAt: Number.isFinite(nowStartedAt) ? new Date(nowStartedAt).toISOString() : null
        }
      }
    };
  });

  app.get("/status", async () => {
    const [
      queuedTrackIds,
      nowRaw,
      mood,
      lastTalk,
      djMode,
      djLastDecision,
      djLastPlaylistRaw,
      djSaysMetaRaw,
      libraryLastScanRaw,
      feedbackRaw,
      requestLine,
      requestLineDepth,
      requestLineItems
    ] = await Promise.all([
      readQueuedTrackIds(),
      redis.get(NOW_KEY),
      redis.get("station:mood"),
      redis.get("station:last_talk_at"),
      redis.get(DJ_MODE_KEY),
      redis.get(DJ_LAST_DECISION_KEY),
      redis.get(DJ_LAST_PLAYLIST_KEY),
      redis.get(DJ_SAYS_META_KEY),
      redis.get(LIBRARY_LAST_SCAN_KEY),
      redis.hgetall(FEEDBACK_SCORES_KEY),
      readStationRequestSummaries(6),
      countStationRequests(),
      readStationRequests(6)
    ]);
    const queueDepth = queuedTrackIds.length;
    const now = nowRaw ? JSON.parse(nowRaw) : null;
    const feedbackTop = Object.entries(feedbackRaw)
      .map(([trackId, score]) => ({ trackId, score: Number(score ?? 0) }))
      .filter((item) => Number.isFinite(item.score) && item.score !== 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map((item) => {
        const track = library.getTrackById(item.trackId);
        return {
          trackId: item.trackId,
          score: item.score,
          title: track?.title ?? "Unknown Track",
          artist: track?.artist ?? "Unknown Artist"
        };
      });
    const moodFrame = buildCurrentMoodFrame({
      rawMood: mood ?? config.RADIO_MOOD,
      queueDepth,
      requestCount: Number(requestLineDepth ?? 0),
      recentLead: now?.artist ?? now?.title
    });
    return {
      mood: moodFrame.mood,
      queueDepth,
      nowPlaying: now,
      lastTalkAt: lastTalk ? Number(lastTalk) : null,
      djMode: djMode ?? defaultDJ.id,
      djLastDecisionAt: djLastDecision ? Number(djLastDecision) : null,
      djLastPlaylist: safeJson(djLastPlaylistRaw),
      djSaysMeta: safeJson(djSaysMetaRaw),
      libraryLastScanAt: libraryLastScanRaw ? Number(libraryLastScanRaw) : null,
      libraryTracks: library.getTracks().length,
      snippets: library.getSnippets().length,
      podcastSeries: library.getPodcasts().length,
      podcastEpisodes: library.getPodcasts().reduce((total, series) => total + series.episodeCount, 0),
      losslessTracks: library.getTracks().filter((track) => track.lossless).length,
      highResTracks: library.getTracks().filter((track) => isHighResTrack(track)).length,
      queueTarget: getLockedQueueTarget(),
      lockedQueueSize: getLockedQueueTarget(),
      feedbackTop,
      requestLine: requestLine.filter(Boolean),
      requestLineItems: requestLineItems.map((item) => ({
        id: item.id,
        summary: item.summary,
        listenerMessage: item.listenerMessage ?? null,
        response: item.response ?? null,
        trackId: item.trackId ?? null,
        trackIds: Array.isArray(item.trackIds) ? item.trackIds : [],
        source: item.source ?? null,
        status: item.status ?? null,
        intent: item.intent ?? null,
        createdAt: item.createdAt,
        tracks: (
          Array.isArray(item.trackIds) && item.trackIds.length > 0
            ? item.trackIds
            : item.trackId
              ? [item.trackId]
              : []
        )
          .map((trackId) => library.getTrackById(trackId))
          .filter(Boolean)
          .map((track) => ({
            id: track!.id,
            title: track!.title,
            artist: track!.artist,
            album: track!.album,
            year: track!.year
          }))
      })),
      requestLineDepth,
      llmDirector: {
        active: Boolean(config.CHESHIRE_BASE_URL),
        driving: (djMode ?? defaultDJ.id).startsWith(defaultDJ.id),
        name: "Mr Rassy",
        model: config.CHESHIRE_MODEL
      }
    };
  });

  app.get("/public/now", async () => {
    const nowRaw = await redis.get(NOW_KEY);
    const now = safeJson<{
      id?: string;
      title?: string;
      artist?: string;
      album?: string;
      albumArtUrl?: string;
      year?: number;
      genres?: string[];
      energy?: number;
      startedAt?: string;
    }>(nowRaw);
    if (!now) return null;
    const match = now.id
      ? library.getTrackById(now.id)
      : library.findByTitleArtist(now.title, now.artist);
    const publicTrack = match ? toPublicTrack(match) : null;
    return {
      ...now,
      ...(publicTrack ?? {}),
      title: now.title ?? publicTrack?.title,
      artist: now.artist ?? publicTrack?.artist,
      album: now.album ?? publicTrack?.album,
      year: now.year ?? publicTrack?.year,
      genres: now.genres ?? publicTrack?.genres,
      energy: now.energy ?? publicTrack?.energy,
      albumArtUrl: now.albumArtUrl ?? publicTrack?.albumArtUrl,
      streamUrl: publicTrack?.streamUrl,
      hasArtwork: publicTrack?.hasArtwork ?? Boolean(now.albumArtUrl)
    };
  });

  app.get("/public/queue", async () => {
    const ids = await readQueuedTrackIds(8);
    const items = ids
      .map((id) => library.getTrackById(id))
      .filter(Boolean)
      .map((track) => ({
        ...toPublicTrack(track!)
      }));
    return items;
  });

  app.get("/public/dj", async () => {
    const [djSays, djMetaRaw] = await Promise.all([redis.get(DJ_SAYS_KEY), redis.get(DJ_SAYS_META_KEY)]);
    const meta = safeJson<{
      script?: string;
      mood?: string;
      source?: string;
      reason?: string | null;
      trackIds?: string[];
      at?: number;
    }>(djMetaRaw);
    const moodFrame = meta?.mood
      ? buildCurrentMoodFrame({
          rawMood: meta.mood,
          recentLead: meta.trackIds?.[0]
        })
      : null;
    return {
      script: meta?.script ?? djSays,
      mood: moodFrame?.mood ?? null,
      source: meta?.source ?? null,
      reason: meta?.reason ?? null,
      trackIds: Array.isArray(meta?.trackIds) ? meta?.trackIds : [],
      at: typeof meta?.at === "number" ? meta.at : null
    };
  });

  app.get("/public/notes", async (request, reply) => {
    const querySchema = z.object({
      limit: z.coerce.number().int().min(1).max(120).optional()
    });
    const parsed = querySchema.safeParse(request.query);
    if (!parsed.success) {
      reply.code(400);
      return { error: "Invalid query" };
    }

    const rows = await prisma.djScript.findMany({
      orderBy: {
        createdAt: "desc"
      },
      take: parsed.data.limit ?? 24
    });

    return {
      notes: rows.map((row) => {
        const trackIds = parseTrackIds(row.trackIds);
        const currentTrack = toNoteTrack(row.currentTrack);
        const storedSetlist = parseNoteTrackList(row.setlist, 10);
        const boothDossier = parseNoteBoothDossier(row.boothDossier);
        const resolvedSetlist =
          storedSetlist.length > 0
            ? storedSetlist
            : parseNoteTrackList(trackIds.map((trackId) => library.getTrackById(trackId)), 10);
        const eventType =
          row.eventType === "playlist" || row.eventType === "manual" ? row.eventType : "talk";

        return {
          id: row.id,
          title: buildRadioNoteTitle({
            mood: row.mood,
            currentTrack,
            setlist: resolvedSetlist,
            eventType
          }),
          excerpt: buildRadioNoteExcerpt(
            boothDossier?.sections?.lineup?.body ??
              boothDossier?.intro ??
              boothDossier?.deepCut ??
              row.script
          ),
          script: row.script,
          mood: row.mood ?? null,
          source: row.source,
          reason: row.reason ?? null,
          eventType,
          trackIds,
          currentTrack,
          setlist: resolvedSetlist,
          boothDossier,
          createdAt: row.createdAt.toISOString()
        };
      })
    };
  });

  app.get("/public/hears", async () => {
    const [cachedRaw, djMetaRaw] = await Promise.all([redis.get(DJ_HEARS_KEY), redis.get(DJ_SAYS_META_KEY)]);
    const cached = toBoothDossierSnapshot(safeJson<unknown>(cachedRaw));

    try {
      const djMeta = safeJson<{
        script?: string;
        reason?: string | null;
        programming?: DJProgrammingInfo | null;
        playbackPlans?: DJTrackPlaybackPlan[];
        trackIds?: string[];
      }>(djMetaRaw);
      const context = await buildHearsContext();
      const input = buildBoothInputForContext(context, {
        djScript: djMeta?.script ?? null,
        djReason: djMeta?.reason ?? null,
        programming: djMeta?.programming ?? null,
        playbackPlans: Array.isArray(djMeta?.playbackPlans) ? djMeta.playbackPlans : [],
        trackIds: Array.isArray(djMeta?.trackIds) ? djMeta.trackIds : []
      });
      const signature = buildBoothSignature(context, input);
      const cachedAt = typeof cached?.at === "number" ? cached.at : 0;
      const cacheAgeMs = cached ? Date.now() - cachedAt : Number.POSITIVE_INFINITY;
      const canReuseLlm =
        cached?.signature === signature && cached.source === "llm" && cacheAgeMs < 20 * 60 * 1000;
      const canReuseFallback =
        cached?.signature === signature && cached.source === "fallback" && cacheAgeMs < 90 * 1000;

      if (canReuseLlm && cached) {
        void syncBoothDossierNotes(signature, cached);
        void rememberBoothDossierIntelligence(cached);
        return cached;
      }

      if (canReuseFallback && cached) {
        void queueBoothDossierRefresh(context, input, signature, cachedAt);
        return cached;
      }

      const directLlm = await withSoftTimeout(
        buildBoothDossier(context, input),
        config.RADIO_HEARS_INLINE_TIMEOUT_MS
      );
      if (directLlm) {
        const payload: BoothDossierSnapshot = {
          ...directLlm,
          at: Date.now(),
          signature,
          source: "llm"
        };
        await redis.set(DJ_HEARS_KEY, JSON.stringify(payload), "EX", 6 * 60 * 60);
        void syncBoothDossierNotes(signature, payload);
        void rememberBoothDossierIntelligence(payload);
        return payload;
      }

      const payload: BoothDossierSnapshot = {
        ...buildFallbackBoothDossier(context, input),
        at: Date.now(),
        signature,
        source: "fallback"
      };

      await redis.set(DJ_HEARS_KEY, JSON.stringify(payload), "EX", 6 * 60 * 60);
      void syncBoothDossierNotes(signature, payload);
      void queueBoothDossierRefresh(context, input, signature);
      return payload;
    } catch (error) {
      logger.error({ error }, "Failed to build booth dossier snapshot");
      if (cached) {
        return cached;
      }
      throw error;
    }
  });

  app.get("/public/chat", async (request, reply) => {
    const querySchema = z.object({
      clientId: z.string().min(8).max(120).optional()
    });
    const parsed = querySchema.safeParse(request.query);
    if (!parsed.success) {
      reply.code(400);
      return { error: "Invalid query" };
    }

    const clientId = normalizeStationChatClientId(parsed.data.clientId);
    await ensureChatSeeded();
    if (clientId) {
      await ensureChatSessionSeeded(clientId);
    }
    return {
      messages: await listChatMessagesForClient(clientId, 28)
    };
  });

  app.post("/public/chat", async (request, reply) => {
    const bodySchema = z.object({
      message: z.string().min(2).max(360),
      clientId: z.string().min(8).max(120).optional(),
      requestId: z.string().min(8).max(120).optional()
    });
    const parsed = bodySchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: "Invalid message" };
    }

    const safeMessage = sanitizeChatMessage(parsed.data.message);
    const clientId = normalizeStationChatClientId(parsed.data.clientId);
    const requestId = parsed.data.requestId?.trim() ?? null;
    if (safeMessage.length < 2) {
      reply.code(400);
      return { error: "Message too short" };
    }

    if (requestId) {
      const cached = safeJson<Record<string, unknown>>(await redis.get(buildChatRequestResponseKey(requestId)));
      if (cached) {
        return cached;
      }

      const acquired = await redis.set(buildChatRequestLockKey(requestId), "1", "EX", 25, "NX");
      if (acquired !== "OK") {
        const pending = await waitForChatResponse(requestId);
        if (pending) {
          return pending;
        }
        reply.code(202);
        return {
          ok: true,
          pending: true,
          messages: await listChatMessagesForClient(clientId, 28)
        };
      }
    }

    await ensureChatSeeded();
    if (clientId) {
      await ensureChatSessionSeeded(clientId);
    }
    const recentMessages = await listChatMessagesForClient(clientId, 6);
    const latestListener = [...recentMessages]
      .reverse()
      .find((entry) => entry.role === "listener");
    const alreadyHasDjFollowUp = latestListener
      ? recentMessages.some(
          (entry) =>
            entry.role === "dj" &&
            entry.createdAt >= latestListener.createdAt
        )
      : false;
    if (
      latestListener &&
      latestListener.text === safeMessage &&
      Date.now() - latestListener.createdAt < 12_000
    ) {
      const duplicatePayload = {
        ok: true,
        pending: !alreadyHasDjFollowUp,
        messages: recentMessages
      };
      if (requestId) {
        await redis.set(
          buildChatRequestResponseKey(requestId),
          JSON.stringify(duplicatePayload),
          "EX",
          5 * 60
        );
        await redis.del(buildChatRequestLockKey(requestId));
      }
      return duplicatePayload;
    }

    if (clientId) {
      const acquiredMessageLock = await redis.set(
        buildChatMessageLockKey(clientId, safeMessage),
        "1",
        "EX",
        15,
        "NX"
      );
      if (acquiredMessageLock !== "OK") {
        const duplicatePayload = {
          ok: true,
          pending: !alreadyHasDjFollowUp,
          messages: await listChatMessagesForClient(clientId, 28)
        };
        if (requestId) {
          await redis.set(
            buildChatRequestResponseKey(requestId),
            JSON.stringify(duplicatePayload),
            "EX",
            5 * 60
          );
          await redis.del(buildChatRequestLockKey(requestId));
        }
        return duplicatePayload;
      }
    }

    const listenerMessage = createStationChatMessage({
      role: "listener",
      kind: "chat",
      text: safeMessage
    });
    await noteRecentChatActivity();
    await pushStationChatMessage(listenerMessage);
    if (clientId) {
      await pushStationChatSessionMessage(clientId, listenerMessage);
    }

    const buildReplyPayload = async () => {
      try {
        const [context, existingMessages, liveSnapshot] = await Promise.all([
          buildListenerChatContext(),
          listChatMessagesForClient(clientId, 14),
          buildListenerLiveSnapshot()
        ]);
        const recentChat = existingMessages
          .slice(-10)
          .map((entry) => ({ role: entry.role, text: entry.text, createdAt: entry.createdAt }));
        const requestMatches = await findRequestMatches(safeMessage, 5);
        const requestCandidates = await buildListenerRequestCandidates(context, safeMessage, requestMatches);
        const requestCandidateIds = new Set(requestCandidates.map((track) => track.id));
        const recommendationIntent =
          looksLikeRecommendation(safeMessage) || isBroadLaneRequest(safeMessage);
        const skipIntent = looksLikeSkipRequest(safeMessage);
        const skipTarget = skipIntent ? findSkipTarget(context, safeMessage) : null;
        const strongSkipReason = skipIntent ? hasStrongSkipReason(safeMessage) : false;
        const llmReply = defaultDJ.replyToListener
          ? await withSoftTimeout(
              defaultDJ.replyToListener(context, {
                message: safeMessage,
                recentChat,
                requestMatches,
                requestCandidates,
                liveSnapshot
              }),
              Number(process.env.RADIO_CHAT_LLM_TIMEOUT_MS ?? 8000)
            )
          : null;
        let replySource: "llm" | "fallback" = llmReply ? "llm" : "fallback";
        let generatedReply =
          llmReply ??
          (await buildFallbackListenerReply(
            context,
            safeMessage,
            requestMatches,
            liveSnapshot,
            requestCandidates
          ));
        if (
          recommendationIntent &&
          requestCandidates.length > 0 &&
          generatedReply.matchedTrackId &&
          !requestCandidateIds.has(generatedReply.matchedTrackId)
        ) {
          replySource = "fallback";
          generatedReply = await buildFallbackListenerReply(
            context,
            safeMessage,
            requestMatches,
            liveSnapshot,
            requestCandidates
          );
        }
        if (skipIntent && (!skipTarget || !strongSkipReason)) {
          replySource = "fallback";
          generatedReply = buildFallbackSkipReply(context, safeMessage);
        }
        if (skipIntent && !generatedReply.skipDecision) {
          replySource = "fallback";
          generatedReply = buildFallbackSkipReply(context, safeMessage);
        }
        if (!skipIntent && soundsLikeSkipReply(generatedReply.reply)) {
          replySource = "fallback";
          generatedReply = await buildFallbackListenerReply(
            context,
            safeMessage,
            requestMatches,
            liveSnapshot,
            requestCandidates
          );
        }

        const proposedTrackIds = normalizeRequestedTrackIds(
          Array.isArray(generatedReply.trackIds) ? generatedReply.trackIds : [],
          generatedReply.matchedTrackId ?? null
        );
        const hasExplicitRecommendation = proposedTrackIds.length > 0;
        const recommendationStatus = resolveListenerRecommendationStatus({
          generatedStatus: generatedReply.recommendationStatus,
          recommendationIntent,
          hasExplicitRecommendation,
          hasRecommendationSummary: Boolean(nonEmptyText(generatedReply.recommendationSummary))
        });
        const skipDecision =
          skipIntent && strongSkipReason && generatedReply.skipDecision === "approved" && skipTarget?.track?.id
            ? "approved"
            : skipIntent
              ? "rejected"
              : "none";
        const matchedTrackId =
          generatedReply.matchedTrackId ??
          (skipIntent
            ? skipTarget?.track?.id ?? null
            : recommendationStatus !== "none"
              ? proposedTrackIds[0] ?? null
              : null);
        const matchedTrack = matchedTrackId ? library.getTrackById(matchedTrackId) : null;
        const liveTrackIds = new Set(
          [context.nowPlaying?.id, ...context.queuePreview.map((track) => track.id)].filter(Boolean) as string[]
        );
        const trackIds = normalizeRequestedTrackIds(
          Array.isArray(generatedReply.trackIds) ? generatedReply.trackIds : [],
          matchedTrackId
        );
        const requestIntent = inferRequestIntent(safeMessage, trackIds, requestMatches);
        const summaryTracks = trackIds
          .map((trackId) => library.getTrackById(trackId))
          .filter((track): track is Track => Boolean(track));
        const recommendationSummary =
          recommendationStatus === "none"
            ? null
            : buildRequestFacetSummary(
                safeMessage,
                requestIntent,
                summaryTracks.length > 0 ? summaryTracks : matchedTrack ? [matchedTrack] : [],
                generatedReply.recommendationSummary
              );
        const requestTrackIds = trackIds.filter((trackId) => !liveTrackIds.has(trackId));

        if (recommendationStatus !== "none" && recommendationSummary) {
          await prisma.requestLog.create({
            data: {
              request: sanitizeRequest(recommendationSummary),
              status: recommendationStatus
            }
          });
          if (recommendationStatus !== "rejected" && requestTrackIds.length > 0) {
            await enqueueStationRequest({
              kind: "track",
              summary: recommendationSummary,
              listenerMessage: safeMessage,
              response: buildRequestLineResponse(generatedReply.reply),
              trackId: requestTrackIds[0],
              trackIds: requestTrackIds,
              source: "chat",
              status: recommendationStatus,
              intent: requestIntent
            });
          }
        }

        if (skipIntent) {
          const skipSummary =
            matchedTrack && matchedTrack.title && matchedTrack.artist
              ? `Skip ${buildTrackRequestSummary(matchedTrack)}`
              : `Skip ${sanitizeRequest(safeMessage)}`;
          await prisma.requestLog.create({
            data: {
              request: skipSummary,
              status: skipDecision === "approved" ? "skip-approved" : "skip-rejected"
            }
          });
          if (skipDecision === "approved" && matchedTrackId) {
            if (skipTarget?.target === "current") {
              await skipCurrent();
            } else {
              await markTrackForSkip(matchedTrackId);
            }
          }
        }

        const djMessage = createStationChatMessage({
          role: "dj",
          kind: "chat",
          text: generatedReply.reply,
          createdAt: listenerMessage.createdAt + 1,
          replyToMessageId: listenerMessage.id,
          replySource,
          mood: generatedReply.mood ?? context.mood,
          recommendationStatus,
          recommendationSummary,
          matchedTrackId,
          trackIds
        });
        if (replySource === "fallback") {
          logger.warn(
            {
              clientId,
              requestId,
              listenerMessageId: listenerMessage.id,
              reason: generatedReply.reason ?? null
            },
            "Built station chat reply with local fallback"
          );
        }
        await pushStationChatMessage(djMessage);
        if (clientId) {
          await pushStationChatSessionMessage(clientId, djMessage);
        }

        const responsePayload = {
          ok: true,
          pending: false,
          reply: djMessage,
          messages: await listChatMessagesForClient(clientId, 28)
        };
        if (requestId) {
          await redis.set(buildChatRequestResponseKey(requestId), JSON.stringify(responsePayload), "EX", 5 * 60);
        }

        return responsePayload;
      } catch (error) {
        logger.error({ error, clientId, requestId }, "Failed to build station chat reply");
        const djMessage = createStationChatMessage({
          role: "dj",
          kind: "chat",
          text: "Give me one more second on that. The signal slipped, but I’m still right here.",
          createdAt: listenerMessage.createdAt + 1,
          replyToMessageId: listenerMessage.id,
          replySource: "error",
          mood: config.RADIO_MOOD
        });
        await pushStationChatMessage(djMessage);
        if (clientId) {
          await pushStationChatSessionMessage(clientId, djMessage);
        }

        const responsePayload = {
          ok: true,
          pending: false,
          reply: djMessage,
          messages: await listChatMessagesForClient(clientId, 28)
        };
        if (requestId) {
          await redis.set(buildChatRequestResponseKey(requestId), JSON.stringify(responsePayload), "EX", 5 * 60);
        }
        return responsePayload;
      } finally {
        if (requestId) {
          await redis.del(buildChatRequestLockKey(requestId));
        }
      }
    };

    const replyPromise = buildReplyPayload();
    const immediateReply = await withSoftTimeout(
      replyPromise,
      Number(process.env.RADIO_CHAT_SYNC_WAIT_MS ?? 3200)
    );
    if (immediateReply) {
      return immediateReply;
    }

    reply.code(202);
    return {
      ok: true,
      pending: true,
      messages: await listChatMessagesForClient(clientId, 28)
    };
  });

  app.get("/public/featured", async () => {
    const ttlMs = 60 * 1000;
    if (featuredCache && Date.now() - featuredCache.ts < ttlMs) {
      const cachedItems = Array.isArray(featuredCache.data?.items)
        ? featuredCache.data.items
        : [];
      if (cachedItems.length > 0 || library.getTracks().length === 0) {
        return featuredCache.data;
      }
    }

    const tracks = library.getTracks();
    let fallback: ReturnType<typeof toPublicTrack>[] = [];
    try {
      const context = await buildContext();
      fallback = rankTracks(tracks, {
        mood: context.mood,
        dayPart: context.dayPart,
        dayOfWeek: context.dayOfWeek,
        emotionalWeather: context.emotionalWeather,
        bannedTrackIds: new Set(context.bans.trackIds),
        bannedArtists: new Set(context.bans.artists.map((artist) => artist.toLowerCase())),
        recentTrackIds: new Set([
          ...(context.nowPlaying?.id ? [context.nowPlaying.id] : []),
          ...context.queuePreview.map((track: Track) => track.id),
          ...context.recentTrackCooldownIds
        ]),
        recentTrackSignatures: new Set(context.recentTrackCooldownSignatures ?? []),
        recentArtists: new Set(context.recentArtistCooldownSet ?? []),
        feedbackScores: context.feedbackScoreMap,
        feedbackWeight: config.RADIO_FEEDBACK_WEIGHT
      })
        .slice(0, 8)
        .map(({ track }: { track: Track }) => toPublicTrack(track));
    } catch (error) {
      logger.warn({ error }, "Featured fallback could not use live context");
    }
    if (fallback.length === 0) {
      fallback = tracks
        .map((track: Track) => ({ track, sort: hashText(`${track.id}:${Math.floor(Date.now() / (60 * 60 * 1000))}`) }))
        .sort((left, right) => left.sort - right.sort)
        .slice(0, 8)
        .map(({ track }) => toPublicTrack(track));
    }
    const payload = { items: fallback };
    featuredCache = { data: payload, ts: Date.now() };
    return payload;
  });

  app.get("/public/library", async (request, reply) => {
    const querySchema = z.object({
      q: z.string().optional(),
      limit: z.coerce.number().int().min(1).max(200).optional(),
      offset: z.coerce.number().int().min(0).optional()
    });
    const parsed = querySchema.safeParse(request.query);
    if (!parsed.success) {
      reply.code(400);
      return { error: "Invalid query" };
    }

    const q = parsed.data.q?.trim() ?? null;
    const limit = parsed.data.limit ?? 60;
    const offset = parsed.data.offset ?? 0;
    const filtered = library.getTracks().filter((track) => matchesTrackQuery(track, q));
    const items = filtered.slice(offset, offset + limit).map(toPublicTrack);

    return {
      items,
      q,
      total: filtered.length,
      offset,
      limit,
      stats: {
        totalTracks: library.getTracks().length,
        losslessTracks: library.getTracks().filter((track) => track.lossless).length,
        highResTracks: library.getTracks().filter((track) => isHighResTrack(track)).length,
        djIdentifiers: library.getSnippets().length
      },
      djIdentifiers: library.getSnippets().map((snippet) => ({
        id: snippet.id,
        label: snippet.label,
        duration: snippet.duration,
        format: snippet.format
      }))
    };
  });

  app.get("/public/library/tracks/:trackId/stream", async (request, reply) => {
    const paramsSchema = z.object({ trackId: z.string().min(4) });
    const parsed = paramsSchema.safeParse(request.params);
    if (!parsed.success) {
      reply.code(400);
      return { error: "Invalid track" };
    }

    const track = library.getTrackById(parsed.data.trackId);
    if (!track) {
      reply.code(404);
      return { error: "Track not found" };
    }

    try {
      if (toStreamUrl(track.path)) {
        return await proxyRemoteMedia(request, reply, track.path);
      }
      return await sendLocalFile(request, reply, track.path, getAudioContentType(track.path));
    } catch (error) {
      logger.error({ error, trackId: track.id }, "Failed to stream track");
      reply.code(502);
      return { error: "stream_unavailable" };
    }
  });

  app.get("/public/library/tracks/:trackId/artwork", async (request, reply) => {
    const paramsSchema = z.object({ trackId: z.string().min(4) });
    const parsed = paramsSchema.safeParse(request.params);
    if (!parsed.success) {
      reply.code(400);
      return { error: "Invalid track" };
    }

    const track = library.getTrackById(parsed.data.trackId);
    if (!track) {
      reply.code(404);
      return { error: "Track not found" };
    }

    if (track.albumArtUrl && toStreamUrl(track.albumArtUrl)) {
      try {
        return await proxyRemoteMedia(request, reply, track.albumArtUrl);
      } catch (error) {
        logger.warn({ error, trackId: track.id }, "Remote artwork proxy failed");
      }
    }

    if (toStreamUrl(track.path)) {
      reply.code(404);
      return { error: "artwork_not_found" };
    }

    const artwork = await readArtwork(track.path);
    if (!artwork) {
      reply.code(404);
      return { error: "artwork_not_found" };
    }

    reply.header("Cache-Control", "no-store");
    reply.header("Access-Control-Allow-Origin", "*");
    reply.header("X-Robots-Tag", "noindex");

    if (artwork.type === "embedded") {
      reply.header("Content-Type", artwork.format ?? "image/jpeg");
      return reply.send(artwork.data);
    }

    return await sendLocalFile(request, reply, artwork.path, getImageContentType(artwork.path));
  });

  app.get("/public/podcasts", async () => {
    const series = library.getPodcasts().map(toPublicPodcastSeries);
    return {
      show: PODCAST_SHOW,
      series,
      totalSeries: series.length,
      totalEpisodes: series.reduce((total, item) => total + item.episodeCount, 0),
      updatedAt: series[0]?.updatedAt ?? new Date().toISOString()
    };
  });

  app.get("/public/podcast-episodes/:episodeId/stream", async (request, reply) => {
    const paramsSchema = z.object({ episodeId: z.string().min(4) });
    const parsed = paramsSchema.safeParse(request.params);
    if (!parsed.success) {
      reply.code(400);
      return { error: "Invalid episode" };
    }

    const episode = library.getPodcastEpisodeById(parsed.data.episodeId);
    if (!episode) {
      reply.code(404);
      return { error: "Episode not found" };
    }

    try {
      return await sendLocalFile(request, reply, episode.path, getAudioContentType(episode.path));
    } catch (error) {
      logger.error({ error, episodeId: episode.id }, "Failed to stream podcast episode");
      reply.code(502);
      return { error: "stream_unavailable" };
    }
  });

  app.get("/public/podcast-episodes/:episodeId/artwork", async (request, reply) => {
    const paramsSchema = z.object({ episodeId: z.string().min(4) });
    const parsed = paramsSchema.safeParse(request.params);
    if (!parsed.success) {
      reply.code(400);
      return { error: "Invalid episode" };
    }

    const episode = library.getPodcastEpisodeById(parsed.data.episodeId);
    if (!episode) {
      reply.code(404);
      return { error: "Episode not found" };
    }

    const artwork = await readArtwork(episode.path);
    if (!artwork) {
      reply.code(404);
      return { error: "artwork_not_found" };
    }

    reply.header("Cache-Control", "no-store");
    reply.header("Access-Control-Allow-Origin", "*");
    reply.header("X-Robots-Tag", "noindex");

    if (artwork.type === "embedded") {
      reply.header("Content-Type", artwork.format ?? "image/jpeg");
      return reply.send(artwork.data);
    }

    return await sendLocalFile(request, reply, artwork.path, getImageContentType(artwork.path));
  });

  app.get("/public/photos", async (request, reply) => {
    const querySchema = z.object({
      limit: z.coerce.number().int().min(1).max(120).optional(),
      source: z.enum(["immich", "local"]).optional()
    });
    const parsed = querySchema.safeParse(request.query);
    if (!parsed.success) {
      reply.code(400);
      return { error: "Invalid query" };
    }

    const items = library.getPhotos();
    const filteredItems = parsed.data.source
      ? items.filter((item) => item.source === parsed.data.source)
      : items;
    const limit = parsed.data.limit ?? 60;
    const visibleItems = filteredItems.slice(0, limit);

    return {
      items: visibleItems.map(toPublicPhoto),
      total: filteredItems.length,
      counts: {
        images: filteredItems.filter((item) => item.kind === "image").length,
        videos: filteredItems.filter((item) => item.kind === "video").length
      },
      sources: buildPhotoSourceSummary(items),
      updatedAt: visibleItems[0]?.updatedAt ?? items[0]?.updatedAt ?? new Date().toISOString()
    };
  });

  app.get("/public/photos/:mediaId/file", async (request, reply) => {
    const paramsSchema = z.object({ mediaId: z.string().min(4) });
    const parsed = paramsSchema.safeParse(request.params);
    if (!parsed.success) {
      reply.code(400);
      return { error: "Invalid media" };
    }

    const item = library.getPhotoById(parsed.data.mediaId);
    if (!item) {
      reply.code(404);
      return { error: "Media not found" };
    }

    try {
      if (item.source === "immich") {
        const sourceUrl = buildImmichAssetUrl(item, "file");
        if (!sourceUrl) {
          reply.code(404);
          return { error: "Media not found" };
        }
        return await proxyRemoteMedia(request, reply, sourceUrl, {
          headers: {
            "x-api-key": config.IMMICH_API_KEY
          },
          timeoutMs: config.IMMICH_REQUEST_TIMEOUT_MS
        });
      }

      if (!item.path) {
        reply.code(404);
        return { error: "Media not found" };
      }
      return await sendLocalFile(
        request,
        reply,
        item.path,
        item.kind === "video" ? getVideoContentType(item.path) : getImageContentType(item.path)
      );
    } catch (error) {
      logger.error({ error, mediaId: item.id }, "Failed to stream photo library item");
      reply.code(502);
      return { error: "media_unavailable" };
    }
  });

  app.get("/public/photos/:mediaId/preview", async (request, reply) => {
    const paramsSchema = z.object({ mediaId: z.string().min(4) });
    const parsed = paramsSchema.safeParse(request.params);
    if (!parsed.success) {
      reply.code(400);
      return { error: "Invalid media" };
    }

    const item = library.getPhotoById(parsed.data.mediaId);
    if (!item || item.kind !== "image") {
      reply.code(404);
      return { error: "Media not found" };
    }

    try {
      if (item.source === "immich") {
        const sourceUrl = buildImmichAssetUrl(item, "preview");
        if (!sourceUrl) {
          reply.code(404);
          return { error: "Media not found" };
        }
        return await proxyRemoteMedia(request, reply, sourceUrl, {
          headers: {
            "x-api-key": config.IMMICH_API_KEY
          },
          timeoutMs: config.IMMICH_REQUEST_TIMEOUT_MS
        });
      }

      if (!item.path) {
        reply.code(404);
        return { error: "Media not found" };
      }
      if (isBrowserSafeImage(item)) {
        return await sendLocalFile(request, reply, item.path, getImageContentType(item.path));
      }

      const previewPath = await ensureImagePreview(item.path);
      return await sendLocalFile(request, reply, previewPath, "image/jpeg");
    } catch (error) {
      logger.warn({ error, mediaId: item.id }, "Photo preview unavailable");
      reply.code(502);
      return { error: "preview_unavailable" };
    }
  });

  app.get("/public/photos/:mediaId/poster", async (request, reply) => {
    const paramsSchema = z.object({ mediaId: z.string().min(4) });
    const parsed = paramsSchema.safeParse(request.params);
    if (!parsed.success) {
      reply.code(400);
      return { error: "Invalid media" };
    }

    const item = library.getPhotoById(parsed.data.mediaId);
    if (!item) {
      reply.code(404);
      return { error: "Media not found" };
    }

    try {
      if (item.source === "immich") {
        const sourceUrl = buildImmichAssetUrl(item, "poster");
        if (!sourceUrl) {
          reply.code(404);
          return { error: "Media not found" };
        }
        return await proxyRemoteMedia(request, reply, sourceUrl, {
          headers: {
            "x-api-key": config.IMMICH_API_KEY
          },
          timeoutMs: config.IMMICH_REQUEST_TIMEOUT_MS
        });
      }

      if (!item.path) {
        reply.code(404);
        return { error: "Media not found" };
      }
      if (item.kind === "image") {
        if (isBrowserSafeImage(item)) {
          return await sendLocalFile(request, reply, item.path, getImageContentType(item.path));
        }

        const previewPath = await ensureImagePreview(item.path);
        return await sendLocalFile(request, reply, previewPath, "image/jpeg");
      }

      const posterPath = await ensureVideoPoster(item.path);
      return await sendLocalFile(request, reply, posterPath, "image/jpeg");
    } catch (error) {
      logger.warn({ error, mediaId: item.id }, "Photo poster unavailable");
      reply.code(502);
      return { error: "poster_unavailable" };
    }
  });

  app.post("/public/request", async (request, reply) => {
    const bodySchema = z.object({ request: z.string().min(3).max(120) });
    const parsed = bodySchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: "Invalid request" };
    }
    const safeRequest = sanitizeRequest(parsed.data.request);
    const matchedTrack = (await findRequestMatches(safeRequest, 1))[0];
    const summary = matchedTrack ? buildTrackRequestSummary(matchedTrack) : safeRequest;
    const liveTrackIds = new Set([
      ...(await readQueuedTrackIds(12)),
      safeJson<{ id?: string }>(await redis.get(NOW_KEY))?.id
    ].filter(Boolean) as string[]);
    await prisma.requestLog.create({ data: { request: summary } });
    if (!matchedTrack?.id || !liveTrackIds.has(matchedTrack.id)) {
      await enqueueStationRequest({
        kind: "track",
        summary,
        trackId: matchedTrack?.id ?? null,
        trackIds: matchedTrack?.id ? [matchedTrack.id] : [],
        listenerMessage: safeRequest,
        response: "Sent in from the request form.",
        source: "form",
        status: "accepted",
        intent: matchedTrack ? "track" : "broad"
      });
    }
    return {
      ok: true,
      matchedTrackId: matchedTrack?.id ?? null,
      alreadyLive: matchedTrack?.id ? liveTrackIds.has(matchedTrack.id) : false
    };
  });

  app.post("/public/feedback", async (request, reply) => {
    const bodySchema = z.object({
      vote: z.enum(["up", "down"]),
      trackId: z.string().optional(),
      title: z.string().optional(),
      artist: z.string().optional()
    });
    const parsed = bodySchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: "Invalid vote" };
    }
    const nowRaw = await redis.get(NOW_KEY);
    const now = nowRaw ? JSON.parse(nowRaw) : null;
    const matched = now?.title && now?.artist ? library.findByTitleArtist(now.title, now.artist) : null;
    const trackId = parsed.data.trackId ?? now?.id ?? matched?.id ?? null;
    const payload = {
      trackId,
      vote: parsed.data.vote,
      title: parsed.data.title ?? now?.title ?? null,
      artist: parsed.data.artist ?? now?.artist ?? null,
      at: Date.now()
    };
    let currentScore: number | null = null;
    if (trackId) {
      const delta = parsed.data.vote === "up" ? 1 : -1;
      currentScore = await redis.hincrby(FEEDBACK_SCORES_KEY, trackId, delta);
    }
    await redis.lpush(FEEDBACK_RECENT_KEY, JSON.stringify(payload));
    await redis.ltrim(FEEDBACK_RECENT_KEY, 0, 199);
    if (trackId) {
      await prisma.trackVote.create({
        data: {
          trackId,
          title: payload.title,
          artist: payload.artist,
          vote: parsed.data.vote === "up" ? 1 : -1
        }
      });
    }
    return { ok: true, trackId, score: currentScore };
  });

  app.get("/public/feedback", async (request, reply) => {
    const querySchema = z.object({ trackId: z.string().min(4) });
    const parsed = querySchema.safeParse(request.query);
    if (!parsed.success) {
      reply.code(400);
      return { error: "Invalid track" };
    }
    const { trackId } = parsed.data;
    const [totalUp, totalDown, scoreRaw] = await Promise.all([
      prisma.trackVote.count({ where: { trackId, vote: 1 } }),
      prisma.trackVote.count({ where: { trackId, vote: -1 } }),
      redis.hget(FEEDBACK_SCORES_KEY, trackId)
    ]);
    const series: { day: Date; up: number; down: number }[] = await prisma.$queryRaw`SELECT date_trunc('day', "createdAt") as day,
        SUM(CASE WHEN vote = 1 THEN 1 ELSE 0 END)::int as up,
        SUM(CASE WHEN vote = -1 THEN 1 ELSE 0 END)::int as down
      FROM "TrackVote"
      WHERE "trackId" = ${trackId}
        AND "createdAt" >= NOW() - INTERVAL '7 days'
      GROUP BY day
      ORDER BY day ASC;`;
    return {
      trackId,
      score: Number(scoreRaw ?? 0),
      totals: { up: totalUp, down: totalDown },
      series: series.map((row) => ({
        day: row.day.toISOString().slice(0, 10),
        up: Number(row.up ?? 0),
        down: Number(row.down ?? 0)
      }))
    };
  });

  app.post("/public/queue", async (request, reply) => {
    const bodySchema = z.object({ trackId: z.string().min(4) });
    const parsed = bodySchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: "Invalid track" };
    }
    const track = library.getTrackById(parsed.data.trackId);
    if (!track) {
      reply.code(404);
      return { error: "Track not found" };
    }
    const liveTrackIds = new Set([
      ...(await readQueuedTrackIds(12)),
      safeJson<{ id?: string }>(await redis.get(NOW_KEY))?.id
    ].filter(Boolean) as string[]);
    if (!liveTrackIds.has(track.id)) {
      await enqueueStationRequest({
        kind: "track",
        summary: buildTrackRequestSummary(track),
        trackId: track.id,
        trackIds: [track.id],
        listenerMessage: buildTrackRequestSummary(track),
        response: "Picked from the listening shelf.",
        source: "featured",
        status: "accepted",
        intent: "track"
      });
    }
    await prisma.requestLog.create({
      data: {
        request: buildTrackRequestSummary(track),
        status: "featured"
      }
    });
    return { ok: true, mode: liveTrackIds.has(track.id) ? "already-live" : "request-line" };
  });

  app.post("/admin/mood", async (request, reply) => {
    try {
      requireAdmin(request);
    } catch {
      reply.code(401);
      return { error: "Unauthorized" };
    }
    const bodySchema = z.object({ mood: z.string().min(2) });
    const parsed = bodySchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: "Invalid mood" };
    }
    await redis.set("station:mood", parsed.data.mood);
    await prisma.adminAction.create({ data: { action: "mood", payload: parsed.data } });
    return { ok: true };
  });

  app.post("/admin/skip", async (request, reply) => {
    try {
      requireAdmin(request);
    } catch {
      reply.code(401);
      return { error: "Unauthorized" };
    }
    await skipCurrent();
    await prisma.adminAction.create({ data: { action: "skip" } });
    return { ok: true };
  });

  app.post("/admin/ban", async (request, reply) => {
    try {
      requireAdmin(request);
    } catch {
      reply.code(401);
      return { error: "Unauthorized" };
    }
    const bodySchema = z.object({ trackId: z.string().optional(), artist: z.string().optional() });
    const parsed = bodySchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: "Invalid ban" };
    }
    if (parsed.data.trackId) {
      await redis.sadd("station:ban:tracks", parsed.data.trackId);
    }
    if (parsed.data.artist) {
      await redis.sadd("station:ban:artists", parsed.data.artist.toLowerCase());
    }
    await prisma.adminAction.create({ data: { action: "ban", payload: parsed.data } });
    return { ok: true };
  });

  app.post("/admin/stinger", async (request, reply) => {
    try {
      requireAdmin(request);
    } catch {
      reply.code(401);
      return { error: "Unauthorized" };
    }
    const bodySchema = z.object({ snippetId: z.string().optional() });
    const parsed = bodySchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: "Invalid snippet" };
    }
    const snippet = parsed.data.snippetId
      ? library.getSnippets().find((item) => item.id === parsed.data.snippetId)
      : library.getSnippets()[Math.floor(Math.random() * library.getSnippets().length)];
    if (!snippet) {
      reply.code(404);
      return { error: "No snippet available" };
    }
    const snippetGate = await getSnippetPlaybackGateState();
    if (!snippetGate.allowed) {
      reply.code(429);
      return {
        error: snippetGate.reason === "queued" ? "Snippet already queued" : "Snippet cooldown active",
        availableAt: snippetGate.availableAt ? new Date(snippetGate.availableAt).toISOString() : null
      };
    }
    const queued = await pushToQueue(
      buildSnippetQueueUri(snippet, {
        trimThresholdSeconds: config.RADIO_SNIPPET_TRIM_THRESHOLD_SECONDS,
        playWindowSeconds: config.RADIO_SNIPPET_PLAY_WINDOW_SECONDS
      })
    );
    if (!queued) {
      reply.code(502);
      return { error: "Live queue unavailable" };
    }
    await redis.rpush(QUEUE_KEY, `snippet:${snippet.id}`);
    await rememberRecentSnippet(snippet.id);
    await prisma.adminAction.create({ data: { action: "stinger", payload: { snippetId: snippet.id } } });
    return { ok: true };
  });

  app.post("/admin/talk", async (request, reply) => {
    try {
      requireAdmin(request);
    } catch {
      reply.code(401);
      return { error: "Unauthorized" };
    }
    const bodySchema = z.object({ script: z.string().min(6).optional() });
    const parsed = bodySchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: "Invalid talk" };
    }
    const script = parsed.data.script ?? "Mr Rassy is live in the booth and the records are breathing.";
    const mood = (await redis.get("station:mood")) ?? config.RADIO_MOOD;
    const context = await buildContext();
    await publishDjScript({
      script,
      mood,
      source: "manual",
      trackIds: context.nowPlaying?.id ? [context.nowPlaying.id] : [],
      eventType: "manual",
      context
    });
    await prisma.adminAction.create({ data: { action: "talk", payload: { script } } });
    return { ok: true };
  });

  return app;
};
