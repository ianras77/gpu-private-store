import { prisma } from "../db";
import { logger } from "../logger";
import type { PodcastEpisode, PodcastSeries, Snippet, Track } from "./types";

const CATALOG_SCOPE = "library";
const WRITE_CHUNK_SIZE = 250;

export const CATALOG_CACHE_TABLES = [
  "LibraryPodcastEpisode",
  "LibraryPodcastSeries",
  "LibrarySnippet",
  "LibraryTrack"
] as const;

export const buildCatalogCacheTruncateSql = () =>
  `TRUNCATE TABLE ${CATALOG_CACHE_TABLES.map((table) => `"${table}"`).join(", ")} RESTART IDENTITY CASCADE`;

type CatalogSnapshot = {
  tracks: Track[];
  snippets: Snippet[];
  podcasts: PodcastSeries[];
  scanState: {
    status: string;
    completedAt?: Date | null;
    itemCount?: number | null;
  } | null;
};

const chunkArray = <T>(items: T[], size: number) => {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
};

const sortTracks = (tracks: Track[]) =>
  tracks.sort((a, b) => {
    const artistDiff = a.artist.localeCompare(b.artist);
    if (artistDiff !== 0) return artistDiff;
    const albumDiff = (a.album ?? "").localeCompare(b.album ?? "");
    if (albumDiff !== 0) return albumDiff;
    return a.title.localeCompare(b.title);
  });

const sortSnippets = (snippets: Snippet[]) => snippets.sort((a, b) => a.label.localeCompare(b.label));

const sortEpisodes = (episodes: PodcastEpisode[]) =>
  episodes.sort((a, b) => {
    const seasonDiff = (a.seasonNumber ?? 1) - (b.seasonNumber ?? 1);
    if (seasonDiff !== 0) return seasonDiff;
    const episodeDiff = (a.episodeNumber ?? 0) - (b.episodeNumber ?? 0);
    if (episodeDiff !== 0) return episodeDiff;
    return a.relativePath.localeCompare(b.relativePath);
  });

const sortPodcastSeries = (seriesList: PodcastSeries[]) =>
  seriesList.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

const toSafeNumber = (value?: bigint | null) => {
  if (typeof value !== "bigint") return undefined;
  const asNumber = Number(value);
  return Number.isFinite(asNumber) ? asNumber : undefined;
};

const normalizeOptionalArray = (value: string[]) => (value.length > 0 ? value : undefined);

const trackToRow = (track: Track, scanToken: string) => {
  const now = new Date();
  return {
    id: track.id,
    path: track.path,
    relativePath: track.relativePath ?? null,
    sourceKind: track.sourceKind ?? "music",
    title: track.title,
    artist: track.artist,
    album: track.album ?? null,
    albumArtUrl: track.albumArtUrl ?? null,
    hasArtwork: Boolean(track.hasArtwork),
    year: track.year ?? null,
    genres: track.genres ?? [],
    duration: track.duration ?? null,
    bpm: track.bpm ?? null,
    energy: track.energy,
    moodTags: track.moodTags ?? [],
    format: track.format ?? null,
    sampleRate: track.sampleRate ?? null,
    bitsPerSample: track.bitsPerSample ?? null,
    bitrate: track.bitrate ?? null,
    lossless: typeof track.lossless === "boolean" ? track.lossless : null,
    scanToken,
    lastSeenAt: now,
    updatedAt: now
  };
};

const snippetToRow = (snippet: Snippet, scanToken: string) => {
  const now = new Date();
  return {
    id: snippet.id,
    path: snippet.path,
    relativePath: snippet.relativePath ?? null,
    label: snippet.label,
    duration: snippet.duration ?? null,
    format: snippet.format ?? null,
    sourceKind: snippet.sourceKind ?? "dj",
    scanToken,
    lastSeenAt: now,
    updatedAt: now
  };
};

const podcastSeriesToRow = (series: PodcastSeries, scanToken: string) => {
  const indexedAt = new Date();
  return {
    id: series.id,
    slug: series.slug,
    title: series.title,
    description: series.description ?? null,
    hasArtwork: Boolean(series.hasArtwork),
    episodeCount: series.episodeCount,
    updatedAt: new Date(series.updatedAt),
    scanToken,
    indexedAt
  };
};

