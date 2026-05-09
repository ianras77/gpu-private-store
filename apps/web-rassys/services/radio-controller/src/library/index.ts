import { createHash } from "crypto";
import type { Dirent } from "fs";
import { promises as fs } from "fs";
import * as musicMetadata from "music-metadata";
import path from "path";
import { LibraryProfile, PhotoMedia, PodcastEpisode, PodcastSeries, Snippet, Track } from "./types";

export { scanPhotos, scanPhotosQuick, isBrowserSafeImage } from "./photos";

const AUDIO_EXTENSIONS = ["mp3", "flac", "wav", "m4a", "m4b", "aac", "ogg"];
const AUDIO_EXTENSION_SET = new Set(AUDIO_EXTENSIONS.map((extension) => `.${extension}`));
const ARTWORK_CANDIDATES = [
  "cover.jpg",
  "cover.jpeg",
  "cover.png",
  "cover.webp",
  "folder.jpg",
  "folder.jpeg",
  "folder.png",
  "folder.webp",
  "front.jpg",
  "front.jpeg",
  "front.png",
  "front.webp"
] as const;
const SELF_SNIPPET_PATTERN = /(^|[\/\s._-])self([\/\s._-]|$)/i;

const normalizeText = (value: string | undefined | null, fallback: string) => {
  if (!value) return fallback;
  const cleaned = value.toString().trim();
  return cleaned.length > 0 ? cleaned : fallback;
};

const normalizeOptionalText = (value: string | undefined | null) => {
  const cleaned = value?.toString().trim();
  return cleaned && cleaned.length > 0 ? cleaned : undefined;
};

const collapseWhitespace = (value: string | undefined | null) =>
  normalizeOptionalText((value ?? "").replace(/\s+/g, " ").trim());

const splitDisplayLines = (value: string | undefined | null) =>
  (value ?? "")
    .split(/\r?\n+/)
    .map((line) => collapseWhitespace(line))
    .filter((line): line is string => Boolean(line));

const pickPrimaryDisplayLine = (value: string | undefined | null) =>
  splitDisplayLines(value)[0];

const PODCAST_TIMESTAMP_PATTERN =
  /\b[A-Z][a-z]{2}\s+\d{1,2},\s+\d{4}\s+at\s+\d{1,2}:\d{2}(?:\s*[AP]M)?\b/;

const humanizeMediaLabel = (value: string | undefined | null) =>
  collapseWhitespace(
    (pickPrimaryDisplayLine(value) ?? value ?? "")
      .replace(/[_-]+/g, " ")
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
  );

export const normalizePodcastSeriesTitle = (value: string | undefined | null) => {
  const humanized = humanizeMediaLabel(value);
  if (!humanized) return "Real Life Bedtime Stories";
  return humanized.replace(/^book\s+/i, "").trim() || humanized;
};

const trimSentenceEnding = (value: string) => value.replace(/[.!?\s]+$/g, "");

export const buildPodcastSeriesFallbackDescription = (seriesTitle: string) =>
  `Chapters from ${seriesTitle}, kept together on the bedtime shelf.`;

export const buildPodcastEpisodeFallbackDescription = (
  seriesTitle: string,
  episodeTitle?: string | undefined | null
) => {
  const cleanedEpisodeTitle = collapseWhitespace(episodeTitle);
  if (!cleanedEpisodeTitle) return `A recorded chapter from ${seriesTitle}.`;
  return `A recorded chapter from ${seriesTitle}: ${trimSentenceEnding(cleanedEpisodeTitle)}.`;
};

export const normalizePodcastEpisodeTitle = (
  value: string | undefined | null,
  fallback?: string | undefined | null
) => {
  const candidates = [value, fallback]
    .flatMap((entry) => splitDisplayLines(entry))
    .filter(Boolean);
  const timestampCandidate = candidates
    .map((candidate) => candidate.match(PODCAST_TIMESTAMP_PATTERN)?.[0])
    .find(Boolean);
  const primary = timestampCandidate ?? candidates[0];
  const humanized = humanizeMediaLabel(primary);
  return humanized ?? collapseWhitespace(primary) ?? "Untitled Chapter";
};

export const normalizePodcastSeriesDescription = (
  value: string | undefined | null,
  seriesTitle: string
) => {
  const cleaned = collapseWhitespace(value);
  if (!cleaned) return buildPodcastSeriesFallbackDescription(seriesTitle);

  if (
    normalizeMatchText(cleaned) ===
    normalizeMatchText(buildPodcastEpisodeFallbackDescription(seriesTitle))
  ) {
    return buildPodcastSeriesFallbackDescription(seriesTitle);
  }

  const matched = cleaned.match(/^(.+?)\s+episode:\s+(.+)$/i);
  if (matched) {
    const rawSeriesTitle = normalizePodcastSeriesTitle(matched[1]);
    if (normalizeMatchText(rawSeriesTitle) === normalizeMatchText(seriesTitle)) {
      return buildPodcastSeriesFallbackDescription(seriesTitle);
    }
  }

  if (splitDisplayLines(value).length > 1) {
    return buildPodcastSeriesFallbackDescription(seriesTitle);
  }

  return cleaned;
};

