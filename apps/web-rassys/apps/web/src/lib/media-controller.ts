import { fetchRadio } from "./radio-api";

export type LibraryTrack = {
  id: string;
  title: string;
  artist: string;
  album?: string;
  year?: number;
  genres?: string[];
  duration?: number;
  bpm?: number;
  energy?: number;
  albumArtUrl?: string;
  streamUrl?: string;
  hasArtwork?: boolean;
  sourceKind?: "music" | "dj";
  format?: string;
  sampleRate?: number;
  bitsPerSample?: number;
  bitrate?: number;
  lossless?: boolean;
  qualityLabel?: string;
};

export type DjIdentifier = {
  id: string;
  label: string;
  duration?: number;
  format?: string;
};

export type ListeningRoomPayload = {
  items: LibraryTrack[];
  q?: string | null;
  total: number;
  offset: number;
  limit: number;
  stats?: {
    totalTracks?: number;
    losslessTracks?: number;
    highResTracks?: number;
    djIdentifiers?: number;
  };
  djIdentifiers: DjIdentifier[];
};

export type PodcastEpisode = {
  id: string;
  seriesId: string;
  seriesTitle: string;
  title: string;
  description?: string;
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
  rssReady?: boolean;
  streamUrl?: string;
  artworkUrl?: string;
  qualityLabel?: string;
};

export type PodcastSeries = {
  id: string;
  slug: string;
  title: string;
  description?: string;
  hasArtwork?: boolean;
  episodeCount: number;
  updatedAt: string;
  artworkUrl?: string;
  episodes: PodcastEpisode[];
};

export type PodcastShowPayload = {
  show: {
    title: string;
    subtitle: string;
    description: string;
  };
  series: PodcastSeries[];
  totalSeries: number;
  totalEpisodes: number;
  updatedAt: string;
};

export type PhotoItem = {
  id: string;
  title: string;
  relativePath: string;
  kind: "image" | "video";
  extension: string;
  mimeType: string;
  fileSize: number;
  capturedAt: string;
  updatedAt: string;
  source: "immich" | "local";
  sourceLabel?: string;
  collection?: string;
  description?: string;
  width?: number;
  height?: number;
  durationSeconds?: number;
  location?: string;
  camera?: string;
  fileUrl?: string;
  previewUrl?: string;
  posterUrl?: string;
};

export type PhotoSourceSummary = {
  label: string;
  total: number;
  images: number;
  videos: number;
};

export type PhotoShelfPayload = {
  items: PhotoItem[];
  total: number;
  counts: {
    images: number;
    videos: number;
  };
  sources?: {
    immich?: PhotoSourceSummary;
    local?: PhotoSourceSummary;
  };
  updatedAt: string;
};

const trimSlash = (value: string) => value.replace(/\/+$/, "");

const buildTrackStreamUrl = (trackId: string) => `/api/library/tracks/${trackId}/stream`;
const buildTrackArtworkUrl = (trackId: string) => `/api/library/tracks/${trackId}/artwork`;
const buildEpisodeStreamUrl = (episodeId: string) => `/api/podcasts/episodes/${episodeId}/stream`;
const buildEpisodeArtworkUrl = (episodeId: string) => `/api/podcasts/episodes/${episodeId}/artwork`;
const buildPhotoFileUrl = (mediaId: string) => `/api/photos/${mediaId}/file`;
const buildPhotoPreviewUrl = (mediaId: string) => `/api/photos/${mediaId}/preview`;
const buildPhotoPosterUrl = (mediaId: string) => `/api/photos/${mediaId}/poster`;
const CONTROLLER_LIBRARY_PAGE_SIZE = 200;
const MAX_LISTENING_ROOM_ITEMS = 5000;

export const formatAudioQuality = (item: {
  format?: string;
  sampleRate?: number;
  bitsPerSample?: number;
  lossless?: boolean;
}) => {
  const bits =
    typeof item.bitsPerSample === "number" && item.bitsPerSample > 0
      ? `${item.bitsPerSample}-bit`
      : null;
  const sampleRate =
    typeof item.sampleRate === "number" && item.sampleRate > 0
      ? `${(item.sampleRate / 1000).toFixed(item.sampleRate % 1000 === 0 ? 0 : 1)}kHz`
      : null;
  const format = item.format?.trim() ? item.format.trim().toUpperCase() : null;

  return [item.lossless ? "Lossless" : null, format, bits, sampleRate]
    .filter(Boolean)
    .join(" · ");
};

export const enrichTrack = (track: LibraryTrack | null | undefined): LibraryTrack | null => {
  if (!track?.id) return track ?? null;
  return {
    ...track,
    streamUrl: track.streamUrl ? trimSlash(track.streamUrl) : buildTrackStreamUrl(track.id),
    albumArtUrl:
      track.albumArtUrl || track.hasArtwork ? track.albumArtUrl || buildTrackArtworkUrl(track.id) : undefined,
    qualityLabel: formatAudioQuality(track)
  };
};