const podcastEpisodeToRow = (episode: PodcastEpisode, scanToken: string) => {
  const now = new Date();
  return {
    id: episode.id,
    seriesId: episode.seriesId,
    seriesTitle: episode.seriesTitle,
    title: episode.title,
    description: episode.description ?? null,
    path: episode.path,
    relativePath: episode.relativePath,
    duration: episode.duration ?? null,
    publishedAt: new Date(episode.publishedAt),
    episodeNumber: episode.episodeNumber ?? null,
    seasonNumber: episode.seasonNumber ?? null,
    hasArtwork: Boolean(episode.hasArtwork),
    fileSize: typeof episode.fileSize === "number" ? BigInt(Math.max(0, Math.round(episode.fileSize))) : null,
    format: episode.format ?? null,
    sampleRate: episode.sampleRate ?? null,
    bitsPerSample: episode.bitsPerSample ?? null,
    bitrate: episode.bitrate ?? null,
    lossless: typeof episode.lossless === "boolean" ? episode.lossless : null,
    scanToken,
    lastSeenAt: now,
    updatedAt: now
  };
};

const rowToTrack = (row: {
  id: string;
  path: string;
  relativePath: string | null;
  sourceKind: string;
  title: string;
  artist: string;
  album: string | null;
  albumArtUrl: string | null;
  hasArtwork: boolean;
  year: number | null;
  genres: string[];
  duration: number | null;
  bpm: number | null;
  energy: number;
  moodTags: string[];
  format: string | null;
  sampleRate: number | null;
  bitsPerSample: number | null;
  bitrate: number | null;
  lossless: boolean | null;
}): Track => ({
  id: row.id,
  path: row.path,
  relativePath: row.relativePath ?? undefined,
  sourceKind: row.sourceKind === "dj" ? "dj" : "music",
  title: row.title,
  artist: row.artist,
  album: row.album ?? undefined,
  albumArtUrl: row.albumArtUrl ?? undefined,
  hasArtwork: row.hasArtwork,
  year: row.year ?? undefined,
  genres: normalizeOptionalArray(row.genres),
  duration: row.duration ?? undefined,
  bpm: row.bpm ?? undefined,
  energy: row.energy,
  moodTags: row.moodTags,
  format: row.format ?? undefined,
  sampleRate: row.sampleRate ?? undefined,
  bitsPerSample: row.bitsPerSample ?? undefined,
  bitrate: row.bitrate ?? undefined,
  lossless: typeof row.lossless === "boolean" ? row.lossless : undefined
});

const rowToSnippet = (row: {
  id: string;
  path: string;
  relativePath: string | null;
  label: string;
  duration: number | null;
  format: string | null;
  sourceKind: string;
}): Snippet => ({
  id: row.id,
  path: row.path,
  relativePath: row.relativePath ?? undefined,
  label: row.label,
  duration: row.duration ?? undefined,
  format: row.format ?? undefined,
  sourceKind: "dj"
});

const rowToPodcastEpisode = (row: {
  id: string;
  seriesId: string;
  seriesTitle: string;
  title: string;
  description: string | null;
  path: string;
  relativePath: string;
  duration: number | null;
  publishedAt: Date;
  episodeNumber: number | null;
  seasonNumber: number | null;
  hasArtwork: boolean;
  fileSize: bigint | null;
  format: string | null;
  sampleRate: number | null;
  bitsPerSample: number | null;
  bitrate: number | null;
  lossless: boolean | null;
}): PodcastEpisode => ({
  id: row.id,
  seriesId: row.seriesId,
  seriesTitle: row.seriesTitle,
  title: row.title,
  description: row.description ?? undefined,
  path: row.path,
  relativePath: row.relativePath,
  duration: row.duration ?? undefined,
  publishedAt: row.publishedAt.toISOString(),
  episodeNumber: row.episodeNumber ?? undefined,
  seasonNumber: row.seasonNumber ?? undefined,
  hasArtwork: row.hasArtwork,
  fileSize: toSafeNumber(row.fileSize),
  format: row.format ?? undefined,
  sampleRate: row.sampleRate ?? undefined,
  bitsPerSample: row.bitsPerSample ?? undefined,
  bitrate: row.bitrate ?? undefined,
  lossless: typeof row.lossless === "boolean" ? row.lossless : undefined
});