export const normalizePodcastEpisodeDescription = (
  value: string | undefined | null,
  seriesTitle: string,
  episodeTitle?: string | undefined | null
) => {
  const cleaned = collapseWhitespace(value);
  if (!cleaned) return buildPodcastEpisodeFallbackDescription(seriesTitle, episodeTitle);

  const matched = cleaned.match(/^(.+?)\s+episode:\s+(.+)$/i);
  if (matched) {
    const rawSeriesTitle = normalizePodcastSeriesTitle(matched[1]);
    if (normalizeMatchText(rawSeriesTitle) === normalizeMatchText(seriesTitle)) {
      const matchedEpisodeTitle = normalizePodcastEpisodeTitle(matched[2], episodeTitle);
      return buildPodcastEpisodeFallbackDescription(seriesTitle, matchedEpisodeTitle);
    }
  }

  if (splitDisplayLines(value).length > 1) {
    return buildPodcastEpisodeFallbackDescription(seriesTitle, episodeTitle);
  }

  return cleaned;
};

const normalizeMatchText = (value: string | undefined | null) =>
  (value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const stripTitleEditions = (value: string | undefined | null) =>
  (value ?? "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\[[^\]]*]/g, " ")
    .replace(
      /\b(remaster(?:ed)?|version|edit|mix|mono|stereo|explicit|clean|deluxe|bonus track|live)\b/gi,
      " "
    )
    .replace(/\s+/g, " ")
    .trim();

const splitArtistVariants = (value: string | undefined | null) =>
  (value ?? "")
    .split(/\b(?:feat\.?|featuring|ft\.?|with|vs\.?| x )\b|,|&|\/|;/gi)
    .map((part) => part.trim())
    .filter(Boolean);

const buildTitleVariants = (value: string | undefined | null) => {
  const variants = new Set<string>();
  const normalized = normalizeMatchText(value);
  const stripped = normalizeMatchText(stripTitleEditions(value));
  if (normalized) variants.add(normalized);
  if (stripped) variants.add(stripped);
  return variants;
};

const buildArtistVariants = (value: string | undefined | null) => {
  const variants = new Set<string>();
  const normalized = normalizeMatchText(value);
  if (normalized) {
    variants.add(normalized);
    variants.add(normalized.replace(/^the\s+/, ""));
  }
  for (const part of splitArtistVariants(value)) {
    const normalizedPart = normalizeMatchText(part);
    if (!normalizedPart) continue;
    variants.add(normalizedPart);
    variants.add(normalizedPart.replace(/^the\s+/, ""));
  }
  variants.delete("");
  return variants;
};

const variantsMatch = (left: Set<string>, right: Set<string>, options: { allowContains?: boolean } = {}) => {
  for (const leftVariant of left) {
    for (const rightVariant of right) {
      if (!leftVariant || !rightVariant) continue;
      if (leftVariant === rightVariant) return true;
      if (
        options.allowContains &&
        leftVariant.length >= 6 &&
        rightVariant.length >= 6 &&
        (leftVariant.includes(rightVariant) || rightVariant.includes(leftVariant))
      ) {
        return true;
      }
    }
  }
  return false;
};

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

const sortTracks = (tracks: Track[]) =>
  tracks.sort((a, b) => {
    const artistDiff = a.artist.localeCompare(b.artist);
    if (artistDiff !== 0) return artistDiff;
    const albumDiff = (a.album ?? "").localeCompare(b.album ?? "");
    if (albumDiff !== 0) return albumDiff;
    return a.title.localeCompare(b.title);
  });

const sortSnippets = (snippets: Snippet[]) => snippets.sort((a, b) => a.label.localeCompare(b.label));

const sortPodcastSeries = (seriesList: PodcastSeries[]) =>
  seriesList.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

const preferDefined = <T>(preferred: T | undefined, fallback: T | undefined) =>
  preferred !== undefined ? preferred : fallback;

const isHighResTrack = (track: Pick<Track, "sampleRate" | "bitsPerSample" | "lossless">) =>
  Boolean(track.lossless) &&
  ((track.bitsPerSample ?? 0) > 16 || (track.sampleRate ?? 0) > 48000);

const sortedCounts = (entries: Map<string, number>, limit: number) =>
  Array.from(entries.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.name.localeCompare(b.name);
    })
    .slice(0, limit);

const normalizeFormat = (value?: string) => value?.trim().toUpperCase();

const bucketDuration = (duration?: number) => {
  if (!duration || duration <= 0) return "unknown";
  if (duration < 15) return "short";
  if (duration < 60) return "medium";
  return "long";
};

const buildLibraryProfile = (
  tracks: Track[],
  snippets: Snippet[],
  podcasts: PodcastSeries[]
): LibraryProfile => {
  const artistCounts = new Map<string, number>();
  const genreCounts = new Map<string, number>();
  const decadeCounts = new Map<string, number>();
  const snippetFormatCounts = new Map<string, number>();
  const podcastFormatCounts = new Map<string, number>();
  const podcastSeriesCounts = new Map<string, number>();
  const snippetDurationBuckets = {
    short: 0,
    medium: 0,
    long: 0,
    unknown: 0
  };

  for (const track of tracks) {
    const artist = track.artist.trim();
    if (artist) {
      artistCounts.set(artist, (artistCounts.get(artist) ?? 0) + 1);
    }

    for (const genre of track.genres ?? []) {
      const normalizedGenre = genre.trim();
      if (!normalizedGenre) continue;
      genreCounts.set(normalizedGenre, (genreCounts.get(normalizedGenre) ?? 0) + 1);
    }

    if (typeof track.year === "number" && Number.isFinite(track.year)) {
      const decadeStart = Math.floor(track.year / 10) * 10;
      const decadeLabel = `${decadeStart}s`;
      decadeCounts.set(decadeLabel, (decadeCounts.get(decadeLabel) ?? 0) + 1);
    }
  }

  for (const snippet of snippets) {
    const format = normalizeFormat(snippet.format);
    if (format) {
      snippetFormatCounts.set(format, (snippetFormatCounts.get(format) ?? 0) + 1);
    }

    snippetDurationBuckets[bucketDuration(snippet.duration)] += 1;
  }

  const podcastEpisodes = podcasts.flatMap((series) => series.episodes);
  for (const series of podcasts) {
    podcastSeriesCounts.set(series.title, series.episodeCount);
  }

  for (const episode of podcastEpisodes) {
    const format = normalizeFormat(episode.format);
    if (format) {
      podcastFormatCounts.set(format, (podcastFormatCounts.get(format) ?? 0) + 1);
    }
  }

  return {
    totalTracks: tracks.length,
    losslessTracks: tracks.filter((track) => track.lossless).length,
    highResTracks: tracks.filter((track) => isHighResTrack(track)).length,
    snippetCount: snippets.length,
    snippetFormats: sortedCounts(snippetFormatCounts, 6),
    snippetDurationBuckets,
    podcastSeriesCount: podcasts.length,
    podcastEpisodeCount: podcastEpisodes.length,
    podcastLosslessEpisodes: podcastEpisodes.filter((episode) => episode.lossless).length,
    podcastHighResEpisodes: podcastEpisodes.filter((episode) => isHighResTrack(episode)).length,
    topPodcastSeries: sortedCounts(podcastSeriesCounts, 6),
    podcastFormats: sortedCounts(podcastFormatCounts, 6),
    topArtists: sortedCounts(artistCounts, 8),
    topGenres: sortedCounts(genreCounts, 8),
    topDecades: sortedCounts(decadeCounts, 6)
  };
};

const toRelativePath = (root: string, file: string) =>
  path.relative(root, file).split(path.sep).join("/");

const mapWithConcurrency = async <T, TResult>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<TResult>
) => {
  if (items.length === 0) return [] as TResult[];

  const results = new Array<TResult>(items.length);
  let nextIndex = 0;
  const workerCount = Math.max(1, Math.min(concurrency, items.length));

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        const index = nextIndex;
        nextIndex += 1;
        results[index] = await worker(items[index], index);
      }
    })
  );

  return results;
};