export const enrichTracks = (tracks: LibraryTrack[] | null | undefined) =>
  Array.isArray(tracks)
    ? tracks
        .map((track) => enrichTrack(track))
        .filter((track): track is LibraryTrack => Boolean(track))
    : [];

const enrichEpisode = (episode: PodcastEpisode): PodcastEpisode => ({
  ...episode,
  streamUrl: buildEpisodeStreamUrl(episode.id),
  artworkUrl: episode.hasArtwork ? buildEpisodeArtworkUrl(episode.id) : undefined,
  qualityLabel: formatAudioQuality(episode)
});

export const enrichPodcastPayload = (
  payload: PodcastShowPayload | null | undefined
): PodcastShowPayload | null => {
  if (!payload) return null;
  return {
    ...payload,
    series: Array.isArray(payload.series)
      ? payload.series.map((series) => {
          const episodes = Array.isArray(series.episodes) ? series.episodes.map(enrichEpisode) : [];
          const firstArtworkEpisode = episodes.find((episode) => episode.artworkUrl);
          return {
            ...series,
            episodes,
            artworkUrl: series.hasArtwork ? firstArtworkEpisode?.artworkUrl : undefined
          };
        })
      : []
  };
};

const enrichPhotoItem = (item: PhotoItem): PhotoItem => ({
  ...item,
  fileUrl: buildPhotoFileUrl(item.id),
  previewUrl: item.kind === "image" ? buildPhotoPreviewUrl(item.id) : buildPhotoPosterUrl(item.id),
  posterUrl: buildPhotoPosterUrl(item.id)
});

export const enrichPhotoShelf = (payload: PhotoShelfPayload | null | undefined): PhotoShelfPayload | null => {
  if (!payload) return null;
  return {
    ...payload,
    items: Array.isArray(payload.items) ? payload.items.map(enrichPhotoItem) : []
  };
};

const fetchListeningRoomPage = async (params: {
  q?: string;
  limit?: number;
  offset?: number;
} = {}) => {
  const query = new URLSearchParams();
  if (params.q) query.set("q", params.q);
  if (typeof params.limit === "number") query.set("limit", String(params.limit));
  if (typeof params.offset === "number") query.set("offset", String(params.offset));

  const data = await fetchRadio<ListeningRoomPayload>(
    `/public/library${query.size > 0 ? `?${query.toString()}` : ""}`
  );

  return {
    ...data,
    items: enrichTracks(data?.items),
    djIdentifiers: Array.isArray(data?.djIdentifiers) ? data.djIdentifiers : []
  } satisfies ListeningRoomPayload;
};

export const fetchListeningRoom = async (params: {
  q?: string;
  limit?: number;
  offset?: number;
} = {}) => {
  const requestedLimit =
    typeof params.limit === "number"
      ? Math.max(1, Math.min(params.limit, MAX_LISTENING_ROOM_ITEMS))
      : undefined;
  const requestedOffset = Math.max(0, params.offset ?? 0);

  if (!requestedLimit || requestedLimit <= CONTROLLER_LIBRARY_PAGE_SIZE) {
    return fetchListeningRoomPage({
      ...params,
      ...(requestedLimit ? { limit: requestedLimit } : {}),
      offset: requestedOffset
    });
  }

  let nextOffset = requestedOffset;
  let remaining = requestedLimit;
  let firstPage: ListeningRoomPayload | null = null;
  const items: LibraryTrack[] = [];

  while (remaining > 0) {
    const page = await fetchListeningRoomPage({
      ...params,
      limit: Math.min(CONTROLLER_LIBRARY_PAGE_SIZE, remaining),
      offset: nextOffset
    });
    if (!firstPage) {
      firstPage = page;
    }

    items.push(...page.items);
    remaining -= page.items.length;
    nextOffset += page.items.length;

    if (page.items.length === 0 || items.length >= page.total) {
      break;
    }
  }

  return {
    ...(firstPage ?? {
      items: [],
      total: 0,
      offset: requestedOffset,
      limit: requestedLimit,
      djIdentifiers: [] as DjIdentifier[]
    }),
    items,
    offset: requestedOffset,
    limit: requestedLimit
  } satisfies ListeningRoomPayload;
};

export const fetchPodcastShow = async () => {
  const data = await fetchRadio<PodcastShowPayload>("/public/podcasts");
  return enrichPodcastPayload(data);
};

export const fetchPhotoShelf = async (params: {
  limit?: number;
  source?: "immich" | "local";
} = {}) => {
  const query = new URLSearchParams();
  if (typeof params.limit === "number") query.set("limit", String(params.limit));
  if (params.source) query.set("source", params.source);
  const data = await fetchRadio<PhotoShelfPayload>(
    `/public/photos${query.size > 0 ? `?${query.toString()}` : ""}`
  );
  return enrichPhotoShelf(data);
};
