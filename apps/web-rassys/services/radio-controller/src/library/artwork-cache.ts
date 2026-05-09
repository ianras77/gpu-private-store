import { promises as fs } from "fs";
import path from "path";
import { prisma } from "../db";
import { logger } from "../logger";
import { readArtwork } from "./index";
import type { Track } from "./types";

type ArtworkPayload = {
  mimeType: string;
  data: Buffer;
  byteLength: number;
};

type ArtworkRecord = ArtworkPayload & {
  source: string;
  sourceUrl?: string;
};

const IMAGE_CONTENT_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

const ARTWORK_CACHE_TIMEOUT_MS = Math.max(
  1000,
  Number(process.env.RADIO_ARTWORK_CACHE_TIMEOUT_MS ?? 7000),
);
const ARTWORK_CACHE_MAX_BYTES = Math.max(
  64 * 1024,
  Number(process.env.RADIO_ARTWORK_CACHE_MAX_BYTES ?? 12 * 1024 * 1024),
);

const isRemoteUrl = (value?: string | null): value is string =>
  Boolean(value && /^https?:\/\//i.test(value));

const getImageContentType = (filepath: string) =>
  IMAGE_CONTENT_TYPES[path.extname(filepath).toLowerCase()] ??
  "application/octet-stream";

const normalizeMimeType = (value?: string | null) => {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return "image/jpeg";
  if (normalized.includes("/")) return normalized;
  if (normalized === "jpg" || normalized === "jpeg") return "image/jpeg";
  if (normalized === "png") return "image/png";
  if (normalized === "webp") return "image/webp";
  if (normalized === "gif") return "image/gif";
  return "image/jpeg";
};

const withinSizeLimit = (record: ArtworkRecord) => {
  if (record.byteLength <= ARTWORK_CACHE_MAX_BYTES) return record;
  logger.warn(
    {
      byteLength: record.byteLength,
      maxBytes: ARTWORK_CACHE_MAX_BYTES,
      source: record.source,
      sourceUrl: record.sourceUrl,
    },
    "Skipping oversized artwork cache entry",
  );
  return null;
};

const loadEmbeddedOrNearbyArtwork = async (
  track: Track,
): Promise<ArtworkRecord | null> => {
  if (isRemoteUrl(track.path)) return null;

  const artwork = await readArtwork(track.path);
  if (!artwork) return null;

  if (artwork.type === "embedded") {
    const data = Buffer.from(artwork.data);
    return withinSizeLimit({
      mimeType: normalizeMimeType(artwork.format),
      data,
      byteLength: data.length,
      source: "embedded",
    });
  }

  const data = await fs.readFile(artwork.path);
  return withinSizeLimit({
    mimeType: getImageContentType(artwork.path),
    data,
    byteLength: data.length,
    source: "file",
    sourceUrl: artwork.path,
  });
};

const loadRemoteArtwork = async (
  sourceUrl: string,
): Promise<ArtworkRecord | null> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    ARTWORK_CACHE_TIMEOUT_MS,
  );

  try {
    const response = await fetch(sourceUrl, {
      method: "GET",
      cache: "no-store",
      redirect: "follow",
      signal: controller.signal,
    });

    if (!response.ok) return null;

    const arrayBuffer = await response.arrayBuffer();
    const data = Buffer.from(arrayBuffer);
    if (data.length === 0) return null;

    return withinSizeLimit({
      mimeType: normalizeMimeType(response.headers.get("content-type")),
      data,
      byteLength: data.length,
      source: "remote",
      sourceUrl,
    });
  } catch (error) {
    logger.warn({ error, sourceUrl }, "Remote artwork fetch failed");
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
};

const persistTrackArtwork = async (track: Track, artwork: ArtworkRecord) => {
  await prisma.libraryTrackArtwork.upsert({
    where: {
      trackId: track.id,
    },
    create: {
      trackId: track.id,
      mimeType: artwork.mimeType,
      data: artwork.data,
      byteLength: artwork.byteLength,
      source: artwork.source,
      sourceUrl: artwork.sourceUrl ?? null,
      fetchedAt: new Date(),
    },
    update: {
      mimeType: artwork.mimeType,
      data: artwork.data,
      byteLength: artwork.byteLength,
      source: artwork.source,
      sourceUrl: artwork.sourceUrl ?? null,
      fetchedAt: new Date(),
    },
  });
};

export const getCachedTrackArtwork = async (
  trackId: string,
): Promise<ArtworkPayload | null> => {
  const cached = await prisma.libraryTrackArtwork.findUnique({
    where: {
      trackId,
    },
  });

  if (!cached) return null;

  return {
    mimeType: cached.mimeType,
    data: Buffer.from(cached.data),
    byteLength: cached.byteLength,
  };
};

export const resolveTrackArtwork = async (
  track: Track,
  options: {
    refresh?: boolean;
  } = {},
): Promise<ArtworkPayload | null> => {
  const shouldRefresh = options.refresh === true;

  if (!shouldRefresh) {
    const cached = await getCachedTrackArtwork(track.id);
    if (cached) return cached;
  }

  const fetched =
    (isRemoteUrl(track.albumArtUrl)
      ? await loadRemoteArtwork(track.albumArtUrl)
      : null) ??
    (track.hasArtwork ? await loadEmbeddedOrNearbyArtwork(track) : null);

  if (!fetched) {
    if (shouldRefresh) {
      return getCachedTrackArtwork(track.id);
    }
    return null;
  }

  try {
    await persistTrackArtwork(track, fetched);
  } catch (error) {
    logger.warn(
      { error, trackId: track.id },
      "Failed to persist track artwork cache",
    );
  }

  return {
    mimeType: fetched.mimeType,
    data: fetched.data,
    byteLength: fetched.byteLength,
  };
};

export const warmTrackArtworkCache = async (track: Track) => {
  if (!track.id) return;
  if (!track.hasArtwork && !isRemoteUrl(track.albumArtUrl)) return;
  await resolveTrackArtwork(track, { refresh: true });
};