const readCommentText = (value: unknown) => {
  if (Array.isArray(value)) {
    return normalizeOptionalText(
      value
        .map((item) => String(item).trim())
        .filter(Boolean)
        .join("\n\n")
    );
  }
  if (typeof value === "string") return normalizeOptionalText(value);
  return undefined;
};

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "series";

const assertDirectory = async (root: string) => {
  const stat = await fs.stat(root);
  if (!stat.isDirectory()) {
    throw new Error(`not_a_directory:${root}`);
  }
};

const isAudioFile = (filepath: string) =>
  AUDIO_EXTENSION_SET.has(path.extname(filepath).toLowerCase());

const collectAudioFiles = async (
  root: string,
  options: { followSymbolicDirectories?: boolean } = {}
) => {
  await assertDirectory(root);

  const files: string[] = [];
  const seenFiles = new Set<string>();
  const seenDirectories = new Set<string>();
  const pendingDirectories = [root];

  while (pendingDirectories.length > 0) {
    const currentDirectory = pendingDirectories.pop();
    if (!currentDirectory) continue;

    let resolvedDirectory: string;
    try {
      resolvedDirectory = await fs.realpath(currentDirectory);
    } catch {
      // Broken links or disappearing mounts should not fail the whole scan.
      continue;
    }

    if (seenDirectories.has(resolvedDirectory)) continue;
    seenDirectories.add(resolvedDirectory);

    let entries: Dirent<string>[];
    try {
      entries = await fs.readdir(currentDirectory, { encoding: "utf8", withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;

      const fullPath = path.join(currentDirectory, entry.name);
      if (entry.isDirectory()) {
        pendingDirectories.push(fullPath);
        continue;
      }

      if (entry.isFile()) {
        if (!isAudioFile(fullPath) || seenFiles.has(fullPath)) continue;
        seenFiles.add(fullPath);
        files.push(fullPath);
        continue;
      }

      if (!entry.isSymbolicLink()) continue;

      let targetStat: Awaited<ReturnType<typeof fs.stat>>;
      try {
        targetStat = await fs.stat(fullPath);
      } catch {
        // Skip broken symlinks quietly so one bad link does not poison the scan.
        continue;
      }

      if (targetStat.isDirectory()) {
        if (options.followSymbolicDirectories) {
          pendingDirectories.push(fullPath);
        }
        continue;
      }

      if (!targetStat.isFile() || !isAudioFile(fullPath) || seenFiles.has(fullPath)) continue;
      seenFiles.add(fullPath);
      files.push(fullPath);
    }
  }

  return files.sort((a, b) => a.localeCompare(b));
};

const parseEpisodeNumber = (file: string, metadata: any) => {
  const fromTag = metadata?.common?.track?.no;
  if (typeof fromTag === "number" && Number.isFinite(fromTag)) return fromTag;

  const basename = path.basename(file, path.extname(file));
  const match = basename.match(/^(\d{1,3})[\s._-]+/);
  if (match) return Number(match[1]);
  return undefined;
};

const parseSeasonNumber = (metadata: any) => {
  const fromDisk = metadata?.common?.disk?.no;
  if (typeof fromDisk === "number" && Number.isFinite(fromDisk)) return fromDisk;
  return 1;
};

const inferTrackName = (file: string) => {
  const basename = path.basename(file, path.extname(file)).trim();
  const fromDash = basename.match(/^(.+?)\s+-\s+(.+)$/);
  if (fromDash) {
    return {
      artist: normalizeText(fromDash[1], "Unknown Artist"),
      title: normalizeText(fromDash[2], basename)
    };
  }

  const parent = path.basename(path.dirname(file)).trim();
  return {
    artist: normalizeOptionalText(parent) ?? "Unknown Artist",
    title: basename || "Unknown Track"
  };
};

const parsePublishedAt = (metadata: any, fallbackTimeMs: number) => {
  const raw =
    metadata?.common?.date ??
    metadata?.common?.originaldate ??
    metadata?.common?.releasedate ??
    metadata?.common?.year;

  if (typeof raw === "string") {
    const parsed = new Date(raw);
    if (Number.isFinite(parsed.getTime())) return parsed.toISOString();
  }

  if (typeof raw === "number" && Number.isFinite(raw)) {
    const parsed = new Date(Date.UTC(raw, 0, 1, 0, 0, 0));
    if (Number.isFinite(parsed.getTime())) return parsed.toISOString();
  }

  return new Date(fallbackTimeMs).toISOString();
};

const parseAudioDetails = async (file: string) => {
  const metadata = await (musicMetadata as any).parseFile(file);
  const title = normalizeText(metadata.common.title, path.basename(file, path.extname(file)));
  const artist = normalizeText(metadata.common.artist, "Unknown Artist");
  const album = normalizeOptionalText(metadata.common.album);
  const year = typeof metadata.common.year === "number" ? metadata.common.year : undefined;
  const genres = Array.isArray(metadata.common.genre)
    ? metadata.common.genre
        .map((value: string) => value.trim())
        .filter((value: string) => value.length > 0)
    : undefined;
  const duration = metadata.format.duration ? Math.round(metadata.format.duration) : undefined;
  const bpmTag = metadata.common.bpm ?? metadata.common.TBPM;
  const bpm = typeof bpmTag === "number" ? bpmTag : undefined;
  const energySeed = bpm ? Math.min(1, Math.max(0, (bpm - 60) / 120)) : seeded(file);
  const hasArtwork =
    Array.isArray(metadata.common.picture) && metadata.common.picture.length > 0 ? true : false;

  return {
    metadata,
    title,
    artist,
    album,
    year,
    genres,
    duration,
    bpm,
    energySeed,
    hasArtwork,
    format: normalizeOptionalText(metadata.format.container ?? metadata.format.codec),
    sampleRate:
      typeof metadata.format.sampleRate === "number" ? metadata.format.sampleRate : undefined,
    bitsPerSample:
      typeof metadata.format.bitsPerSample === "number" ? metadata.format.bitsPerSample : undefined,
    bitrate: typeof metadata.format.bitrate === "number" ? metadata.format.bitrate : undefined,
    lossless: typeof metadata.format.lossless === "boolean" ? metadata.format.lossless : undefined
  };
};

const buildFallbackTrack = (
  file: string,
  musicPath: string,
  options: { sourceKind?: "music" | "dj" } = {}
): Track => {
  const inferred = inferTrackName(file);
  const energy = seeded(file);
  return {
    id: hashId(file),
    path: file,
    title: inferred.title,
    artist: inferred.artist,
    energy,
    moodTags: moodFromEnergy(energy),
    relativePath: toRelativePath(musicPath, file),
    sourceKind: options.sourceKind ?? "music",
    format: path.extname(file).slice(1).toUpperCase()
  };
};

const buildFallbackSnippet = (file: string, snippetsPath: string): Snippet => ({
  id: hashId(file),
  path: file,
  label: path.basename(file, path.extname(file)),
  relativePath: toRelativePath(snippetsPath, file),
  format: path.extname(file).slice(1).toUpperCase(),
  tags: buildSnippetTags(file, snippetsPath),
  sourceKind: "dj"
});

const buildSnippetTags = (file: string, snippetsPath: string) => {
  const relativePath = toRelativePath(snippetsPath, file);
  const fingerprint = `${relativePath} ${path.basename(file, path.extname(file))}`;
  const tags: string[] = [];

  if (SELF_SNIPPET_PATTERN.test(fingerprint)) {
    tags.push("self");
  }

  return tags;
};

const buildFallbackEpisode = async (
  file: string,
  podcastsPath: string
): Promise<{ seriesId: string; seriesTitle: string; episode: PodcastEpisode }> => {
  const relativePath = toRelativePath(podcastsPath, file);
  const [seriesFolder] = relativePath.split("/");
  const seriesTitle = normalizePodcastSeriesTitle(seriesFolder);
  const seriesId = hashId(path.join(podcastsPath, seriesFolder || seriesTitle));
  const stat = await fs.stat(file);
  const title = normalizePodcastEpisodeTitle(path.basename(file, path.extname(file)));

  return {
    seriesId,
    seriesTitle,
    episode: {
      id: hashId(file),
      seriesId,
      seriesTitle,
      title,
      description: buildPodcastEpisodeFallbackDescription(seriesTitle, title),
      path: file,
      relativePath,
      publishedAt: new Date(stat.mtimeMs).toISOString(),
      seasonNumber: 1,
      fileSize: stat.size,
      format: path.extname(file).slice(1).toUpperCase()
    }
  };
};

export const findNearbyArtworkPath = async (file: string) => {
  const dir = path.dirname(file);
  for (const candidate of ARTWORK_CANDIDATES) {
    const fullPath = path.join(dir, candidate);
    try {
      const stat = await fs.stat(fullPath);
      if (stat.isFile()) return fullPath;
    } catch {
      // keep looking
    }
  }
  return null;
};

export const readArtwork = async (
  file: string
): Promise<{ type: "embedded"; data: Buffer; format?: string } | { type: "file"; path: string } | null> => {
  try {
    const metadata = await (musicMetadata as any).parseFile(file);
    const picture = Array.isArray(metadata.common.picture) ? metadata.common.picture[0] : null;
    if (picture?.data) {
      return {
        type: "embedded",
        data: picture.data as Buffer,
        format: picture.format
      };
    }
  } catch {
    // fall back to nearby artwork
  }

  const nearby = await findNearbyArtworkPath(file);
  if (nearby) {
    return {
      type: "file",
      path: nearby
    };
  }

  return null;
};

export const scanLibrary = async (
  musicPath: string,
  options: { sourceKind?: "music" | "dj" } = {}
) => {
  const files = await collectAudioFiles(musicPath, { followSymbolicDirectories: true });
  const tracks = await mapWithConcurrency(files, 6, async (file) => {
    try {
      const details = await parseAudioDetails(file);
      const track: Track = {
        id: hashId(file),
        path: file,
        title: details.title,
        artist: details.artist,
        album: details.album,
        hasArtwork: details.hasArtwork || Boolean(await findNearbyArtworkPath(file)),
        year: details.year,
        genres: details.genres,
        duration: details.duration,
        bpm: details.bpm,
        energy: details.energySeed,
        moodTags: moodFromEnergy(details.energySeed),
        relativePath: toRelativePath(musicPath, file),
        sourceKind: options.sourceKind ?? "music",
        format: details.format,
        sampleRate: details.sampleRate,
        bitsPerSample: details.bitsPerSample,
        bitrate: details.bitrate,
        lossless: details.lossless
      };
      return track;
    } catch {
      return buildFallbackTrack(file, musicPath, options);
    }
  });

  return sortTracks(tracks);
};

export const scanSnippets = async (snippetsPath: string) => {
  const files = await collectAudioFiles(snippetsPath);
  const snippets = await mapWithConcurrency(files, 6, async (file) => {
    const relativePath = toRelativePath(snippetsPath, file);
    const tags = buildSnippetTags(file, snippetsPath);

    try {
      const details = await parseAudioDetails(file);
      return {
        id: hashId(file),
        path: file,
        label: details.title,
        relativePath,
        duration: details.duration,
        format: details.format,
        tags,
        sourceKind: "dj" as const
      };
    } catch {
      return buildFallbackSnippet(file, snippetsPath);
    }
  });

  return sortSnippets(snippets);
};

export const scanPodcasts = async (podcastsPath: string) => {
  const files = await collectAudioFiles(podcastsPath);

  const seriesMap = new Map<
    string,
    {
      id: string;
      slug: string;
      title: string;
      description?: string;
      hasArtwork: boolean;
      updatedAtMs: number;
      episodes: PodcastEpisode[];
    }
  >();

  const scanResults = await mapWithConcurrency(files, 4, async (file) => {
    const relativePath = toRelativePath(podcastsPath, file);
    const [seriesFolder] = relativePath.split("/");
    const seriesTitle = normalizePodcastSeriesTitle(seriesFolder);
    const seriesKey = seriesFolder || seriesTitle;
    const seriesId = hashId(path.join(podcastsPath, seriesKey));

    try {
      const [details, stat, nearbyArtwork] = await Promise.all([
        parseAudioDetails(file),
        fs.stat(file),
        findNearbyArtworkPath(file)
      ]);
      const publishedAt = parsePublishedAt(details.metadata, stat.mtimeMs);
      const episodeTitle = normalizePodcastEpisodeTitle(
        details.title,
        path.basename(file, path.extname(file))
      );
      const description = normalizePodcastEpisodeDescription(
        readCommentText(details.metadata.common.comment),
        seriesTitle,
        episodeTitle
      );
      return {
        seriesId,
        seriesTitle,
        slug: slugify(seriesTitle),
        seriesDescription: buildPodcastSeriesFallbackDescription(seriesTitle),
        updatedAtMs: new Date(publishedAt).getTime(),
        episode: {
        id: hashId(file),
        seriesId,
        seriesTitle,
        title: episodeTitle,
        description,
        path: file,
        relativePath,
        duration: details.duration,
        publishedAt,
        episodeNumber: parseEpisodeNumber(file, details.metadata),
        seasonNumber: parseSeasonNumber(details.metadata),
        hasArtwork: details.hasArtwork || Boolean(nearbyArtwork),
        fileSize: stat.size,
        format: details.format,
        sampleRate: details.sampleRate,
        bitsPerSample: details.bitsPerSample,
        bitrate: details.bitrate,
        lossless: details.lossless
        }
      };
    } catch {
      try {
        const fallback = await buildFallbackEpisode(file, podcastsPath);
        return {
          seriesId: fallback.seriesId,
          seriesTitle: fallback.seriesTitle,
          slug: slugify(fallback.seriesTitle),
          seriesDescription: buildPodcastSeriesFallbackDescription(fallback.seriesTitle),
          updatedAtMs: new Date(fallback.episode.publishedAt).getTime(),
          episode: fallback.episode
        };
      } catch {
        // Skip files that disappear or become unreadable while a scan is in progress.
        return null;
      }
    }
  });

  for (const result of scanResults) {
    if (!result) continue;

    const existing =
      seriesMap.get(result.seriesId) ??
      {
        id: result.seriesId,
        slug: result.slug,
        title: result.seriesTitle,
        description: undefined,
        hasArtwork: false,
        updatedAtMs: 0,
        episodes: []
      };

    existing.episodes.push(result.episode);
    existing.hasArtwork = existing.hasArtwork || result.episode.hasArtwork || false;
    existing.updatedAtMs = Math.max(existing.updatedAtMs, result.updatedAtMs);
    if (!existing.description && result.seriesDescription) {
      existing.description = result.seriesDescription;
    }

    seriesMap.set(result.seriesId, existing);
  }

  const seriesList: PodcastSeries[] = Array.from(seriesMap.values())
    .map((series) => {
      const episodes = series.episodes.sort((a, b) => {
        const seasonDiff = (a.seasonNumber ?? 1) - (b.seasonNumber ?? 1);
        if (seasonDiff !== 0) return seasonDiff;
        const episodeDiff = (a.episodeNumber ?? 0) - (b.episodeNumber ?? 0);
        if (episodeDiff !== 0) return episodeDiff;
        return a.relativePath.localeCompare(b.relativePath);
      });

      return {
        id: series.id,
        slug: series.slug,
        title: series.title,
        description: series.description,
        hasArtwork: series.hasArtwork,
        episodeCount: episodes.length,
        updatedAt: new Date(series.updatedAtMs || Date.now()).toISOString(),
        episodes
      };
    });

  return sortPodcastSeries(seriesList);
};

export const scanLibraryQuick = async (
  musicPath: string,
  options: { sourceKind?: "music" | "dj" } = {}
) => {
  const files = await collectAudioFiles(musicPath, { followSymbolicDirectories: true });
  return sortTracks(files.map((file) => buildFallbackTrack(file, musicPath, options)));
};

export const scanSnippetsQuick = async (snippetsPath: string) => {
  const files = await collectAudioFiles(snippetsPath);
  return sortSnippets(files.map((file) => buildFallbackSnippet(file, snippetsPath)));
};

export const scanPodcastsQuick = async (podcastsPath: string) => {
  const files = await collectAudioFiles(podcastsPath);
  const seriesMap = new Map<
    string,
    {
      id: string;
      slug: string;
      title: string;
      description?: string;
      hasArtwork: boolean;
      updatedAtMs: number;
      episodes: PodcastEpisode[];
    }
  >();

  const fallbackEpisodes = await mapWithConcurrency(files, 6, async (file) => {
    try {
      return await buildFallbackEpisode(file, podcastsPath);
    } catch {
      return null;
    }
  });

  for (const fallback of fallbackEpisodes) {
    if (!fallback) continue;

    const existing =
      seriesMap.get(fallback.seriesId) ??
      {
        id: fallback.seriesId,
        slug: slugify(fallback.seriesTitle),
        title: fallback.seriesTitle,
        description: undefined,
        hasArtwork: false,
        updatedAtMs: 0,
        episodes: []
      };

    existing.episodes.push(fallback.episode);
    existing.updatedAtMs = Math.max(
      existing.updatedAtMs,
      new Date(fallback.episode.publishedAt).getTime()
    );
    if (!existing.description) {
      existing.description = buildPodcastSeriesFallbackDescription(fallback.seriesTitle);
    }
    seriesMap.set(fallback.seriesId, existing);
  }

  return sortPodcastSeries(
    Array.from(seriesMap.values()).map((series) => ({
      id: series.id,
      slug: series.slug,
      title: series.title,
      description: series.description,
      hasArtwork: series.hasArtwork,
      episodeCount: series.episodes.length,
      updatedAt: new Date(series.updatedAtMs || Date.now()).toISOString(),
      episodes: series.episodes.sort((a, b) => a.relativePath.localeCompare(b.relativePath))
    }))
  );
};

export const mergeQuickTracks = (previousTracks: Track[], nextTracks: Track[]) => {
  const previousById = new Map(previousTracks.map((track) => [track.id, track]));
  return nextTracks.map((track) => {
    const previous = previousById.get(track.id);
    if (!previous) return track;

    return {
      ...track,
      title: previous.title || track.title,
      artist: previous.artist || track.artist,
      album: preferDefined(previous.album, track.album),
      albumArtUrl: preferDefined(previous.albumArtUrl, track.albumArtUrl),
      hasArtwork: preferDefined(previous.hasArtwork, track.hasArtwork),
      year: preferDefined(previous.year, track.year),
      genres: preferDefined(previous.genres, track.genres),
      duration: preferDefined(previous.duration, track.duration),
      bpm: preferDefined(previous.bpm, track.bpm),
      energy: previous.energy,
      moodTags: previous.moodTags?.length ? previous.moodTags : track.moodTags,
      relativePath: preferDefined(track.relativePath, previous.relativePath),
      sourceKind: preferDefined(track.sourceKind, previous.sourceKind),
      format: preferDefined(previous.format, track.format),
      sampleRate: preferDefined(previous.sampleRate, track.sampleRate),
      bitsPerSample: preferDefined(previous.bitsPerSample, track.bitsPerSample),
      bitrate: preferDefined(previous.bitrate, track.bitrate),
      lossless: preferDefined(previous.lossless, track.lossless)
    };
  });
};

export const mergeQuickSnippets = (previousSnippets: Snippet[], nextSnippets: Snippet[]) => {
  const previousById = new Map(previousSnippets.map((snippet) => [snippet.id, snippet]));
  return nextSnippets.map((snippet) => {
    const previous = previousById.get(snippet.id);
    if (!previous) return snippet;

    return {
      ...snippet,
      label: previous.label || snippet.label,
      relativePath: preferDefined(snippet.relativePath, previous.relativePath),
      duration: preferDefined(previous.duration, snippet.duration),
      format: preferDefined(previous.format, snippet.format),
      tags: previous.tags?.length ? previous.tags : snippet.tags,
      sourceKind: preferDefined(snippet.sourceKind, previous.sourceKind)
    };
  });
};

const mergeQuickEpisode = (previous: PodcastEpisode | undefined, episode: PodcastEpisode) => {
  if (!previous) return episode;

  return {
    ...episode,
    title: episode.title || previous.title,
    description: episode.description || previous.description,
    duration: preferDefined(previous.duration, episode.duration),
    publishedAt: episode.publishedAt || previous.publishedAt,
    episodeNumber: preferDefined(previous.episodeNumber, episode.episodeNumber),
    seasonNumber: preferDefined(previous.seasonNumber, episode.seasonNumber),
    hasArtwork: preferDefined(previous.hasArtwork, episode.hasArtwork),
    fileSize: preferDefined(previous.fileSize, episode.fileSize),
    format: preferDefined(previous.format, episode.format),
    sampleRate: preferDefined(previous.sampleRate, episode.sampleRate),
    bitsPerSample: preferDefined(previous.bitsPerSample, episode.bitsPerSample),
    bitrate: preferDefined(previous.bitrate, episode.bitrate),
    lossless: preferDefined(previous.lossless, episode.lossless)
  };
};

export const mergeQuickPodcasts = (
  previousPodcasts: PodcastSeries[],
  nextPodcasts: PodcastSeries[]
) => {
  const previousSeriesById = new Map(previousPodcasts.map((series) => [series.id, series]));
  const previousEpisodesById = new Map(
    previousPodcasts.flatMap((series) =>
      series.episodes.map((episode) => [episode.id, episode] as const)
    )
  );

  return nextPodcasts.map((series) => {
    const previousSeries = previousSeriesById.get(series.id);
    const episodes = series.episodes.map((episode) =>
      mergeQuickEpisode(previousEpisodesById.get(episode.id), episode)
    );

    const previousUpdatedAtMs = previousSeries
      ? new Date(previousSeries.updatedAt).getTime()
      : Number.NaN;
    const nextUpdatedAtMs = new Date(series.updatedAt).getTime();
    const updatedAtMs = Math.max(
      Number.isFinite(previousUpdatedAtMs) ? previousUpdatedAtMs : 0,
      Number.isFinite(nextUpdatedAtMs) ? nextUpdatedAtMs : 0
    );

    return {
      ...series,
      slug: series.slug || previousSeries?.slug,
      title: series.title || previousSeries?.title,
      description: series.description || previousSeries?.description,
      hasArtwork: Boolean(series.hasArtwork || previousSeries?.hasArtwork),
      episodeCount: episodes.length,
      updatedAt: new Date(updatedAtMs || Date.now()).toISOString(),
      episodes
    };
  });
};

export class LibraryStore {
  private tracks: Track[] = [];
  private snippets: Snippet[] = [];
  private podcasts: PodcastSeries[] = [];
  private photos: PhotoMedia[] = [];
  private trackMap = new Map<string, Track>();
  private episodeMap = new Map<string, PodcastEpisode>();
  private podcastSeriesMap = new Map<string, PodcastSeries>();
  private photoMap = new Map<string, PhotoMedia>();
  private profile: LibraryProfile = buildLibraryProfile([], [], []);

  setTracks(tracks: Track[]) {
    this.tracks = tracks;
    this.trackMap = new Map(tracks.map((track) => [track.id, track]));
    this.profile = buildLibraryProfile(this.tracks, this.snippets, this.podcasts);
  }

  setSnippets(snippets: Snippet[]) {
    this.snippets = snippets;
    this.profile = buildLibraryProfile(this.tracks, this.snippets, this.podcasts);
  }

  setPodcasts(podcasts: PodcastSeries[]) {
    this.podcasts = podcasts;
    this.podcastSeriesMap = new Map(podcasts.map((series) => [series.id, series]));
    this.episodeMap = new Map(
      podcasts.flatMap((series) => series.episodes.map((episode) => [episode.id, episode] as const))
    );
    this.profile = buildLibraryProfile(this.tracks, this.snippets, this.podcasts);
  }

  setPhotos(photos: PhotoMedia[]) {
    this.photos = photos;
    this.photoMap = new Map(photos.map((item) => [item.id, item]));
  }

  getTracks() {
    return this.tracks;
  }

  getSnippets() {
    return this.snippets;
  }

  getPodcasts() {
    return this.podcasts;
  }

  getPhotos() {
    return this.photos;
  }

  getProfile() {
    return this.profile;
  }

  getTrackById(id: string) {
    return this.trackMap.get(id);
  }

  getPodcastSeriesById(id: string) {
    return this.podcastSeriesMap.get(id);
  }

  getPodcastEpisodeById(id: string) {
    return this.episodeMap.get(id);
  }

  getPhotoById(id: string) {
    return this.photoMap.get(id);
  }

  findByTitleArtist(title?: string, artist?: string) {
    if (!title || !artist) return undefined;
    const titleVariants = buildTitleVariants(title);
    const artistVariants = buildArtistVariants(artist);
    if (titleVariants.size === 0 || artistVariants.size === 0) return undefined;

    return this.tracks.find((track) => {
      const trackTitleVariants = buildTitleVariants(track.title);
      const trackArtistVariants = buildArtistVariants(track.artist);

      return (
        variantsMatch(trackTitleVariants, titleVariants, { allowContains: true }) &&
        variantsMatch(trackArtistVariants, artistVariants)
      );
    });
  }
}
