export type Track = {
  id: string;
  path: string;
  title: string;
  artist: string;
  album?: string;
  albumArtUrl?: string;
  hasArtwork?: boolean;
  year?: number;
  genres?: string[];
  duration?: number;
  bpm?: number;
  energy: number;
  moodTags: string[];
  relativePath?: string;
  sourceKind?: "music" | "dj";
  format?: string;
  sampleRate?: number;
  bitsPerSample?: number;
  bitrate?: number;
  lossless?: boolean;
  rssReady?: boolean;
};

export type TrackInsight = {
  canonicalKey: string;
  trackId?: string;
  title: string;
  artist: string;
  album?: string;
  year?: number;
  summary: string;
  artistContext: string;
  trackContext: string;
  setHook: string;
  listenFor: string;
  requestTags: string[];
  sonicSignatures: string[];
  funFacts: string[];
  boothMemories: string[];
  embeddingText: string;
  confidence: number;
  playCount: number;
  refinementCount: number;
  lastPlayedAt?: string;
  lastAnalyzedAt?: string;
  source: "heuristic" | "booth" | "hybrid";
};

export type Snippet = {
  id: string;
  path: string;
  label: string;
  relativePath?: string;
  duration?: number;
  format?: string;
  tags?: string[];
  sourceKind?: "dj";
};

export type PodcastEpisode = {
  id: string;
  seriesId: string;
  seriesTitle: string;
  title: string;
  description?: string;
  path: string;
  relativePath: string;
  duration?: number;
  publishedAt: string;
  episodeNumber?: number;
  seasonNumber?: number;
  hasArtwork?: boolean;
  fileSize?: number;
  format?: string;
  sampleRate?: number;
  bitsPerSample?: number;
  bitrate?: number;
  lossless?: boolean;
};

export type PodcastSeries = {
  id: string;
  slug: string;
  title: string;
  description?: string;
  hasArtwork?: boolean;
  episodeCount: number;
  updatedAt: string;
  episodes: PodcastEpisode[];
};

export type PhotoMediaKind = "image" | "video";
export type PhotoMediaSource = "immich" | "local";

export type PhotoMedia = {
  id: string;
  path?: string;
  relativePath: string;
  title: string;
  kind: PhotoMediaKind;
  extension: string;
  mimeType: string;
  fileSize: number;
  capturedAt: string;
  updatedAt: string;
  source: PhotoMediaSource;
  sourceLabel?: string;
  collection?: string;
  description?: string;
  width?: number;
  height?: number;
  durationSeconds?: number;
  location?: string;
  camera?: string;
  remoteAssetId?: string;
  remoteAlbumId?: string;
};

export type LibraryCount = {
  name: string;
  count: number;
};

export type DurationBuckets = {
  short: number;
  medium: number;
  long: number;
  unknown: number;
};

export type LibraryProfile = {
  totalTracks: number;
  losslessTracks: number;
  highResTracks: number;
  snippetCount: number;
  snippetFormats: LibraryCount[];
  snippetDurationBuckets: DurationBuckets;
  podcastSeriesCount: number;
  podcastEpisodeCount: number;
  podcastLosslessEpisodes: number;
  podcastHighResEpisodes: number;
  topPodcastSeries: LibraryCount[];
  podcastFormats: LibraryCount[];
  topArtists: LibraryCount[];
  topGenres: LibraryCount[];
  topDecades: LibraryCount[];
};
