// @ts-nocheck
import { Prisma } from "@prisma/client";
import { config } from "./config";
import { redis } from "./redis";
import { prisma } from "./db";
import { LibraryStore, mergeQuickPodcasts, mergeQuickSnippets, mergeQuickTracks, scanLibrary, scanLibraryQuick, scanPodcasts, scanPodcastsQuick, scanPhotos, scanPhotosQuick, scanSnippets, scanSnippetsQuick } from "./library";
import { scanImmichAlbum, scanImmichAlbumQuick } from "./library/immich";
import { loadLibraryCatalog, persistLibraryCatalog } from "./library/catalog";
import { scanMstreamLibrary } from "./library/mstream";
import { pickTrack, rankTracks } from "./utils/selection";
import { defaultDJ } from "./dj";
import { buildBoothDossier } from "./dj/rassy";
import { fetchMeta, isLiquidsoapReady, pushToQueue, readQueuedEntries, skipCurrent } from "./liquidsoap/client";
import { buildSnippetQueueUri, buildTrackQueueUri, planTrackPlayback } from "./liquidsoap/uris";
import { logger } from "./logger";
import { createStationChatMessage, pushStationChatMessage } from "./station-chat";
import { buildNoteCurrentTrack, buildNoteSetlist } from "./notes";
import { buildBoothSignature, buildFallbackBoothDossier } from "./booth-dossier";
import { buildTrackTurnIntelligence, learnTrackInsightsFromBoothDossier, recordTrackPlayInsight, syncTrackInsights } from "./library/track-intelligence";
import { alignQueueEntriesToStartedTrack } from "./queue-align";
import { consumeMarkedSkip, consumeTrackRequest, countStationRequests, listPendingTrackRequests, readStationRequestSummaries } from "./station-requests";
const QUEUE_KEY = "station:queue";
const HISTORY_KEY = "station:history";
const NOW_KEY = "station:now";
const MOOD_KEY = "station:mood";
const RECENT_TRACKS_KEY = "station:recent_tracks";
const RECENT_ARTISTS_TRACK_KEY = "station:recent_artists_tracks";
const LAST_TALK_KEY = "station:last_talk_at";
const DJ_SAYS_KEY = "station:dj_says";
const DJ_SAYS_META_KEY = "station:dj:says_meta";
const DJ_HEARS_KEY = "station:dj:hears_meta";
const DJ_HEARS_BUILDING_KEY = "station:dj:hears_building";
const DJ_MODE_KEY = "station:dj:mode";
const DJ_LAST_DECISION_KEY = "station:dj:last_decision_at";
const DJ_LAST_PLAYLIST_KEY = "station:dj:last_playlist";
const SET_PLAN_KEY = "station:set:plan";
const SET_PLAN_META_KEY = "station:set:meta";
const FEEDBACK_SCORES_KEY = "station:feedback:scores";
const LIBRARY_LAST_SCAN_KEY = "station:library:last_scan_at";
const RECENT_SNIPPETS_KEY = "station:recent_snippets";
const LAST_SNIPPET_AT_KEY = "station:last_snippet_at";
const LAST_SPECIAL_AT_KEY = "station:last_special_at";
const DJ_SCRIPT_TTL_SECONDS = 3 * 60 * 60;
const FEEDBACK_PERSISTENCE_LOOKBACK_DAYS = 180;
const FEEDBACK_PERSISTENCE_CACHE_MS = 5 * 60 * 1000;
let feedbackPersistenceCache = {
    expiresAt: 0,
    rows: []
};
const boothBuildingKey = (signature) => `${DJ_HEARS_BUILDING_KEY}:${signature}`;
const withSoftTimeout = async (promise, timeoutMs) => new Promise((resolve) => {
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
const safeJson = (value) => {
    if (!value)
        return null;
    try {
        return JSON.parse(value);
    }
    catch {
        return null;
    }
};
export const library = new LibraryStore();
const snapshotLibrary = () => ({
    tracks: library.getTracks(),
    snippets: library.getSnippets(),
    podcasts: library.getPodcasts()
});
const persistCurrentLibrary = async (mode) => {
    try {
        await persistLibraryCatalog(snapshotLibrary(), { mode });
    }
    catch (error) {
        logger.error({ error, mode }, "Catalog persistence failed");
    }
};
export const hydrateLibraryFromCatalog = async () => {
    try {
        const snapshot = await loadLibraryCatalog();
        const totalEpisodes = snapshot.podcasts.reduce((total, series) => total + series.episodeCount, 0);
        const hasPersistedCatalog = snapshot.tracks.length > 0 || snapshot.snippets.length > 0 || snapshot.podcasts.length > 0;
        if (!hasPersistedCatalog) {
            logger.info("No persisted library catalog found");
            return false;
        }
        library.setTracks(snapshot.tracks);
        library.setSnippets(snapshot.snippets);
        library.setPodcasts(snapshot.podcasts);
        if (snapshot.scanState?.completedAt) {
            await redis.set(LIBRARY_LAST_SCAN_KEY, snapshot.scanState.completedAt.getTime().toString());
        }
        logger.info({
            status: snapshot.scanState?.status ?? "unknown",
            tracks: snapshot.tracks.length,
            snippets: snapshot.snippets.length,
            podcasts: snapshot.podcasts.length,
            podcastEpisodes: totalEpisodes
        }, "Loaded library catalog from database");
        return true;
    }
    catch (error) {
        logger.warn({ error }, "Persisted library catalog load failed");
        return false;
    }
};
const sampleItems = (items, size) => {
    if (size <= 0)
        return [];
    if (items.length <= size)
        return items.slice();
    const copy = items.slice();
    for (let i = copy.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy.slice(0, size);
};
const sampleWeightedItem = (items, getWeight) => {
    if (items.length === 0)
        return null;
    const weighted = items.map((item) => ({
        item,
        weight: Math.max(0.01, getWeight(item))
    }));
    const totalWeight = weighted.reduce((sum, entry) => sum + entry.weight, 0);
    let cursor = Math.random() * totalWeight;
    for (const entry of weighted) {
        cursor -= entry.weight;
        if (cursor <= 0) {
            return entry.item;
        }
    }
    return weighted[weighted.length - 1]?.item ?? null;
};
const isSelfSnippet = (snippet) => snippet?.tags?.includes("self") ?? false;
const getSnippetWeight = (snippet) => isSelfSnippet(snippet)
    ? Math.max(0.02, Math.min(1, config.RADIO_SELF_SNIPPET_WEIGHT))
    : 1;
const preferNonSelfSnippets = (pool, recentSnippetIds) => {
    if (pool.length === 0)
        return pool;
    const recentSelfSnippetPlayed = library
        .getSnippets()
        .some((snippet) => recentSnippetIds.has(snippet.id) && isSelfSnippet(snippet));
    if (!recentSelfSnippetPlayed)
        return pool;
    const nonSelfPool = pool.filter((snippet) => !isSelfSnippet(snippet));
    return nonSelfPool.length > 0 ? nonSelfPool : pool;
};
export const rememberRecentSnippet = async (snippetId) => {
    const cooldownTracks = Math.max(0, config.RADIO_SNIPPET_COOLDOWN_TRACKS);
    if (cooldownTracks <= 0)
        return;
    await redis.lpush(RECENT_SNIPPETS_KEY, snippetId);
    await redis.ltrim(RECENT_SNIPPETS_KEY, 0, cooldownTracks - 1);
};
const getRecentSnippetIds = async () => {
    const cooldownTracks = Math.max(0, config.RADIO_SNIPPET_COOLDOWN_TRACKS);
    if (cooldownTracks <= 0)
        return new Set();
    const snippetIds = await redis.lrange(RECENT_SNIPPETS_KEY, 0, cooldownTracks - 1);
    return new Set(snippetIds);
};
const hasImmichPhotoSource = () => Boolean(config.IMMICH_BASE_URL.trim()) && Boolean(config.IMMICH_API_KEY.trim());
const loadPhotoSources = async (mode) => {
    const nextPhotos = [];
    let anyPhotoSourceUpdated = false;
    if (hasImmichPhotoSource()) {
        try {
            const immichPhotos = mode === "full"
                ? await scanImmichAlbum({
                    baseUrl: config.IMMICH_BASE_URL,
                    apiKey: config.IMMICH_API_KEY,
                    albumId: config.IMMICH_ALBUM_ID,
                    albumName: config.IMMICH_ALBUM_NAME,
                    timeoutMs: config.IMMICH_REQUEST_TIMEOUT_MS
                })
                : await scanImmichAlbumQuick({
                    baseUrl: config.IMMICH_BASE_URL,
                    apiKey: config.IMMICH_API_KEY,
                    albumId: config.IMMICH_ALBUM_ID,
                    albumName: config.IMMICH_ALBUM_NAME,
                    timeoutMs: config.IMMICH_REQUEST_TIMEOUT_MS
                });
            nextPhotos.push(...immichPhotos);
            anyPhotoSourceUpdated = true;
        }
        catch (error) {
            logger.error({
                error,
                baseUrl: config.IMMICH_BASE_URL,
                albumId: config.IMMICH_ALBUM_ID || null,
                albumName: config.IMMICH_ALBUM_NAME || null
            }, mode === "full" ? "Immich photo scan failed" : "Immich quick photo scan failed");
        }
    }
    if (config.PHOTOS_LIBRARY_PATH) {
        try {
            const localPhotos = mode === "full"
                ? await scanPhotos(config.PHOTOS_LIBRARY_PATH)
                : await scanPhotosQuick(config.PHOTOS_LIBRARY_PATH);
            nextPhotos.push(...localPhotos);
            anyPhotoSourceUpdated = true;
        }
        catch (error) {
            logger.error({ error, path: config.PHOTOS_LIBRARY_PATH }, mode === "full" ? "Local photo scan failed" : "Quick local photo scan failed");
        }
    }
    return {
        anyPhotoSourceUpdated,
        photos: nextPhotos
    };
};
export const getSnippetPlaybackGateState = async (now = Date.now()) => {
    const queuedEntries = await redis.lrange(QUEUE_KEY, 0, -1);
    const queuedSnippetId = queuedEntries.find((entry) => entry.startsWith("snippet:"))?.slice("snippet:".length) ?? null;
    if (queuedSnippetId) {
        return {
            allowed: false,
            reason: "queued",
            queuedSnippetId,
            remainingMs: 0,
            availableAt: null
        };
    }
    const minGapMs = Math.max(0, config.RADIO_SNIPPET_MIN_GAP_MINUTES) * 60 * 1000;
    if (minGapMs <= 0) {
        return {
            allowed: true,
            reason: null,
            queuedSnippetId: null,
            remainingMs: 0,
            availableAt: now
        };
    }
    const lastSnippetValue = await redis.get(LAST_SNIPPET_AT_KEY);
    const lastSnippetAt = lastSnippetValue ? Number(lastSnippetValue) : Number.NaN;
    if (!Number.isFinite(lastSnippetAt) || lastSnippetAt <= 0) {
        return {
            allowed: true,
            reason: null,
            queuedSnippetId: null,
            remainingMs: 0,
            availableAt: now
        };
    }
    const availableAt = lastSnippetAt + minGapMs;
    const remainingMs = Math.max(0, availableAt - now);
    if (remainingMs > 0) {
        return {
            allowed: false,
            reason: "cooldown",
            queuedSnippetId: null,
            remainingMs,
            availableAt
        };
    }
    return {
        allowed: true,
        reason: null,
        queuedSnippetId: null,
        remainingMs: 0,
        availableAt
    };
};
const normalizeRequestSearchText = (value) => value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const tokenizeRequestSearchText = (value) => normalizeRequestSearchText(value)
    .split(" ")
    .filter((token) => token.length >= 2);
const findRequestTrackMatches = (tracks, message, limit = 5) => {
    const normalized = normalizeRequestSearchText(message);
    const tokens = tokenizeRequestSearchText(message);
    if (!normalized || tokens.length === 0)
        return [];
    const scored = tracks.map((track) => {
        const title = normalizeRequestSearchText(track.title);
        const artist = normalizeRequestSearchText(track.artist);
        const album = normalizeRequestSearchText(track.album ?? "");
        const combo = `${artist} ${title} ${album}`.trim();
        let score = 0;
        if (normalized.includes(`${artist} ${title}`) || normalized.includes(`${title} ${artist}`))
            score += 16;
        if (title && (normalized.includes(title) || title.includes(normalized)))
            score += 12;
        if (artist && (normalized.includes(artist) || artist.includes(normalized)))
            score += 8;
        if (artist && tokens.every((token) => artist.includes(token) || ["play", "spin", "again"].includes(token))) {
            score += 6;
        }
        if (album && (normalized.includes(album) || album.includes(normalized)))
            score += 4;
        if (combo.includes(normalized))
            score += 6;
        for (const token of tokens) {
            if (title.includes(token))
                score += 1.6;
            if (artist.includes(token))
                score += 1.2;
            if (album.includes(token))
                score += 0.5;
        }
        return { track, score };
    });
    return scored
        .filter((item) => item.score >= 4)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map(({ track }) => track);
};
const buildCaptainTrackCandidates = (args) => {
    if (args.limit <= 0)
        return [];
    if (args.tracks.length <= args.limit)
        return args.tracks.slice();
    const selected = [];
    const selectedIds = new Set();
    const workingRecentTrackIds = new Set(args.recentTrackIds);
    const workingRecentTrackSignatures = new Set(args.recentTrackSignatures ?? []);
    const workingRecentArtists = new Set(Array.from(args.recentArtists, (artist) => artist.toLowerCase()));
    const tryAdd = (track) => {
        if (!track)
            return false;
        const artistKey = track.artist.toLowerCase();
        const trackSignature = buildTrackCooldownSignature(track);
        if (selectedIds.has(track.id))
            return false;
        if (args.bannedTrackIds.has(track.id) || args.bannedArtists.has(artistKey))
            return false;
        if (workingRecentTrackIds.has(track.id) || workingRecentArtists.has(artistKey))
            return false;
        if (trackSignature && workingRecentTrackSignatures.has(trackSignature))
            return false;
        selected.push(track);
        selectedIds.add(track.id);
        workingRecentTrackIds.add(track.id);
        if (trackSignature) {
            workingRecentTrackSignatures.add(trackSignature);
        }
        workingRecentArtists.add(artistKey);
        return true;
    };
    const requestCandidates = args.requests
        .slice(0, 6)
        .flatMap((request) => findRequestTrackMatches(args.tracks, request, 2));
    for (const track of requestCandidates) {
        if (tryAdd(track) && selected.length >= args.limit) {
            return selected;
        }
    }
    const topLikedTrackIds = Array.from(args.feedbackScores.entries())
        .filter(([, score]) => score > 0)
        .sort((a, b) => b[1] - a[1])
        .map(([trackId]) => trackId)
        .slice(0, 10);
    for (const trackId of topLikedTrackIds) {
        if (selected.length >= args.limit) {
            return selected;
        }
        tryAdd(args.tracks.find((track) => track.id === trackId));
    }
    let attempts = 0;
    while (selected.length < args.limit && attempts < args.limit * 4) {
        attempts += 1;
        const next = pickTrack(args.tracks, {
            mood: args.mood,
            dayPart: args.dayPart,
            dayOfWeek: args.dayOfWeek,
            emotionalWeather: args.emotionalWeather,
            bannedTrackIds: new Set([...args.bannedTrackIds, ...workingRecentTrackIds]),
            bannedArtists: new Set([...args.bannedArtists, ...workingRecentArtists]),
            recentTrackIds: workingRecentTrackIds,
            recentTrackSignatures: workingRecentTrackSignatures,
            recentArtists: workingRecentArtists,
            feedbackScores: args.feedbackScores,
            feedbackWeight: args.feedbackWeight
        });
        if (!next)
            break;
        if (!tryAdd(next))
            continue;
    }
    if (selected.length < args.limit) {
        const fallbackPool = sampleItems(args.tracks, Math.min(args.tracks.length, Math.max(args.limit * 2, 24)));
        for (const track of fallbackPool) {
            if (tryAdd(track) && selected.length >= args.limit) {
                break;
            }
        }
    }
    return selected.length > 0 ? selected : sampleItems(args.tracks, args.limit);
};
const CAPTAIN_BACKSTAGE_PATTERN = /\b(ai|automation|prompt(?:s)?|tool(?:s|ing)?|system(?:s)?|cheshire|fallback)\b/i;
const normalizeCaptainScript = (script) => {
    const trimmed = script?.replace(/\s+/g, " ").trim();
    if (!trimmed)
        return null;
    if (trimmed.length < 24 || trimmed.length > 420)
        return null;
    if (/[{}[\]]/.test(trimmed))
        return null;
    if (CAPTAIN_BACKSTAGE_PATTERN.test(trimmed))
        return null;
    return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
};
const summarizeGenres = (track) => {
    if (!track.genres?.length)
        return "";
    if (track.genres.length === 1)
        return track.genres[0];
    return `${track.genres[0]} / ${track.genres[1]}`;
};
const buildTrackStamp = (track) => {
    const albumLine = track.album ? ` off ${track.album}` : "";
    const yearLine = track.year ? ` (${track.year})` : "";
    return `${track.title} by ${track.artist}${albumLine}${yearLine}`;
};
const buildTrackFactLine = (track) => {
    return buildTrackTurnIntelligence(track).factLine;
};
const takeLeadSentence = (value) => {
    const cleaned = value?.replace(/\s+/g, " ").trim();
    if (!cleaned)
        return "";
    const first = cleaned.split(/(?<=[.!?])\s+/)[0]?.trim();
    return first && first.length > 0 ? first : cleaned;
};
const buildTrackStartCommentary = (track, mood, feedbackScore = 0) => {
    const turn = buildTrackTurnIntelligence(track);
    const factLine = buildTrackFactLine(track);
    const crowdLine = feedbackScore >= 3
        ? " The request line has been pulling for this exact move."
        : feedbackScore <= -3
            ? " Mr Rassy is forcing the hour into a sharper left turn."
            : "";
    return `Mr Rassy just cracked open ${buildTrackStamp(track)}.${factLine ? ` ${factLine}` : ""} ${takeLeadSentence(turn.context)} The stack is running ${mood}.${crowdLine}`.trim();
};
const getMood = async () => {
    const mood = await redis.get(MOOD_KEY);
    return mood ?? config.RADIO_MOOD;
};
const hashSeed = (value) => {
    let hash = 0;
    for (let index = 0; index < value.length; index += 1) {
        hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
    }
    return hash;
};
const getDayPart = (hour) => {
    if (hour < 4)
        return "deep night";
    if (hour < 7)
        return "blue hour";
    if (hour < 10)
        return "daybreak";
    if (hour < 12)
        return "late morning";
    if (hour < 15)
        return "midday";
    if (hour < 18)
        return "golden afternoon";
    if (hour < 21)
        return "sunset";
    return "after-hours";
};
const emotionalWeatherByDayPart = {
    "deep night": [
        "velvet static",
        "hushed gravity",
        "sleepwalker pulse",
        "slow-burn ache",
        "midnight patience",
        "low-lit drift"
    ],
    "blue hour": [
        "tender voltage",
        "mist and spark",
        "first-light hush",
        "soft ignition",
        "quiet bloom",
        "silver patience"
    ],
    daybreak: [
        "open-window lift",
        "clear-eyed warmth",
        "sun-on-concrete glow",
        "morning motion",
        "fresh current",
        "slow brightening"
    ],
    "late morning": [
        "bright mischief",
        "steady shine",
        "midday glide",
        "clean heat",
        "forward motion",
        "easy momentum"
    ],
    midday: [
        "loose magnetism",
        "high-noon shimmer",
        "crisp charge",
        "sunlit push",
        "open-road focus",
        "bright pressure"
    ],
    "golden afternoon": [
        "warm gravity",
        "honeyed drive",
        "golden sway",
        "dust and glow",
        "radiant shoulder-roll",
        "sun-laced cruise"
    ],
    sunset: [
        "amber patience",
        "low-slung joy",
        "heartline warmth",
        "evening bloom",
        "soft smoke",
        "slow-burn honey"
    ],
    "after-hours": [
        "neon patience",
        "smoke and focus",
        "restless glow",
        "club-light ache",
        "mirrorball shadow",
        "after-hours electricity"
    ]
};
const weekendWeather = [
    "weekend lift",
    "loose joy",
    "open-hearted static",
    "late-night grin",
    "roofline heat",
    "living-room glow"
];
const buildEmotionalWeather = (args) => {
    const dayPartPool = emotionalWeatherByDayPart[args.dayPart] ?? emotionalWeatherByDayPart["after-hours"];
    const isWeekend = ["friday", "saturday"].includes(args.dayOfWeek.toLowerCase());
    const pool = isWeekend ? [...dayPartPool, ...weekendWeather] : dayPartPool;
    const seed = [
        args.now.getFullYear(),
        args.now.getMonth() + 1,
        args.now.getDate(),
        args.now.getHours(),
        args.dayPart,
        args.dayOfWeek,
        args.queueDepth,
        args.requestCount,
        args.mood,
        args.recentLead ?? ""
    ].join(":");
    return pool[hashSeed(seed) % pool.length];
};
const weakMoodTokens = new Set([
    "chill",
    "cool",
    "flow",
    "fun",
    "good",
    "mood",
    "nice",
    "set",
    "short",
    "silly",
    "vibe"
]);
export const normalizeStationMood = (value, context) => {
    const raw = (value ?? "")
        .trim()
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
    const primaryFragment = raw
        .split(/[\/|]+/)
        .map((part) => part
        .trim()
        .replace(/[_-]+/g, " ")
        .replace(/[,:;]+/g, " ")
        .replace(/\s+/g, " ")
        .trim())
        .find(Boolean);
    const cleaned = primaryFragment
        ? primaryFragment
            .split(" ")
            .filter(Boolean)
            .slice(0, 4)
            .join(" ")
        : "";
    if (!cleaned) {
        return `${context.dayPart} / ${context.emotionalWeather}`.trim();
    }
    if (cleaned.length < 5) {
        return `${context.dayPart} / ${context.emotionalWeather}`.trim();
    }
    if (cleaned.split(" ").length === 1 && weakMoodTokens.has(cleaned)) {
        return `${context.dayPart} / ${context.emotionalWeather}`.trim();
    }
    if (cleaned.includes(context.emotionalWeather.toLowerCase()) ||
        cleaned.includes(context.dayPart.toLowerCase())) {
        return cleaned;
    }
    return `${cleaned} / ${context.emotionalWeather}`.trim();
};
const getTrackCooldownMs = () => Math.max(1, config.RADIO_TRACK_COOLDOWN_HOURS) * 60 * 60 * 1000;
const getLockedQueueTrackCount = () => Math.max(1, config.RADIO_LOCKED_QUEUE_TRACKS);
const getMinimumSetSize = () => Math.max(getLockedQueueTrackCount(), config.RADIO_SET_MIN_SIZE);
const getSetTargetTrackCount = () => Math.max(getMinimumSetSize(), config.RADIO_SET_TARGET_SIZE);
const getDecisionBatchTrackCount = () => Math.max(getSetTargetTrackCount(), Math.max(1, Math.floor(config.RADIO_DECISION_BATCH_SIZE)));
const isSnippetQueueEntry = (value) => value.startsWith("snippet:");
const toQueuedTrackIds = (entries) => entries.filter((entry) => !isSnippetQueueEntry(entry));
const readQueuedTrackIds = async (limit) => {
    const entries = await redis.lrange(QUEUE_KEY, 0, -1);
    const trackIds = toQueuedTrackIds(entries);
    if (typeof limit !== "number")
        return trackIds;
    return trackIds.slice(0, Math.max(0, limit));
};
const storeSetPlan = async (plan) => {
    await redis.del(SET_PLAN_KEY);
    if (plan.trackIds.length > 0) {
        await redis.rpush(SET_PLAN_KEY, ...plan.trackIds);
    }
    await redis.set(SET_PLAN_META_KEY, JSON.stringify(plan));
};
const readStoredSetPlan = async () => {
    const raw = await redis.get(SET_PLAN_META_KEY);
    if (!raw)
        return null;
    try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed.trackIds))
            return null;
        return {
            trackIds: parsed.trackIds.filter((trackId) => typeof trackId === "string" && trackId.length > 0),
            mood: typeof parsed.mood === "string" ? parsed.mood : config.RADIO_MOOD,
            reason: typeof parsed.reason === "string" ? parsed.reason : null,
            talkScript: typeof parsed.talkScript === "string" ? parsed.talkScript : null,
            snippetId: typeof parsed.snippetId === "string" ? parsed.snippetId : null,
            programming: parsed.programming && typeof parsed.programming === "object"
                ? parsed.programming
                : null,
            playbackPlans: Array.isArray(parsed.playbackPlans)
                ? parsed.playbackPlans.filter((plan) => Boolean(plan) &&
                    typeof plan === "object" &&
                    typeof plan.trackId === "string" &&
                    typeof plan.mode === "string")
                : [],
            selectionSource: typeof parsed.selectionSource === "string" && parsed.selectionSource.length > 0
                ? parsed.selectionSource
                : "fallback",
            plannerMode: typeof parsed.plannerMode === "string" && parsed.plannerMode.length > 0
                ? parsed.plannerMode
                : "rolling-window",
            decisionBatchSize: typeof parsed.decisionBatchSize === "number" && Number.isFinite(parsed.decisionBatchSize)
                ? parsed.decisionBatchSize
                : getDecisionBatchTrackCount(),
            createdAt: typeof parsed.createdAt === "number" && Number.isFinite(parsed.createdAt) ? parsed.createdAt : 0
        };
    }
    catch {
        return null;
    }
};
export const buildCurrentMoodFrame = (args) => {
    const now = args.now ?? new Date();
    const rawMood = args.rawMood ?? config.RADIO_MOOD;
    const dayOfWeek = now.toLocaleDateString("en-US", {
        weekday: "long"
    });
    const dayPart = getDayPart(now.getHours());
    const timeOfDay = now.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true
    });
    const emotionalWeather = buildEmotionalWeather({
        now,
        mood: rawMood,
        dayPart,
        dayOfWeek,
        queueDepth: args.queueDepth ?? 0,
        requestCount: args.requestCount ?? 0,
        recentLead: args.recentLead
    });
    return {
        mood: normalizeStationMood(rawMood, {
            dayPart,
            emotionalWeather,
            dayOfWeek
        }),
        dayOfWeek,
        dayPart,
        timeOfDay,
        emotionalWeather
    };
};
const getRecentTrackIds = async (sinceMs) => {
    const cutoff = Date.now() - sinceMs;
    const ids = await redis.zrangebyscore(RECENT_TRACKS_KEY, cutoff, "+inf");
    return new Set(ids);
};
const getRecentArtists = async () => {
    const artists = await redis.lrange(RECENT_ARTISTS_TRACK_KEY, 0, Math.max(0, config.RADIO_ARTIST_COOLDOWN_TRACKS - 1));
    return new Set(artists.map((artist) => artist.toLowerCase()));
};
const readLiveTrackMatch = async () => {
    const meta = await withSoftTimeout(fetchMeta(), Math.min(2500, config.LIQUIDSOAP_META_TIMEOUT_MS));
    if (meta?.track_id?.trim()) {
        const byId = library.getTrackById(meta.track_id.trim());
        if (byId) {
            return byId;
        }
    }
    if (meta?.title || meta?.artist) {
        const byMeta = library.findByTitleArtist(meta.title, meta.artist);
        if (byMeta) {
            return byMeta;
        }
    }
    const currentNow = safeJson(await redis.get(NOW_KEY));
    if (currentNow?.id) {
        const byNowId = library.getTrackById(currentNow.id);
        if (byNowId) {
            return byNowId;
        }
    }
    if (currentNow?.title || currentNow?.artist) {
        return library.findByTitleArtist(currentNow.title, currentNow.artist);
    }
    return null;
};
const buildTrackCooldownSnapshot = async () => {
    const recentPlayState = await readRecentPlayState();
    const [redisRecentTrackIds, redisRecentArtists, liveTrack] = await Promise.all([
        getRecentTrackIds(getTrackCooldownMs()),
        getRecentArtists(),
        readLiveTrackMatch()
    ]);
    const recentTrackIds = new Set([
        ...Array.from(redisRecentTrackIds),
        ...Array.from(recentPlayState.recentTrackIds)
    ]);
    const recentArtists = new Set([
        ...Array.from(redisRecentArtists),
        ...Array.from(recentPlayState.recentArtists)
    ]);
    const recentTrackSignatures = new Set(recentPlayState.recentTrackSignatures ?? []);
    if (liveTrack?.id) {
        recentTrackIds.add(liveTrack.id);
    }
    if (liveTrack?.artist) {
        recentArtists.add(liveTrack.artist.toLowerCase());
    }
    const liveTrackSignature = buildTrackCooldownSignature(liveTrack);
    if (liveTrackSignature) {
        recentTrackSignatures.add(liveTrackSignature);
    }
    return {
        recentPlayState,
        liveTrack,
        recentTrackIds,
        recentArtists,
        recentTrackSignatures
    };
};
const mergeRecentTrackHistory = (primary, secondary, limit = 10) => {
    const seen = new Set();
    const merged = [];
    const add = (track) => {
        const title = track?.title?.trim() ?? "";
        const artist = track?.artist?.trim() ?? "";
        if (!title && !artist)
            return;
        const key = track?.id?.trim() || `${artist.toLowerCase()}::${title.toLowerCase()}`;
        if (!key || seen.has(key))
            return;
        seen.add(key);
        merged.push({
            id: track?.id?.trim() ?? "",
            title,
            artist
        });
    };
    primary.forEach(add);
    secondary.forEach(add);
    return merged.slice(0, Math.max(1, limit));
};
const TRACK_TITLE_DECORATION_PATTERN = /[\[(][^\])]*(?:remaster(?:ed)?|mono|stereo|edit|mix|version|radio|single|album|deluxe|bonus|clean|explicit)[^\])]*[\])]/gi;
const TRACK_TITLE_TAIL_PATTERN = /\s+-\s+(?:\d{4}\s+)?(?:remaster(?:ed)?|mono|stereo|edit|mix|version|radio edit|single version|album version|clean|explicit)\b.*$/gi;
const normalizeTrackIdentityText = (value) => (value ?? "")
    .toString()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const normalizeTrackCooldownTitle = (value) => normalizeTrackIdentityText((value ?? "")
    .replace(TRACK_TITLE_DECORATION_PATTERN, " ")
    .replace(TRACK_TITLE_TAIL_PATTERN, " "));
