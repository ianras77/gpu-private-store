import { createHash } from "crypto";
import path from "path";
import { Track } from "./types";

const AUDIO_EXTENSIONS = [".mp3", ".flac", ".wav", ".m4a", ".aac", ".ogg"];

const hashId = (value: string) =>
  createHash("sha1").update(value).digest("hex").slice(0, 16);

const seeded = (value: string) => {
  const hash = createHash("sha1").update(value).digest();
  const int = hash.readUInt32BE(0);
  return (int % 1000) / 1000;
};

const moodFromEnergy = (energy: number) => {
  if (energy < 0.35) return ["late-night", "focus", "dreamy"];
  if (energy < 0.65) return ["daydream", "morning", "flow"];
  return ["silly", "party", "sunburst"];
};

const normalizeText = (value: string | undefined | null, fallback: string) => {
  if (!value) return fallback;
  const cleaned = value.toString().trim();
  return cleaned.length > 0 ? cleaned : fallback;
};

const toGenres = (value: unknown) => {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item).trim())
      .filter((item) => item.length > 0);
  }
  if (typeof value === "string") {
    return value
      .split(/[;,/]/)
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }
  return undefined;
};

const escapeFilePath = (filepath: string) =>
  encodeURI(
    filepath
      .replace(/%/g, "%25")
      .replace(/#/g, "%23")
      .replace(/\?/g, "%3F")
      .replace(/^\/+/, "")
  );

const buildMediaUrl = (baseUrl: string, filepath: string, token?: string) => {
  const base = baseUrl.replace(/\/$/, "");
  const escaped = escapeFilePath(filepath);
  const tokenQuery = token ? `?token=${token}` : "";
  return `${base}/media/${escaped}${tokenQuery}`;
};

const buildAlbumArtUrl = (baseUrl: string, albumArt?: string, token?: string) => {
  if (!albumArt) return undefined;
  const base = baseUrl.replace(/\/$/, "");
  const tokenQuery = token ? `&token=${token}` : "";
  return `${base}/album-art/${albumArt}?compress=l${tokenQuery}`;
};

const buildHeaders = (token?: string): Record<string, string> => {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["x-access-token"] = token;
  return headers;
};

const postJson = async <T>(url: string, body: Record<string, unknown>, token?: string): Promise<T> => {
  const res = await fetch(url, {
    method: "POST",
    headers: buildHeaders(token),
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    throw new Error(`mstream request failed: ${res.status}`);
  }
  return res.json();
};

const fetchFileList = async (baseUrl: string, root: string, token?: string) => {
  const url = `${baseUrl.replace(/\/$/, "")}/api/v1/file-explorer/recursive`;
  const data = await postJson<any>(url, { directory: root }, token);
  if (Array.isArray(data)) return data as string[];
  if (Array.isArray(data?.files)) return data.files as string[];
  return [];
};

const fetchMetadata = async (baseUrl: string, filepath: string, token?: string) => {
  const url = `${baseUrl.replace(/\/$/, "")}/api/v1/db/metadata`;
  const data = await postJson<any>(url, { filepath }, token);
  return data?.metadata ?? null;
};

const withConcurrency = async <T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>) => {
  const results: R[] = new Array(items.length);
  let index = 0;
  const workers = Array.from({ length: Math.max(1, limit) }, async () => {
    while (true) {
      const current = index;
      index += 1;
      if (current >= items.length) break;
      results[current] = await fn(items[current]);
    }
  });
  await Promise.all(workers);
  return results;
};

export const scanMstreamLibrary = async (options: {
  baseUrl: string;
  root: string;
  token?: string;
  concurrency?: number;
}) => {
  const { baseUrl, root, token, concurrency = 6 } = options;
  const files = await fetchFileList(baseUrl, root, token);
  const audioFiles = files.filter((file) =>
    AUDIO_EXTENSIONS.includes(path.extname(file).toLowerCase())
  );

  const tracks = await withConcurrency(audioFiles, concurrency, async (file) => {
    try {
      const metadata = await fetchMetadata(baseUrl, file, token);
      const title = normalizeText(metadata?.title, path.basename(file, path.extname(file)));
      const artist = normalizeText(metadata?.artist, "Unknown Artist");
      const album = metadata?.album ?? undefined;
      const year = typeof metadata?.year === "number" ? metadata.year : undefined;
      const genres = toGenres(metadata?.genre);
      const albumArtUrl = buildAlbumArtUrl(baseUrl, metadata?.["album-art"], token);
      const energy = seeded(file);
      const track: Track = {
        id: hashId(file),
        path: buildMediaUrl(baseUrl, file, token),
        title,
        artist,
        album,
        year,
        genres,
        albumArtUrl,
        energy,
        moodTags: moodFromEnergy(energy)
      };
      return track;
    } catch {
      const fallbackTitle = path.basename(file, path.extname(file));
      const energy = seeded(file);
      return {
        id: hashId(file),
        path: buildMediaUrl(baseUrl, file, token),
        title: fallbackTitle,
        artist: "Unknown Artist",
        energy,
        moodTags: moodFromEnergy(energy)
      } as Track;
    }
  });

  return tracks;
};

export type MstreamFeaturedTrack = {
  id: string;
  title: string;
  artist: string;
  album?: string;
  year?: number;
  genres?: string[];
  albumArtUrl?: string;
  streamUrl?: string;
  lastPlayedAt?: string;
};

export const fetchMstreamRecentlyPlayed = async (options: {
  baseUrl: string;
  limit?: number;
  token?: string;
}) => {
  const { baseUrl, limit = 8, token } = options;
  const url = `${baseUrl.replace(/\/$/, "")}/api/v1/db/stats/recently-played`;
  const data = await postJson<any[]>(url, { limit }, token);
  if (!Array.isArray(data)) return [];
  return data.map((item) => {
    const filepath = item?.filepath ?? "";
    const metadata = item?.metadata ?? {};
    const lastPlayed = metadata?.["last-played"];
    return {
      id: hashId(filepath || metadata?.hash || JSON.stringify(metadata)),
      title: normalizeText(metadata?.title, path.basename(filepath, path.extname(filepath))),
      artist: normalizeText(metadata?.artist, "Unknown Artist"),
      album: metadata?.album ?? undefined,
      year: typeof metadata?.year === "number" ? metadata.year : undefined,
      genres: toGenres(metadata?.genre),
      albumArtUrl: buildAlbumArtUrl(baseUrl, metadata?.["album-art"], token),
      streamUrl: filepath ? buildMediaUrl(baseUrl, filepath, token) : undefined,
      lastPlayedAt: lastPlayed ? new Date(Number(lastPlayed)).toISOString() : undefined
    } as MstreamFeaturedTrack;
  });
};