export const loadLibraryCatalog = async (): Promise<CatalogSnapshot> => {
  const [trackRows, snippetRows, seriesRows, episodeRows, scanState] = await Promise.all([
    prisma.libraryTrack.findMany(),
    prisma.librarySnippet.findMany(),
    prisma.libraryPodcastSeries.findMany(),
    prisma.libraryPodcastEpisode.findMany(),
    prisma.libraryScanState.findUnique({ where: { scope: CATALOG_SCOPE } })
  ]);

  const episodesBySeries = new Map<string, PodcastEpisode[]>();
  for (const row of episodeRows) {
    const existing = episodesBySeries.get(row.seriesId) ?? [];
    existing.push(rowToPodcastEpisode(row));
    episodesBySeries.set(row.seriesId, existing);
  }

  const podcasts = sortPodcastSeries(
    seriesRows.map((row) => {
      const episodes = sortEpisodes(episodesBySeries.get(row.id) ?? []);
      return {
        id: row.id,
        slug: row.slug,
        title: row.title,
        description: row.description ?? undefined,
        hasArtwork: row.hasArtwork,
        episodeCount: episodes.length,
        updatedAt: row.updatedAt.toISOString(),
        episodes
      };
    })
  );

  return {
    tracks: sortTracks(trackRows.map(rowToTrack)),
    snippets: sortSnippets(snippetRows.map(rowToSnippet)),
    podcasts,
    scanState: scanState
      ? {
          status: scanState.status,
          completedAt: scanState.completedAt,
          itemCount: scanState.itemCount
        }
      : null
  };
};

const writeChunked = async <T>(items: T[], writer: (chunk: T[]) => Promise<unknown>) => {
  for (const chunk of chunkArray(items, WRITE_CHUNK_SIZE)) {
    await writer(chunk);
  }
};

export const persistLibraryCatalog = async (
  snapshot: { tracks: Track[]; snippets: Snippet[]; podcasts: PodcastSeries[] },
  options: { mode: "quick" | "full" }
) => {
  const scanToken = `${options.mode}:${Date.now()}`;
  const startedAt = new Date();
  const episodeRows = snapshot.podcasts.flatMap((series) =>
    series.episodes.map((episode) => podcastEpisodeToRow(episode, scanToken))
  );
  const totalItems =
    snapshot.tracks.length +
    snapshot.snippets.length +
    snapshot.podcasts.length +
    episodeRows.length;

  await prisma.libraryScanState.upsert({
    where: { scope: CATALOG_SCOPE },
    update: {
      status: `${options.mode}-running`,
      activeToken: scanToken,
      pendingToken: null,
      startedAt,
      error: null
    },
    create: {
      scope: CATALOG_SCOPE,
      status: `${options.mode}-running`,
      activeToken: scanToken,
      startedAt
    }
  });

  try {
    await prisma.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe(buildCatalogCacheTruncateSql());

        await writeChunked(
          snapshot.tracks.map((track) => trackToRow(track, scanToken)),
          async (chunk) => {
            if (chunk.length === 0) return;
            await tx.libraryTrack.createMany({ data: chunk });
          }
        );

        await writeChunked(
          snapshot.snippets.map((snippet) => snippetToRow(snippet, scanToken)),
          async (chunk) => {
            if (chunk.length === 0) return;
            await tx.librarySnippet.createMany({ data: chunk });
          }
        );

        await writeChunked(
          snapshot.podcasts.map((series) => podcastSeriesToRow(series, scanToken)),
          async (chunk) => {
            if (chunk.length === 0) return;
            await tx.libraryPodcastSeries.createMany({ data: chunk });
          }
        );

        await writeChunked(episodeRows, async (chunk) => {
          if (chunk.length === 0) return;
          await tx.libraryPodcastEpisode.createMany({ data: chunk });
        });

        await tx.libraryScanState.upsert({
          where: { scope: CATALOG_SCOPE },
          update: {
            status: options.mode === "full" ? "ready" : "quick-ready",
            activeToken: scanToken,
            pendingToken: null,
            completedAt: new Date(),
            itemCount: totalItems,
            error: null
          },
          create: {
            scope: CATALOG_SCOPE,
            status: options.mode === "full" ? "ready" : "quick-ready",
            activeToken: scanToken,
            completedAt: new Date(),
            itemCount: totalItems
          }
        });
      },
      {
        maxWait: 10_000,
        timeout: 120_000
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : "catalog_persist_failed";
    logger.error({ error, mode: options.mode }, "Failed to persist library catalog");
    await prisma.libraryScanState.upsert({
      where: { scope: CATALOG_SCOPE },
      update: {
        status: `${options.mode}-error`,
        activeToken: scanToken,
        pendingToken: null,
        completedAt: new Date(),
        itemCount: totalItems,
        error: message
      },
      create: {
        scope: CATALOG_SCOPE,
        status: `${options.mode}-error`,
        activeToken: scanToken,
        completedAt: new Date(),
        itemCount: totalItems,
        error: message
      }
    });
    throw error;
  }
};