const buildTrackCooldownSignature = (input, artistInput) => {
    const title = typeof input === "object" && input
        ? input.title ?? ""
        : typeof input === "string"
            ? input
            : "";
    const artist = typeof input === "object" && input
        ? input.artist ?? ""
        : artistInput ?? "";
    const normalizedTitle = normalizeTrackCooldownTitle(title);
    const normalizedArtist = normalizeTrackIdentityText(artist);
    if (!normalizedTitle || !normalizedArtist)
        return "";
    return `${normalizedArtist}::${normalizedTitle}`;
};
const readRecentPlayState = async () => {
    try {
        const trackCutoff = new Date(Date.now() - getTrackCooldownMs());
        const artistWindow = Math.max(24, config.RADIO_ARTIST_COOLDOWN_TRACKS * 4);
        const historyWindow = 12;
        const [cooldownRows, artistRows, historyRows] = await Promise.all([
            prisma.playLog.findMany({
                where: {
                    playedAt: {
                        gte: trackCutoff
                    }
                },
                orderBy: {
                    playedAt: "desc"
                },
                select: {
                    trackId: true,
                    title: true,
                    artist: true
                },
                take: 1024
            }),
            prisma.playLog.findMany({
                orderBy: {
                    playedAt: "desc"
                },
                select: {
                    artist: true
                },
                take: artistWindow
            }),
            prisma.playLog.findMany({
                orderBy: {
                    playedAt: "desc"
                },
                select: {
                    artist: true,
                    title: true,
                    trackId: true
                },
                take: historyWindow
            })
        ]);
        const recentArtists = new Set();
        for (const row of artistRows) {
            const artistKey = row.artist?.trim().toLowerCase();
            if (!artistKey)
                continue;
            recentArtists.add(artistKey);
            if (recentArtists.size >= config.RADIO_ARTIST_COOLDOWN_TRACKS) {
                break;
            }
        }
        return {
            recentArtists,
            recentTrackIds: new Set(cooldownRows
                .map((row) => row.trackId?.trim())
                .filter((trackId) => Boolean(trackId))),
            recentTrackSignatures: new Set(cooldownRows
                .map((row) => buildTrackCooldownSignature(row))
                .filter((signature) => Boolean(signature))),
            recentTracks: historyRows.map((row) => ({
                id: row.trackId?.trim() ?? "",
                title: row.title?.trim() ?? "",
                artist: row.artist?.trim() ?? ""
            }))
        };
    }
    catch (error) {
        logger.warn({ error }, "Failed to read recent play state from the database");
        return {
            recentArtists: new Set(),
            recentTrackIds: new Set(),
            recentTrackSignatures: new Set(),
            recentTracks: []
        };
    }
};
const getBans = async () => {
    const [trackIds, artists] = await Promise.all([
        redis.smembers("station:ban:tracks"),
        redis.smembers("station:ban:artists")
    ]);
    return {
        trackIds: new Set(trackIds),
        artists: new Set(artists.map((artist) => artist.toLowerCase()))
    };
};
const readFeedbackInsight = async () => {
    const raw = await redis.hgetall(FEEDBACK_SCORES_KEY);
    const scores = new Map();
    for (const [trackId, value] of Object.entries(raw)) {
        const score = Number(value ?? 0);
        if (!Number.isFinite(score) || score === 0)
            continue;
        scores.set(trackId, score);
    }
    const now = Date.now();
    if (feedbackPersistenceCache.expiresAt <= now) {
        try {
            const lookback = new Date(now - FEEDBACK_PERSISTENCE_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
            feedbackPersistenceCache = {
                expiresAt: now + FEEDBACK_PERSISTENCE_CACHE_MS,
                rows: await prisma.trackVote.groupBy({
                    by: ["trackId"],
                    where: {
                        createdAt: {
                            gte: lookback
                        }
                    },
                    _sum: {
                        vote: true
                    }
                })
            };
        }
        catch (error) {
            logger.warn({ error }, "Failed to hydrate persistent feedback scores");
            feedbackPersistenceCache = {
                expiresAt: now + FEEDBACK_PERSISTENCE_CACHE_MS,
                rows: []
            };
        }
    }
    for (const row of feedbackPersistenceCache.rows) {
        const trackId = row.trackId?.trim();
        const score = Number(row._sum?.vote ?? 0);
        if (!trackId || !Number.isFinite(score) || score === 0 || scores.has(trackId)) {
            continue;
        }
        scores.set(trackId, score);
    }
    const scored = Array.from(scores.entries())
        .map(([trackId, score]) => ({ trackId, score }))
        .sort((a, b) => b.score - a.score);
    const toEnriched = (item) => {
        const track = library.getTrackById(item.trackId);
        return {
            trackId: item.trackId,
            score: item.score,
            title: track?.title ?? "Unknown Track",
            artist: track?.artist ?? "Unknown Artist"
        };
    };
    const topLiked = scored.filter((item) => item.score > 0).slice(0, 8).map(toEnriched);
    const topDisliked = scored
        .filter((item) => item.score < 0)
        .sort((a, b) => a.score - b.score)
        .slice(0, 8)
        .map(toEnriched);
    return { scores, topLiked, topDisliked };
};
const buildQueuePreview = async (limit = 6) => {
    const ids = await readQueuedTrackIds(limit);
    return ids
        .map((id) => library.getTrackById(id))
        .filter(Boolean)
        .map((track) => ({
        id: track.id,
        title: track.title,
        artist: track.artist,
        album: track.album,
        year: track.year,
        genres: track.genres,
        energy: track.energy
    }));
};
export const buildContext = async (recentPlayStateInput = null) => {
    const storedMood = await getMood();
    const now = new Date();
    const recentPlayState = recentPlayStateInput ?? (await readRecentPlayState());
    const history = await redis.lrange(HISTORY_KEY, 0, 9);
    const redisRecentTracks = history.map((item) => {
        try {
            return JSON.parse(item);
        }
        catch {
            return { id: "", title: "", artist: "" };
        }
    });
    const recentTracks = mergeRecentTrackHistory(redisRecentTracks, recentPlayState.recentTracks, 10);
    const recentArtists = recentTracks.map((track) => track.artist ?? "").filter(Boolean);
    const queuedTrackIds = await readQueuedTrackIds();
    const queueDepth = queuedTrackIds.length;
    const nowPlayingRaw = await redis.get(NOW_KEY);
    const parsedNowPlaying = nowPlayingRaw
        ? JSON.parse(nowPlayingRaw)
        : null;
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
    const bans = await getBans();
    const feedbackInsight = await readFeedbackInsight();
    const recentTrackIds = recentTracks.map((track) => track.id ?? "").filter(Boolean);
    const recentTrackCooldownIds = new Set([
        ...Array.from(await getRecentTrackIds(getTrackCooldownMs())),
        ...Array.from(recentPlayState.recentTrackIds)
    ]);
    const recentTrackCooldownSignatures = new Set([
        ...Array.from(recentPlayState.recentTrackSignatures ?? []),
        ...recentTracks
            .map((track) => buildTrackCooldownSignature(track))
            .filter((signature) => Boolean(signature))
    ]);
    const recentArtistCooldownSet = new Set([
        ...Array.from(await getRecentArtists()),
        ...Array.from(recentPlayState.recentArtists)
    ]);
    const feedback = recentTrackIds.map((trackId) => {
        const track = library.getTrackById(trackId);
        return {
            trackId,
            score: feedbackInsight.scores.get(trackId) ?? 0,
            title: track?.title,
            artist: track?.artist
        };
    });
    const [requests, requestCount] = await Promise.all([
        readStationRequestSummaries(10),
        countStationRequests()
    ]);
    const moodFrame = buildCurrentMoodFrame({
        rawMood: storedMood,
        now,
        queueDepth,
        requestCount,
        recentLead: recentTracks[0]?.artist || recentTracks[0]?.title || nowPlaying?.artist || nowPlaying?.title
    });
    const { dayOfWeek, dayPart, emotionalWeather, mood, timeOfDay } = moodFrame;
    const availableTracks = library.getTracks();
    const filteredTracks = availableTracks.filter((track) => {
        if (queuedTrackIds.includes(track.id))
            return false;
        if (bans.trackIds.has(track.id))
            return false;
        if (bans.artists.has(track.artist.toLowerCase()))
            return false;
        if (recentTrackCooldownIds.has(track.id))
            return false;
        if (recentTrackCooldownSignatures.has(buildTrackCooldownSignature(track)))
            return false;
        if (recentArtistCooldownSet.has(track.artist.toLowerCase()))
            return false;
        return true;
    });
    const candidateTracks = filteredTracks.length > 0 ? filteredTracks : availableTracks;
    const librarySample = buildCaptainTrackCandidates({
        tracks: candidateTracks,
        mood,
        dayPart,
        dayOfWeek,
        emotionalWeather,
        bannedTrackIds: bans.trackIds,
        bannedArtists: bans.artists,
        recentTrackIds: recentTrackCooldownIds,
        recentTrackSignatures: recentTrackCooldownSignatures,
        recentArtists: recentArtistCooldownSet,
        feedbackScores: feedbackInsight.scores,
        feedbackWeight: config.RADIO_FEEDBACK_WEIGHT,
        requests,
        limit: 48
    });
    const snippetSample = sampleItems(library.getSnippets(), 8);
    const queuePreview = await buildQueuePreview(10);
    const lockedQueuePreview = queuePreview.slice(0, getLockedQueueTrackCount());
    return {
        mood,
        timeOfDay,
        dayOfWeek,
        dayPart,
        emotionalWeather,
        recentTracks: recentTracks.map((item) => ({
            id: item.id ?? "",
            title: item.title ?? "",
            artist: item.artist ?? ""
        })),
        recentArtists,
        queueDepth,
        lockedQueueSize: getLockedQueueTrackCount(),
        nowPlaying: nowPlaying ?? null,
        librarySample,
        queuePreview,
        lockedQueuePreview,
        snippetSample,
        libraryProfile: library.getProfile(),
        feedback,
        feedbackTopLiked: feedbackInsight.topLiked,
        feedbackTopDisliked: feedbackInsight.topDisliked,
        feedbackScoreMap: feedbackInsight.scores,
        recentTrackCooldownIds,
        recentTrackCooldownSignatures,
        recentArtistCooldownSet,
        requests,
        bans: {
            trackIds: Array.from(bans.trackIds),
            artists: Array.from(bans.artists)
        }
    };
};
const getSpecialMinGapMs = () => Math.max(1, config.RADIO_SPECIAL_MIN_GAP_HOURS) * 60 * 60 * 1000;
const isLongTrack = (track) => typeof track?.duration === "number" && track.duration > config.RADIO_LONG_TRACK_THRESHOLD_SECONDS;
const buildSelectionContext = (context, overrides = {}) => ({
    mood: context.mood,
    dayPart: context.dayPart,
    dayOfWeek: context.dayOfWeek,
    emotionalWeather: context.emotionalWeather,
    bannedTrackIds: new Set(context.bans.trackIds),
    bannedArtists: new Set(context.bans.artists.map((artist) => artist.toLowerCase())),
    recentTrackIds: overrides.recentTrackIds ?? new Set(context.recentTrackCooldownIds),
    recentTrackSignatures: overrides.recentTrackSignatures ?? new Set(context.recentTrackCooldownSignatures ?? []),
    recentArtists: overrides.recentArtists ?? new Set(context.recentArtistCooldownSet),
    feedbackScores: context.feedbackScoreMap,
    feedbackWeight: config.RADIO_FEEDBACK_WEIGHT
});
const pickSpecialTracks = (pool, context, count, options = {}) => {
    if (pool.length === 0 || count <= 0)
        return [];
    const picked = [];
    const usedTrackIds = new Set();
    const workingRecentTrackIds = new Set(context.recentTracks.map((track) => track.id).filter(Boolean));
    const workingRecentTrackSignatures = new Set(context.recentTrackCooldownSignatures ?? context.recentTracks
        .map((track) => buildTrackCooldownSignature(track))
        .filter((signature) => Boolean(signature)));
    const workingRecentArtists = new Set((options.allowRepeatedArtist ? [] : context.recentArtists).map((artist) => artist.toLowerCase()));
    let attempts = 0;
    while (picked.length < count && attempts < count * 8) {
        attempts += 1;
        const candidates = pool.filter((track) => !usedTrackIds.has(track.id));
        if (candidates.length === 0)
            break;
        const ranked = rankTracks(candidates, buildSelectionContext(context, {
            recentTrackIds: workingRecentTrackIds,
            recentTrackSignatures: workingRecentTrackSignatures,
            recentArtists: workingRecentArtists
        }));
        const next = ranked[0]?.track;
        if (!next)
            break;
        picked.push(next);
        usedTrackIds.add(next.id);
        workingRecentTrackIds.add(next.id);
        const trackSignature = buildTrackCooldownSignature(next);
        if (trackSignature) {
            workingRecentTrackSignatures.add(trackSignature);
        }
        if (!options.allowRepeatedArtist) {
            workingRecentArtists.add(next.artist.toLowerCase());
        }
    }
    return picked;
};
const scoreProgrammingTracks = (tracks, context, options = {}) => rankTracks(tracks, buildSelectionContext(context, {
    recentArtists: new Set((options.allowRepeatedArtist ? [] : context.recentArtists).map((artist) => artist.toLowerCase()))
}))
    .slice(0, Math.min(3, tracks.length))
    .reduce((total, item) => total + item.score, 0);
const buildProgrammingCandidate = (base, tracks, context, options = {}) => {
    if (tracks.length < getMinimumSetSize())
        return null;
    return {
        ...base,
        trackIds: tracks.map((track) => track.id),
        score: scoreProgrammingTracks(tracks, context, options)
    };
};
const buildSameArtistCandidate = (eligibleTracks, context) => {
    const groups = new Map();
    for (const track of eligibleTracks) {
        const key = track.artist.trim().toLowerCase();
        if (!key)
            continue;
        const bucket = groups.get(key) ?? [];
        bucket.push(track);
        groups.set(key, bucket);
    }
    const candidates = Array.from(groups.entries())
        .filter(([, tracks]) => tracks.length >= 4)
        .map(([artistKey, tracks]) => {
        const picked = pickSpecialTracks(tracks, context, 5, { allowRepeatedArtist: true });
        const artist = picked[0]?.artist ?? artistKey;
        return buildProgrammingCandidate({
            mode: "special",
            label: `${artist} close-up`,
            description: `A short run staying inside ${artist}'s handwriting instead of skimming past it.`,
            specialType: "same-artist",
            artist
        }, picked, context, { allowRepeatedArtist: true });
    })
        .filter((candidate) => Boolean(candidate));
    return candidates.sort((left, right) => right.score - left.score)[0] ?? null;
};
const buildAlbumRunCandidate = (eligibleTracks, context) => {
    const groups = new Map();
    for (const track of eligibleTracks) {
        if (!track.album?.trim())
            continue;
        const key = `${track.artist.trim().toLowerCase()}::${track.album.trim().toLowerCase()}`;
        const bucket = groups.get(key) ?? [];
        bucket.push(track);
        groups.set(key, bucket);
    }
    const candidates = Array.from(groups.values())
        .filter((tracks) => tracks.length >= 3)
        .map((tracks) => {
        const picked = pickSpecialTracks(tracks, context, 4, { allowRepeatedArtist: true });
        const lead = picked[0];
        return buildProgrammingCandidate({
            mode: "special",
            label: `${lead?.album ?? "Album"} run`,
            description: `A little stay inside one record so the set can breathe like an album instead of a shuffle.`,
            specialType: "album-run",
            artist: lead?.artist,
            album: lead?.album
        }, picked, context, { allowRepeatedArtist: true });
    })
        .filter((candidate) => Boolean(candidate));
    return candidates.sort((left, right) => right.score - left.score)[0] ?? null;
};
const buildSameDecadeCandidate = (eligibleTracks, context) => {
    const groups = new Map();
    for (const track of eligibleTracks) {
        if (typeof track.year !== "number")
            continue;
        const decade = `${Math.floor(track.year / 10) * 10}s`;
        const bucket = groups.get(decade) ?? [];
        bucket.push(track);
        groups.set(decade, bucket);
    }
    const candidates = Array.from(groups.entries())
        .filter(([, tracks]) => tracks.length >= 6)
        .map(([decade, tracks]) => buildProgrammingCandidate({
        mode: "special",
        label: `${decade} pressure`,
        description: `A set holding to one decade long enough for the texture of the era to really show.`,
        specialType: "same-decade",
        decade
    }, pickSpecialTracks(tracks, context, 5), context))
        .filter((candidate) => Boolean(candidate));
    return candidates.sort((left, right) => right.score - left.score)[0] ?? null;
};
const buildGenrePocketCandidate = (eligibleTracks, context) => {
    const groups = new Map();
    for (const track of eligibleTracks) {
        for (const genre of track.genres ?? []) {
            const trimmed = genre.trim();
            if (!trimmed)
                continue;
            const bucket = groups.get(trimmed.toLowerCase()) ?? [];
            bucket.push(track);
            groups.set(trimmed.toLowerCase(), bucket);
        }
    }
    const candidates = Array.from(groups.entries())
        .filter(([, tracks]) => tracks.length >= 6)
        .map(([genreKey, tracks]) => {
        const genre = tracks.find((track) => track.genres?.some((value) => value.toLowerCase() === genreKey))?.genres?.find((value) => value.toLowerCase() === genreKey) ?? genreKey;
        return buildProgrammingCandidate({
            mode: "special",
            label: `${genre} pocket`,
            description: `A stretch where Mr Rassy stays with one pocket of sound long enough for the details to show.`,
            specialType: "genre-pocket",
            genre
        }, pickSpecialTracks(tracks, context, 5), context);
    })
        .filter((candidate) => Boolean(candidate));
    return candidates.sort((left, right) => right.score - left.score)[0] ?? null;
};
const buildDeepCutsCandidate = (eligibleTracks, context) => {
    const artistCounts = new Map();
    for (const track of library.getTracks()) {
        const key = track.artist.trim().toLowerCase();
        if (!key)
            continue;
        artistCounts.set(key, (artistCounts.get(key) ?? 0) + 1);
    }
    const pool = eligibleTracks.filter((track) => {
        const artistKey = track.artist.trim().toLowerCase();
        return ((artistCounts.get(artistKey) ?? 0) >= 4 &&
            (context.feedbackScoreMap.get(track.id) ?? 0) <= 1 &&
            !isLongTrack(track));
    });
    if (pool.length < getMinimumSetSize())
        return null;
    return buildProgrammingCandidate({
        mode: "special",
        label: "Deep shelf drift",
        description: "The album tracks and side doors, not the obvious front window.",
        specialType: "deep-cuts"
    }, pickSpecialTracks(pool, context, 5), context);
};
const maybeSelectProgramming = async (args) => {
    if (args.pendingRequestCount > 0)
        return null;
    const lastSpecialRaw = await redis.get(LAST_SPECIAL_AT_KEY);
    const lastSpecialAt = lastSpecialRaw ? Number(lastSpecialRaw) : 0;
    if (Number.isFinite(lastSpecialAt) && lastSpecialAt > 0 && Date.now() - lastSpecialAt < getSpecialMinGapMs()) {
        return null;
    }
    if (Math.random() > config.RADIO_SPECIAL_CHANCE)
        return null;
    const candidates = [
        buildSameArtistCandidate(args.eligibleTracks, args.context),
        buildAlbumRunCandidate(args.eligibleTracks, args.context),
        buildSameDecadeCandidate(args.eligibleTracks, args.context),
        buildGenrePocketCandidate(args.eligibleTracks, args.context),
        buildDeepCutsCandidate(args.eligibleTracks, args.context)
    ].filter((candidate) => Boolean(candidate));
    if (candidates.length === 0)
        return null;
    candidates.sort((left, right) => right.score - left.score);
    return candidates[0];
};
const materializePlaybackPlans = (tracks, rawPlans = []) => {
    const rawPlanByTrackId = new Map(rawPlans.map((plan) => [plan.trackId, plan]));
    return tracks
        .filter((track) => isLongTrack(track))
        .map((track) => {
        const requestedPlan = rawPlanByTrackId.get(track.id);
        const fallbackMode = requestedPlan?.mode ?? ((track.duration ?? 0) <= 15 * 60 ? "full" : "clip");
        const normalizedPlan = {
            trackId: track.id,
            title: track.title,
            artist: track.artist,
            duration: track.duration,
            mode: fallbackMode,
            ...(requestedPlan?.segment ? { segment: requestedPlan.segment } : {}),
            ...(requestedPlan?.reason
                ? { reason: requestedPlan.reason }
                : fallbackMode === "clip"
                    ? {
                        reason: "Mr Rassy kept the strongest passage of the long-form piece in the set instead of taking the full side."
                    }
                    : {
                        reason: "Mr Rassy let the full long-form arc run because the piece feels like the point, not just a sample."
                    })
        };
        if (normalizedPlan.mode === "clip") {
            const playback = planTrackPlayback(track, {
                playbackPlan: normalizedPlan,
                thresholdSeconds: config.RADIO_LONG_TRACK_THRESHOLD_SECONDS,
                clipWindowSeconds: config.RADIO_LONG_TRACK_CLIP_SECONDS,
                edgePaddingSeconds: config.RADIO_LONG_TRACK_EDGE_PADDING_SECONDS,
                fadeSeconds: config.RADIO_LONG_TRACK_FADE_SECONDS
            });
            return {
                ...normalizedPlan,
                cueInSeconds: playback.cueInSeconds,
                cueOutSeconds: playback.cueOutSeconds,
                fadeInSeconds: playback.fadeInSeconds,
                fadeOutSeconds: playback.fadeOutSeconds
            };
        }
        return normalizedPlan;
    });
};
const buildSnapshotContext = (context, setlistTracks) => {
    if (!context)
        return null;
    if (!Array.isArray(setlistTracks) || setlistTracks.length === 0)
        return context;
    const queuePreview = [...setlistTracks, ...context.queuePreview]
        .filter((track) => Boolean(track?.title) && Boolean(track?.artist))
        .filter((track, index, items) => {
        const key = track.id ?? `${track.artist}::${track.title}`;
        return (items.findIndex((candidate) => (candidate.id ?? `${candidate.artist}::${candidate.title}`) === key) ===
            index);
    })
        .slice(0, 10);
    return {
        ...context,
        queuePreview
    };
};
const queuePublishedBoothDossierRefresh = async (context, input, signature) => {
    if (!config.CHESHIRE_BASE_URL)
        return;
    const acquired = await redis.set(boothBuildingKey(signature), "1", "EX", Number(process.env.RADIO_HEARS_LOCK_SECONDS ?? 90), "NX");
    if (acquired !== "OK")
        return;
    void (async () => {
        try {
            const generated = await withSoftTimeout(buildBoothDossier(context, input), Number(process.env.RADIO_HEARS_BACKGROUND_TIMEOUT_MS ?? 45000));
            if (!generated)
                return;
            const payload = {
                ...generated,
                at: Date.now(),
                source: "llm",
                signature
            };
            await Promise.all([
                redis.set(DJ_HEARS_KEY, JSON.stringify(payload), "EX", 6 * 60 * 60),
                prisma.djScript.updateMany({
                    where: {
                        boothSignature: signature
                    },
                    data: {
                        boothDossier: payload
                    }
                })
            ]);
            await learnTrackInsightsFromBoothDossier(payload, {
                resolveTrack: (track) => track.trackId
                    ? library.getTrackById(track.trackId) ?? library.findByTitleArtist(track.title, track.artist)
                    : library.findByTitleArtist(track.title, track.artist)
            });
        }
        catch (error) {
            logger.error({ error, signature }, "Failed to upgrade saved booth dossier");
        }
        finally {
            await redis.del(boothBuildingKey(signature));
        }
    })();
};
export const publishDjScript = async (args) => {
    const at = Date.now();
    const snapshotContext = buildSnapshotContext(args.context, args.setlistTracks);
    const currentTrack = buildNoteCurrentTrack(snapshotContext);
    const setlist = buildNoteSetlist({
        context: snapshotContext,
        selectedTracks: args.setlistTracks ?? []
    });
    const trackIds = Array.from(new Set((args.trackIds ?? []).filter((trackId) => typeof trackId === "string" && trackId.trim().length > 0)));
    const boothSignature = snapshotContext
        ? buildBoothSignature(snapshotContext, {
            djScript: args.script,
            djReason: args.reason ?? null,
            programming: args.programming ?? snapshotContext.programming ?? null,
            playbackPlans: args.playbackPlans ?? []
        })
        : null;
    const boothDossier = snapshotContext
        ? {
            ...buildFallbackBoothDossier(snapshotContext, {
                djScript: args.script,
                djReason: args.reason ?? null,
                programming: args.programming ?? snapshotContext.programming ?? null,
                playbackPlans: args.playbackPlans ?? []
            }),
            at,
            source: "fallback",
            ...(boothSignature ? { signature: boothSignature } : {})
        }
        : null;
    const payload = {
        script: args.script,
        mood: args.mood,
        source: args.source,
        reason: args.reason ?? null,
        trackIds,
        programming: args.programming ?? snapshotContext?.programming ?? null,
        playbackPlans: args.playbackPlans ?? [],
        at
    };
    await Promise.all([
        redis.set(LAST_TALK_KEY, at.toString()),
        redis.set(DJ_SAYS_KEY, args.script, "EX", DJ_SCRIPT_TTL_SECONDS),
        redis.set(DJ_SAYS_META_KEY, JSON.stringify(payload), "EX", DJ_SCRIPT_TTL_SECONDS)
    ]);
    await Promise.all([
        prisma.djScript
            .create({
            data: {
                mood: args.mood,
                script: args.script,
                source: args.source,
                reason: args.reason ?? null,
                eventType: args.eventType ?? null,
                trackIds: trackIds,
                setlist: setlist,
                currentTrack: currentTrack ? currentTrack : Prisma.JsonNull,
                boothSignature: boothSignature ?? null,
                boothDossier: boothDossier ? boothDossier : Prisma.JsonNull
            }
        })
            .catch((error) => {
            logger.error({ error }, "Failed to persist DJ note");
        }),
        pushStationChatMessage(createStationChatMessage({
            role: "dj",
            kind: "station-update",
            text: args.script,
            mood: args.mood,
            recommendationStatus: "none",
            trackIds
        })).catch((error) => {
            logger.error({ error }, "Failed to publish DJ station update");
        })
    ]);
    if (snapshotContext && boothSignature) {
        await queuePublishedBoothDossierRefresh(snapshotContext, {
            djScript: args.script,
            djReason: args.reason ?? null,
            programming: args.programming ?? snapshotContext.programming ?? null,
            playbackPlans: args.playbackPlans ?? []
        }, boothSignature);
    }
};
const maybeGenerateTalk = async () => {
    const lastTalk = await redis.get(LAST_TALK_KEY);
    const lastTalkAt = lastTalk ? Number(lastTalk) : 0;
    const minGap = config.RADIO_MIN_TALK_MINUTES * 60 * 1000;
    if (Date.now() - lastTalkAt < minGap)
        return null;
    const context = await buildContext();
    const shouldTalk = await defaultDJ.shouldTalk(context);
    if (!shouldTalk)
        return null;
    const script = await defaultDJ.getTalkScript(context);
    if (!script)
        return null;
    await publishDjScript({
        script,
        mood: context.mood,
        source: defaultDJ.id,
        eventType: "talk",
        context,
        trackIds: context.nowPlaying?.id ? [context.nowPlaying.id] : []
    });
    return script;
};
const buildPlaylistCommentary = (context, tracks, decision) => {
    if (tracks.length === 0)
        return null;
    const lead = tracks[0];
    const leadScore = context.feedbackScoreMap.get(lead.id) ?? 0;
    const cleanReason = (() => {
        const trimmed = decision?.reason?.trim();
        if (!trimmed || trimmed.length < 8)
            return "";
        const normalized = trimmed.toLowerCase();
        if (["short", "flow", "mood", "vibe", "set", "transition", "none", "n/a"].includes(normalized)) {
            return "";
        }
        return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
    })();
    const vibeLine = leadScore >= 3
        ? "Listeners already had this one in their teeth."
        : leadScore <= -3
            ? "It is a beautiful left turn from the obvious move."
            : "The transition is earning its place instead of skating by on vibe.";
    const programmingLine = context.programming?.mode === "special"
        ? ` ${context.programming.label} is opening up.`
        : "";
    const reasonLine = cleanReason ? ` ${cleanReason}` : "";
    const requestLine = context.requests[0] ? ` The request line is whispering "${context.requests[0]}".` : "";
    const turn = buildTrackTurnIntelligence(lead, {
        previousTrack: context.nowPlaying
    });
    const factLine = buildTrackFactLine(lead);
    const contextLine = takeLeadSentence(turn.whyItFits);
    return `Mr Rassy is lining up ${buildTrackStamp(lead)}.${factLine ? ` ${factLine}` : ""} ${contextLine ? `${contextLine} ` : ""}${vibeLine}${programmingLine}${reasonLine}${requestLine}`.trim();
};
const choosePlaylistCommentary = (context, tracks, decision, options) => {
    if (options.allowCaptainScript) {
        const captainScript = normalizeCaptainScript(decision?.talkScript);
        if (captainScript) {
            return captainScript;
        }
    }
    return buildPlaylistCommentary(context, tracks, decision);
};
const persistLastPlaylist = async (payload) => {
    await redis.set(DJ_LAST_PLAYLIST_KEY, JSON.stringify({
        at: Date.now(),
        ...payload
    }), "EX", 60 * 60);
};
const enqueueTrack = async (track, playbackPlan) => {
    const queued = await pushToQueue(buildTrackQueueUri(track, {
        playbackPlan: playbackPlan ?? null,
        thresholdSeconds: config.RADIO_LONG_TRACK_THRESHOLD_SECONDS,
        clipWindowSeconds: config.RADIO_LONG_TRACK_CLIP_SECONDS,
        edgePaddingSeconds: config.RADIO_LONG_TRACK_EDGE_PADDING_SECONDS,
        fadeSeconds: config.RADIO_LONG_TRACK_FADE_SECONDS
    }));
    if (!queued) {
        logger.warn({ trackId: track.id, title: track.title, artist: track.artist }, "Failed to enqueue track");
        return false;
    }
    await redis.rpush(QUEUE_KEY, track.id);
    return true;
};
const pickSnippetCandidate = async (snippetId, options = {}) => {
    const pool = options.excludeIds?.size
        ? library.getSnippets().filter((item) => !options.excludeIds?.has(item.id))
        : library.getSnippets();
    if (pool.length === 0)
        return null;
    const recentSnippetIds = await getRecentSnippetIds();
    if (snippetId) {
        const requested = pool.find((item) => item.id === snippetId);
        if (!requested)
            return null;
        if (!recentSnippetIds.has(requested.id))
            return requested;
        const alternatePool = preferNonSelfSnippets(pool.filter((item) => item.id !== requested.id && !recentSnippetIds.has(item.id)), recentSnippetIds);
        return sampleWeightedItem(alternatePool, getSnippetWeight) ?? requested;
    }
    const freshPool = pool.filter((item) => !recentSnippetIds.has(item.id));
    const workingPool = preferNonSelfSnippets(freshPool.length > 0 ? freshPool : pool, recentSnippetIds);
    return sampleWeightedItem(workingPool, getSnippetWeight);
};
const enqueueSnippet = async (snippetId, options = {}) => {
    const snippet = await pickSnippetCandidate(snippetId, options);
    if (!snippet)
        return null;
    const queued = await pushToQueue(buildSnippetQueueUri(snippet, {
        trimThresholdSeconds: config.RADIO_SNIPPET_TRIM_THRESHOLD_SECONDS,
        playWindowSeconds: config.RADIO_SNIPPET_PLAY_WINDOW_SECONDS
    }));
    if (!queued) {
        logger.warn({ snippetId: snippet.id, label: snippet.label }, "Failed to enqueue snippet");
        return null;
    }
    await redis.rpush(QUEUE_KEY, `snippet:${snippet.id}`);
    await rememberRecentSnippet(snippet.id);
    return snippet.id;
};
const maybeEnqueueSnippet = async (context, pendingSnippet, usedSnippets, allowRandomFallback = true) => {
    if (library.getSnippets().length === 0)
        return;
    const snippetGate = await getSnippetPlaybackGateState();
    if (!snippetGate.allowed)
        return;
    let pickedSnippet = null;
    if (pendingSnippet.value) {
        pickedSnippet = pendingSnippet.value;
        pendingSnippet.value = null;
    }
    else {
        const djSnippet = await defaultDJ.pickSnippet(context);
        if (djSnippet && !usedSnippets.has(djSnippet)) {
            pickedSnippet = djSnippet;
        }
    }
    if (pickedSnippet) {
        const queuedSnippetId = await enqueueSnippet(pickedSnippet, { excludeIds: usedSnippets });
        if (queuedSnippetId) {
            usedSnippets.add(queuedSnippetId);
        }
        else {
            pendingSnippet.value = pickedSnippet;
        }
        return;
    }
    if (allowRandomFallback && Math.random() < config.RADIO_SNIPPET_CHANCE) {
        const queuedSnippetId = await enqueueSnippet(undefined, { excludeIds: usedSnippets });
        if (queuedSnippetId) {
            usedSnippets.add(queuedSnippetId);
        }
    }
};
const selectNextTracks = async (count, options = {}) => {
    const mood = await getMood();
    const bans = await getBans();
    const cooldownSnapshot = await buildTrackCooldownSnapshot();
    const recentPlayState = cooldownSnapshot.recentPlayState;
    const recentTrackIds = new Set(cooldownSnapshot.recentTrackIds);
    const recentArtists = new Set(cooldownSnapshot.recentArtists);
    const queuedTrackIds = options.excludeTrackIds
        ? new Set(options.excludeTrackIds)
        : new Set(await readQueuedTrackIds());
    const pendingTrackRequests = await listPendingTrackRequests(12);
    const requestedTrackIds = new Set(pendingTrackRequests
        .flatMap((request) => Array.isArray(request.trackIds) && request.trackIds.length > 0
        ? request.trackIds
            : request.trackId
                ? [request.trackId]
                : [])
        .filter((trackId) => typeof trackId === "string" && trackId.length > 0));
    const context = await buildContext(recentPlayState);
    const recentTrackSignatures = new Set(cooldownSnapshot.recentTrackSignatures);
    const eligibleTracks = library.getTracks().filter((track) => {
        const artistKey = track.artist.toLowerCase();
        if (queuedTrackIds.has(track.id))
            return false;
        if (bans.trackIds.has(track.id))
            return false;
        if (bans.artists.has(artistKey))
            return false;
        if (recentTrackIds.has(track.id))
            return false;
        if (recentTrackSignatures.has(buildTrackCooldownSignature(track)))
            return false;
        if (recentArtists.has(artistKey))
            return false;
        return true;
    });
    const programming = await maybeSelectProgramming({
        context,
        eligibleTracks,
        pendingRequestCount: pendingTrackRequests.length
    });
    const programmingTracks = (programming?.trackIds ?? [])
        .map((trackId) => library.getTrackById(trackId))
        .filter((track) => Boolean(track));
    const planningContext = programming && programmingTracks.length >= getMinimumSetSize()
        ? {
            ...context,
            programming,
            librarySample: programmingTracks
        }
        : context;
    const decision = count > 1 && defaultDJ.getPlaylist
        ? await defaultDJ.getPlaylist(planningContext, count)
        : await defaultDJ.getNextTrack(planningContext);
    await redis.set(DJ_LAST_DECISION_KEY, Date.now().toString());
    const decidedIds = decision?.playlist?.length
        ? decision.playlist
        : decision?.trackId
            ? [decision.trackId]
            : [];
    const targetMood = normalizeStationMood(decision?.mood ?? mood, {
        dayPart: context.dayPart,
        emotionalWeather: context.emotionalWeather,
        dayOfWeek: context.dayOfWeek
    });
    if (targetMood !== mood)
        await redis.set(MOOD_KEY, targetMood);
    const pickedTracks = [];
    const usedTrackIds = new Set();
    const honoredRequestTrackIds = new Set();
    const allowRepeatedProgrammingArtist = programming?.specialType === "same-artist" || programming?.specialType === "album-run";
    const repeatedArtistKey = programming?.artist?.toLowerCase() ?? programmingTracks[0]?.artist?.toLowerCase() ?? null;
    const tryAddTrack = (track, source = "fallback") => {
        if (!track)
            return false;
        if (usedTrackIds.has(track.id))
            return false;
        if (queuedTrackIds.has(track.id))
            return false;
        if (bans.trackIds.has(track.id))
            return false;
        const artistKey = track.artist.toLowerCase();
        const trackSignature = buildTrackCooldownSignature(track);
        const requested = source === "request" || requestedTrackIds.has(track.id);
        const repeatedArtistAllowed = allowRepeatedProgrammingArtist &&
            (source === "decision" || source === "programming") &&
            (!repeatedArtistKey || artistKey === repeatedArtistKey);
        if (bans.artists.has(artistKey))
            return false;
        if (!requested && recentTrackIds.has(track.id))
            return false;
        if (!requested && trackSignature && recentTrackSignatures.has(trackSignature))
            return false;
        if (!requested && !repeatedArtistAllowed && recentArtists.has(artistKey))
            return false;
        pickedTracks.push(track);
        usedTrackIds.add(track.id);
        queuedTrackIds.add(track.id);
        recentTrackIds.add(track.id);
        if (trackSignature) {
            recentTrackSignatures.add(trackSignature);
        }
        if (!repeatedArtistAllowed) {
            recentArtists.add(artistKey);
        }
        if (requested) {
            honoredRequestTrackIds.add(track.id);
        }
        return true;
    };
    for (const request of pendingTrackRequests.slice(0, 6)) {
        if (pickedTracks.length >= count)
            break;
        const candidateTrackIds = Array.isArray(request.trackIds) && request.trackIds.length > 0
            ? request.trackIds
            : request.trackId
                ? [request.trackId]
                : [];
        for (const requestTrackId of candidateTrackIds) {
            if (pickedTracks.length >= count)
                break;
            const requestedTrack = library.getTrackById(requestTrackId);
            tryAddTrack(requestedTrack, "request");
        }
    }
    for (const id of decidedIds) {
        if (!id)
            continue;
        const track = library.getTrackById(id);
        tryAddTrack(track, "decision");
        if (pickedTracks.length >= count)
            break;
    }
    if (programming) {
        for (const trackId of programming.trackIds) {
            if (pickedTracks.length >= count)
                break;
            tryAddTrack(library.getTrackById(trackId), "programming");
        }
    }
    while (pickedTracks.length < count) {
        const fallbackRecentArtists = new Set(recentArtists);
        if (allowRepeatedProgrammingArtist && repeatedArtistKey) {
            fallbackRecentArtists.delete(repeatedArtistKey);
        }
        const next = pickTrack(programmingTracks.length > 0 ? programmingTracks : library.getTracks(), {
            mood: targetMood,
            dayPart: planningContext.dayPart,
            dayOfWeek: planningContext.dayOfWeek,
            emotionalWeather: planningContext.emotionalWeather,
            bannedTrackIds: new Set([...bans.trackIds, ...queuedTrackIds]),
            bannedArtists: bans.artists,
            recentTrackIds,
            recentTrackSignatures,
            recentArtists: fallbackRecentArtists,
            feedbackScores: planningContext.feedbackScoreMap,
            feedbackWeight: config.RADIO_FEEDBACK_WEIGHT
        });
        if (!next)
            break;
        if (!tryAddTrack(next, "fallback"))
            break;
    }
    const captainTrackIds = decidedIds.filter((id) => usedTrackIds.has(id));
    const hasCaptainTrackControl = captainTrackIds.length > 0;
    const baseSelectionSource = honoredRequestTrackIds.size > 0 && !decision
        ? "request-line"
        : !decision || (!hasCaptainTrackControl && !decision.snippetId && !(decision.mood && decision.mood !== mood))
            ? "fallback"
            : pickedTracks.length > captainTrackIds.length
                ? `${defaultDJ.id}:assisted`
                : defaultDJ.id;
    const programmingSource = programming?.mode === "special" && programming.trackIds.some((trackId) => usedTrackIds.has(trackId))
        ? `${baseSelectionSource}:${programming.specialType ?? "special"}`
        : baseSelectionSource;
    const selectionSource = programmingSource;
    await redis.set(DJ_MODE_KEY, selectionSource);
    const rawPlaybackPlans = defaultDJ.planTrackPlayback
        ? ((await defaultDJ.planTrackPlayback(planningContext, pickedTracks)) ?? [])
        : [];
    const playbackPlans = materializePlaybackPlans(pickedTracks, rawPlaybackPlans);
    const playlistScript = choosePlaylistCommentary(planningContext, pickedTracks, decision ?? null, {
        allowCaptainScript: hasCaptainTrackControl
    });
    if (programming?.mode === "special" && pickedTracks.length >= getMinimumSetSize()) {
        await redis.set(LAST_SPECIAL_AT_KEY, Date.now().toString());
    }
    if (decision) {
        logger.info({
            trackIds: pickedTracks.map((track) => track.id),
            llmTrackIds: captainTrackIds,
            requestedTrackIds: Array.from(honoredRequestTrackIds),
            source: selectionSource,
            programming,
            mood: decision.mood ?? mood,
            reason: decision.reason ?? null,
            talkScript: decision.talkScript ?? null,
            snippetId: decision.snippetId ?? null,
            playbackPlans,
            count: pickedTracks.length
        }, "DJ playlist decision");
    }
    else {
        logger.info({
            mode: honoredRequestTrackIds.size > 0 ? "request-line" : "fallback",
            requestedTrackIds: Array.from(honoredRequestTrackIds),
            programming,
            playbackPlans,
            count: pickedTracks.length
        }, "DJ playlist decision");
    }
    return {
        tracks: pickedTracks,
        context: planningContext,
        decision,
        targetMood,
        playlistScript,
        programming,
        playbackPlans,
        selectionSource,
        honoredRequestTrackIds: Array.from(honoredRequestTrackIds)
    };
};
const consumeQueueHeadForTrackStart = async (match) => {
    const queueEntries = await redis.lrange(QUEUE_KEY, 0, -1);
    const alignment = alignQueueEntriesToStartedTrack(queueEntries, match?.id);
    if (alignment.entriesToConsume > 0) {
        if (alignment.entriesToConsume >= queueEntries.length) {
            await redis.del(QUEUE_KEY);
        }
        else {
            await redis.ltrim(QUEUE_KEY, alignment.entriesToConsume, -1);
        }
    }
    if (alignment.skippedTrackIds.length > 0) {
        logger.warn({
            skippedTrackIds: alignment.skippedTrackIds,
            matchedTrackId: match?.id ?? null,
            title: match?.title ?? null,
            artist: match?.artist ?? null
        }, "Realigned Redis queue to the started track");
    }
    else if (match?.id && queueEntries[0] && !alignment.matched) {
        logger.warn({
            queueHead: queueEntries[0],
            matchedTrackId: match.id,
            title: match.title,
            artist: match.artist
        }, "Now playing did not match the queue head");
    }
    return {
        poppedTrackId: alignment.poppedTrackId,
        consumedSnippetIds: alignment.consumedSnippetIds
    };
};
const getDuplicateTrackStartWindowMs = (track) => {
    const durationMs = typeof track?.duration === "number" && track.duration > 0
        ? Math.max(60_000, track.duration * 1000 - 15_000)
        : 4 * 60 * 1000;
    return Math.max(90_000, Math.min(durationMs, 8 * 60 * 1000));
};
const updateOnMetaChange = async (meta) => {
    const now = {
        title: meta.title ?? meta.song ?? meta.track ?? "",
        artist: meta.artist ?? "",
        album: meta.album ?? "",
        startedAt: new Date().toISOString()
    };
    const explicitTrackId = meta.track_id?.trim() ||
        meta.trackId?.trim() ||
        meta.rassy_track_id?.trim() ||
        meta.rassyTrackId?.trim() ||
        "";
    const match = explicitTrackId
        ? library.getTrackById(explicitTrackId) ?? library.findByTitleArtist(now.title, now.artist)
        : library.findByTitleArtist(now.title, now.artist);
    const currentNow = safeJson(await redis.get(NOW_KEY));
    if (match?.id && currentNow?.id === match.id && currentNow.startedAt) {
        const currentStartedAtMs = Date.parse(currentNow.startedAt);
        if (Number.isFinite(currentStartedAtMs)) {
            const duplicateWindowMs = getDuplicateTrackStartWindowMs(match);
            if (Date.now() - currentStartedAtMs < duplicateWindowMs) {
                return;
            }
        }
    }
    const queueConsumption = await consumeQueueHeadForTrackStart(match);
    if (queueConsumption.consumedSnippetIds.length > 0) {
        await redis.set(LAST_SNIPPET_AT_KEY, Date.now().toString());
    }
    const approvedSkip = match ? await consumeMarkedSkip(match.id) : false;
    if (match) {
        now.id = match.id;
        now.album = match.album ?? now.album;
        if (match.albumArtUrl) {
            now.albumArtUrl = match.albumArtUrl;
        }
        if (match.year) {
            now.year = match.year;
        }
        if (match.genres?.length) {
            now.genres = match.genres;
        }
        now.energy = match.energy;
        const timestamp = Date.now();
        const mood = await getMood();
        await redis.zadd(RECENT_TRACKS_KEY, timestamp, match.id);
        await redis.lpush(RECENT_ARTISTS_TRACK_KEY, match.artist.toLowerCase());
        await redis.ltrim(RECENT_ARTISTS_TRACK_KEY, 0, config.RADIO_ARTIST_COOLDOWN_TRACKS - 1);
        const cutoff = timestamp - getTrackCooldownMs();
        await redis.zremrangebyscore(RECENT_TRACKS_KEY, 0, cutoff);
        await prisma.playLog.create({
            data: {
                trackId: match.id,
                title: match.title,
                artist: match.artist,
                album: match.album,
                duration: match.duration,
                mood
            }
        });
        void recordTrackPlayInsight(match);
        const feedbackScore = Number((await redis.hget(FEEDBACK_SCORES_KEY, match.id)) ?? 0);
        await pushStationChatMessage(createStationChatMessage({
            role: "dj",
            kind: "station-update",
            text: buildTrackStartCommentary(match, mood, feedbackScore),
            mood,
            trackIds: [match.id]
        }));
    }
    else if (queueConsumption.consumedSnippetIds.length > 0) {
        // snippets do not count for recency
    }
    await redis.set(NOW_KEY, JSON.stringify(now));
    await redis.lpush(HISTORY_KEY, JSON.stringify(now));
    await redis.ltrim(HISTORY_KEY, 0, 49);
    if (approvedSkip && match) {
        await pushStationChatMessage(createStationChatMessage({
            role: "dj",
            kind: "station-update",
            text: `Mr Rassy heard the call and is cutting away from ${buildTrackStamp(match)} before it settles too deep into the room.`,
            mood: await getMood(),
            trackIds: [match.id]
        }));
        await skipCurrent();
    }
};
const startMetadataPoller = (onTrackStart) => {
    let lastSignature = "";
    setInterval(async () => {
        try {
            const meta = await fetchMeta();
            if (!meta)
                return;
            const signature = meta.track_id?.trim() ||
                meta.trackId?.trim() ||
                `${meta.artist ?? ""}-${meta.title ?? meta.song ?? ""}`;
            if (signature && signature !== lastSignature) {
                lastSignature = signature;
                await updateOnMetaChange(meta);
                onTrackStart();
            }
        }
        catch {
            // ignore transient errors
        }
    }, 5000);
};
const reconcileQueueDepth = async () => {
    const redisQueue = await redis.lrange(QUEUE_KEY, 0, -1);
    const liquidsoapQueue = await readQueuedEntries();
    if (liquidsoapQueue === null)
        return redisQueue.length;
    if (redisQueue.length === liquidsoapQueue.length && redisQueue.every((entry, index) => entry === liquidsoapQueue[index])) {
        return liquidsoapQueue.length;
    }
    await redis.del(QUEUE_KEY);
    if (liquidsoapQueue.length > 0) {
        await redis.rpush(QUEUE_KEY, ...liquidsoapQueue);
    }
    logger.warn({
        redisQueue,
        liquidsoapQueue,
        redisDepth: redisQueue.length,
        liquidsoapDepth: liquidsoapQueue.length
    }, "Reconciled Redis queue to Liquidsoap queue entries");
    return liquidsoapQueue.length;
};
const refreshLibrary = async () => {
    logger.info("Starting full library scan");
    let anySectionUpdated = false;
    let nextTracks = null;
    try {
        nextTracks = await scanLibrary(config.MUSIC_LIBRARY_PATH);
    }
    catch (error) {
        logger.error({ error, path: config.MUSIC_LIBRARY_PATH }, "Local music scan failed");
    }
    if ((nextTracks === null || nextTracks.length === 0) && config.MSTREAM_BASE_URL) {
        try {
            nextTracks = await scanMstreamLibrary({
                baseUrl: config.MSTREAM_BASE_URL,
                root: config.MSTREAM_LIBRARY_ROOT,
                token: config.MSTREAM_TOKEN
            });
        }
        catch (error) {
            logger.warn({ error }, "mstream scan failed after local library scan");
        }
    }
    if (nextTracks !== null) {
        library.setTracks(nextTracks);
        anySectionUpdated = true;
    }
    try {
        const snippets = await scanSnippets(config.SNIPPETS_PATH);
        library.setSnippets(snippets);
        anySectionUpdated = true;
    }
    catch (error) {
        logger.error({ error, path: config.SNIPPETS_PATH }, "Snippet scan failed");
    }
    try {
        const podcasts = await scanPodcasts(config.PODCAST_LIBRARY_PATH);
        library.setPodcasts(podcasts);
        anySectionUpdated = true;
    }
    catch (error) {
        logger.error({ error, path: config.PODCAST_LIBRARY_PATH }, "Podcast scan failed");
    }
    if (hasImmichPhotoSource() || config.PHOTOS_LIBRARY_PATH) {
        const { anyPhotoSourceUpdated, photos } = await loadPhotoSources("full");
        if (anyPhotoSourceUpdated) {
            library.setPhotos(photos);
            anySectionUpdated = true;
        }
    }
    if (!anySectionUpdated) {
        logger.error("Library scan failed for every mounted source");
        return;
    }
    const scannedAt = Date.now().toString();
    await redis.set(LIBRARY_LAST_SCAN_KEY, scannedAt);
    await persistCurrentLibrary("full");
    void syncTrackInsights(library.getTracks()).catch((error) => {
        logger.error({ error }, "Failed to sync track intelligence after full library scan");
    });
    logger.info({
        tracks: library.getTracks().length,
        snippets: library.getSnippets().length,
        podcasts: library.getPodcasts().length,
        podcastEpisodes: library
            .getPodcasts()
            .reduce((total, series) => total + series.episodeCount, 0),
        photos: library.getPhotos().length,
        scannedAt: Number(scannedAt)
    }, "Library scan complete");
};
const primeLibrary = async () => {
    logger.info("Starting quick library scan");
    let anySectionUpdated = false;
    try {
        let nextTracks = await scanLibraryQuick(config.MUSIC_LIBRARY_PATH);
        if (nextTracks.length === 0 && config.MSTREAM_BASE_URL) {
            nextTracks = await scanMstreamLibrary({
                baseUrl: config.MSTREAM_BASE_URL,
                root: config.MSTREAM_LIBRARY_ROOT,
                token: config.MSTREAM_TOKEN
            });
        }
        library.setTracks(mergeQuickTracks(library.getTracks(), nextTracks));
        anySectionUpdated = true;
    }
    catch (error) {
        logger.error({ error, path: config.MUSIC_LIBRARY_PATH }, "Quick music scan failed");
    }
    try {
        const snippets = await scanSnippetsQuick(config.SNIPPETS_PATH);
        library.setSnippets(mergeQuickSnippets(library.getSnippets(), snippets));
        anySectionUpdated = true;
    }
    catch (error) {
        logger.error({ error, path: config.SNIPPETS_PATH }, "Quick snippet scan failed");
    }
    try {
        const podcasts = await scanPodcastsQuick(config.PODCAST_LIBRARY_PATH);
        library.setPodcasts(mergeQuickPodcasts(library.getPodcasts(), podcasts));
        anySectionUpdated = true;
    }
    catch (error) {
        logger.error({ error, path: config.PODCAST_LIBRARY_PATH }, "Quick podcast scan failed");
    }
    if (hasImmichPhotoSource() || config.PHOTOS_LIBRARY_PATH) {
        const { anyPhotoSourceUpdated, photos } = await loadPhotoSources("quick");
        if (anyPhotoSourceUpdated) {
            library.setPhotos(photos);
            anySectionUpdated = true;
        }
    }
    if (!anySectionUpdated) {
        logger.error("Library quick scan failed for every mounted source");
        return;
    }
    const scannedAt = Date.now().toString();
    await redis.set(LIBRARY_LAST_SCAN_KEY, scannedAt);
    await persistCurrentLibrary("quick");
    logger.info({
        tracks: library.getTracks().length,
        snippets: library.getSnippets().length,
        podcasts: library.getPodcasts().length,
        podcastEpisodes: library
            .getPodcasts()
            .reduce((total, series) => total + series.episodeCount, 0),
        photos: library.getPhotos().length,
        scannedAt: Number(scannedAt)
    }, "Library quick scan complete");
};
export const startScheduler = async () => {
    await primeLibrary();
    if ((await redis.get(MOOD_KEY)) === null) {
        await redis.set(MOOD_KEY, config.RADIO_MOOD);
    }
    if (config.CHESHIRE_BASE_URL) {
        const currentDjMode = await redis.get(DJ_MODE_KEY);
        if (!currentDjMode || currentDjMode === "fallback") {
            await redis.set(DJ_MODE_KEY, defaultDJ.id);
        }
    }
    let fillingQueue = false;
    let queueRerunRequested = false;
    let liquidsoapWasReady = false;
    const runQueueFill = async () => {
        if (fillingQueue) {
            queueRerunRequested = true;
            return;
        }
        fillingQueue = true;
        try {
            const liquidsoapReady = await isLiquidsoapReady();
            if (!liquidsoapReady) {
                if (liquidsoapWasReady) {
                    logger.warn("Liquidsoap telnet became unavailable; deferring queue fill");
                }
                liquidsoapWasReady = false;
                return;
            }
            if (!liquidsoapWasReady) {
                liquidsoapWasReady = true;
                logger.info("Liquidsoap telnet ready; queue fill enabled");
            }
            do {
                queueRerunRequested = false;
                await reconcileQueueDepth();
                const lockedQueueTarget = getLockedQueueTrackCount();
                const queuedTracks = await readQueuedTrackIds();
                if (queuedTracks.length >= lockedQueueTarget)
                    break;
                let queuedTrackIds = queuedTracks.slice();
                while (queuedTrackIds.length < lockedQueueTarget) {
                    let planTrackIds = await redis.lrange(SET_PLAN_KEY, 0, -1);
                    let planMeta = await readStoredSetPlan();
                    let selectionContext = null;
                    const usedSnippets = new Set();
                    const pendingSnippet = { value: planMeta?.snippetId ?? null };
                    let shouldAttemptSnippet = false;
                    if (planTrackIds.length === 0) {
                        const decisionBatchSize = getDecisionBatchTrackCount();
                        const selection = await selectNextTracks(decisionBatchSize, {
                            excludeTrackIds: new Set(queuedTrackIds)
                        });
                        if (selection.tracks.length === 0)
                            break;
                        planTrackIds = selection.tracks.map((track) => track.id);
                        const nextPlanMeta = {
                            trackIds: planTrackIds,
                            mood: selection.targetMood,
                            reason: selection.decision?.reason ?? null,
                            talkScript: selection.playlistScript ?? null,
                            snippetId: selection.decision?.snippetId ?? null,
                            programming: selection.programming ?? null,
                            playbackPlans: selection.playbackPlans ?? [],
                            selectionSource: selection.selectionSource,
                            plannerMode: decisionBatchSize > getLockedQueueTrackCount() ? "set-plan" : "rolling-window",
                            decisionBatchSize,
                            createdAt: Date.now()
                        };
                        planMeta = nextPlanMeta;
                        selectionContext = selection.context;
                        shouldAttemptSnippet = true;
                        await storeSetPlan(nextPlanMeta);
                        await persistLastPlaylist({
                            trackIds: planTrackIds,
                            mood: selection.targetMood,
                            reason: selection.decision?.reason ?? null,
                            talkScript: selection.playlistScript,
                            snippetId: selection.decision?.snippetId ?? null,
                            programming: selection.programming ?? null,
                            playbackPlans: selection.playbackPlans ?? [],
                            plannerMode: decisionBatchSize > getLockedQueueTrackCount() ? "set-plan" : "rolling-window",
                            decisionBatchSize,
                            count: planTrackIds.length
                        });
                        if (selection.playlistScript) {
                            const currentScript = await redis.get(DJ_SAYS_KEY);
                            if (currentScript !== selection.playlistScript) {
                                await publishDjScript({
                                    script: selection.playlistScript,
                                    mood: selection.targetMood,
                                    source: selection.selectionSource.startsWith("fallback")
                                        ? "fallback-dj"
                                        : selection.selectionSource === "request-line"
                                            ? "request-line"
                                            : defaultDJ.id,
                                    reason: selection.decision?.reason ?? null,
                                    trackIds: planTrackIds,
                                    eventType: "playlist",
                                    context: selection.context,
                                    setlistTracks: selection.tracks,
                                    programming: selection.programming ?? null,
                                    playbackPlans: selection.playbackPlans ?? []
                                });
                            }
                        }
                    }
                    const nextTrackId = planTrackIds[0];
                    if (!nextTrackId)
                        break;
                    const nextTrack = library.getTrackById(nextTrackId);
                    if (!nextTrack || queuedTrackIds.includes(nextTrack.id)) {
                        await redis.lpop(SET_PLAN_KEY);
                        continue;
                    }
                    const cooldownSnapshot = await buildTrackCooldownSnapshot();
                    const nextTrackSignature = buildTrackCooldownSignature(nextTrack);
                    if (cooldownSnapshot.recentTrackIds.has(nextTrack.id) ||
                        (nextTrackSignature && cooldownSnapshot.recentTrackSignatures.has(nextTrackSignature))) {
                        logger.warn({
                            trackId: nextTrack.id,
                            title: nextTrack.title,
                            artist: nextTrack.artist,
                            liveTrackId: cooldownSnapshot.liveTrack?.id ?? null,
                            liveTrackTitle: cooldownSnapshot.liveTrack?.title ?? null,
                            liveTrackArtist: cooldownSnapshot.liveTrack?.artist ?? null,
                            plannerMode: planMeta?.plannerMode ?? "rolling-window"
                        }, "Discarded stale planned track that had already entered cooldown");
                        await redis.lpop(SET_PLAN_KEY);
                        continue;
                    }
                    if (shouldAttemptSnippet) {
                        await maybeEnqueueSnippet(selectionContext ?? (await buildContext()), pendingSnippet, usedSnippets, false);
                    }
                    const playbackPlan = planMeta?.playbackPlans?.find((plan) => plan.trackId === nextTrack.id) ?? null;
                    if (!(await enqueueTrack(nextTrack, playbackPlan))) {
                        queueRerunRequested = true;
                        logger.warn({
                            trackId: nextTrack.id,
                            title: nextTrack.title,
                            artist: nextTrack.artist
                        }, "Queue fill failed to enqueue planned track");
                        break;
                    }
                    await redis.lpop(SET_PLAN_KEY);
                    await consumeTrackRequest(nextTrack.id);
                    queuedTrackIds.push(nextTrack.id);
                }
                await maybeGenerateTalk();
            } while (queueRerunRequested);
        }
        finally {
            fillingQueue = false;
        }
    };
    let scanningLibrary = false;
    const runLibraryRefresh = async (mode = "quick") => {
        if (scanningLibrary)
            return;
        scanningLibrary = true;
        try {
            if (mode === "full") {
                await refreshLibrary();
            }
            else {
                await primeLibrary();
            }
        }
        finally {
            scanningLibrary = false;
        }
    };
    startMetadataPoller(() => {
        void runQueueFill();
    });
    setInterval(() => {
        void runQueueFill();
    }, 15000);
    setInterval(() => {
        void runLibraryRefresh("quick");
    }, Math.max(30, config.RADIO_LIBRARY_REFRESH_SECONDS) * 1000);
    await runQueueFill();
    void runLibraryRefresh("full");
};
