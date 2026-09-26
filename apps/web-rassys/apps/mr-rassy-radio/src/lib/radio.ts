export type RadioNow = {
  id?: string;
  title?: string;
  artist?: string;
  album?: string;
  albumArtUrl?: string;
  year?: number;
  genres?: string[];
  energy?: number;
  startedAt?: string;
  streamUrl?: string;
  duration?: number;
  qualityLabel?: string;
  hasArtwork?: boolean;
  lossless?: boolean;
  sampleRate?: number;
  bitsPerSample?: number;
};

export type RadioDJ = {
  script?: string | null;
  mood?: string | null;
  source?: string | null;
  reason?: string | null;
  trackIds?: string[];
  at?: number | null;
};

export type BoothDossierCard = {
  label: string;
  title: string;
  body: string;
};

export type BoothDossierSnapshot = {
  headline: string;
  intro: string;
  tags: string[];
  cards: BoothDossierCard[];
  deepCut: string;
  nextMove: string;
  at?: number;
  source?: "llm" | "fallback";
  signature?: string;
};

export type RadioNoteTrack = {
  id?: string;
  title: string;
  artist: string;
  album?: string;
  albumArtUrl?: string;
  year?: number;
  genres?: string[];
  energy?: number;
};

export type RadioNote = {
  id: string;
  title: string;
  excerpt: string;
  script: string;
  mood?: string | null;
  source: string;
  reason?: string | null;
  eventType: "playlist" | "talk" | "manual";
  trackIds: string[];
  currentTrack?: RadioNoteTrack | null;
  setlist: RadioNoteTrack[];
  boothDossier?: BoothDossierSnapshot | null;
  createdAt: string;
};

export type EasterEggPayload = {
  id?: string;
  badge: string;
  title: string;
  body: string;
  cta: string;
  source?: "cheshire" | "fallback";
  at?: string;
};

export type RadioDashboard = {
  now: RadioNow | null;
  next: RadioNow[];
  dj: RadioDJ | null;
  hears: BoothDossierSnapshot | null;
  notes: RadioNote[];
  liveStreamUrl: string;
};

export type RadioChatMessage = {
  id: string;
  role: "dj" | "listener";
  text: string;
  createdAt: number;
  replySource?: "llm" | "fallback" | "error";
};

export type RadioChatResult = {
  messages: RadioChatMessage[];
  pending?: boolean;
  reply?: RadioChatMessage;
};

export type LibraryTrack = RadioNow & {
  id: string;
  title: string;
  artist: string;
  format?: string;
  bitrate?: number;
  sourceKind?: "music" | "dj";
};

export type ListeningRoomPayload = {
  items: LibraryTrack[];
  total: number;
  offset: number;
  limit: number;
  q?: string | null;
  stats?: {
    totalTracks?: number;
    losslessTracks?: number;
    highResTracks?: number;
    djIdentifiers?: number;
  };
  djIdentifiers: {
    id: string;
    label: string;
    duration?: number;
    format?: string;
  }[];
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
  qualityLabel?: string;
  rssReady?: boolean;
  streamUrl?: string;
  artworkUrl?: string;
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

const DEFAULT_SITE_URL = "https://rassys.com";
const REQUEST_TIMEOUT_MS = 12000;

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, "");

export const siteUrl = trimTrailingSlash(
  process.env.EXPO_PUBLIC_RASSY_SITE_URL?.trim() || DEFAULT_SITE_URL,
);

export const liveStreamUrl = `${siteUrl}/api/radio/stream`;
export const notesArchiveUrl = `${siteUrl}/radio/notes`;

const readJson = async <T>(path: string): Promise<T> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${siteUrl}${path}`, {
      credentials: "include",
      headers: {
        Accept: "application/json",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Request failed for ${path}: ${response.status}`);
    }

    return (await response.json()) as T;
  } finally {
    clearTimeout(timeoutId);
  }
};

export const fetchRadioChat = () => readJson<RadioChatResult>("/api/radio/chat");

export const sendRadioChat = async (message: string, requestId: string): Promise<RadioChatResult> => {
  const response = await fetch(`${siteUrl}/api/radio/chat`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, requestId }),
  });
  if (!response.ok) throw new Error(`Chat unavailable: ${response.status}`);
  return (await response.json()) as RadioChatResult;
};

export const fetchRadioDashboard = async (): Promise<RadioDashboard> => {
  const [now, next, dj, hears, notesPayload] = await Promise.allSettled([
    readJson<RadioNow>("/api/radio/now"),
    readJson<RadioNow[]>("/api/radio/queue"),
    readJson<RadioDJ>("/api/radio/dj"),
    readJson<BoothDossierSnapshot>("/api/radio/hears"),
    readJson<{ notes?: RadioNote[] }>("/api/radio/notes?limit=6"),
  ]);

  if ([now, next, dj, hears, notesPayload].every((result) => result.status === "rejected")) {
    throw new Error("Radio dashboard is unavailable");
  }

  return {
    now: now.status === "fulfilled" ? now.value : null,
    next: next.status === "fulfilled" && Array.isArray(next.value) ? next.value.slice(0, 5) : [],
    dj: dj.status === "fulfilled" ? dj.value : null,
    hears: hears.status === "fulfilled" ? hears.value : null,
    notes:
      notesPayload.status === "fulfilled" &&
      Array.isArray(notesPayload.value.notes)
        ? notesPayload.value.notes
        : [],
    liveStreamUrl,
  };
};

export const fetchCatSignal = async () =>
  readJson<EasterEggPayload>("/api/easter-eggs");

export const fetchListeningRoom = async () =>
  readJson<ListeningRoomPayload>("/api/library?limit=5000");

export const fetchPodcastShow = async () =>
  readJson<PodcastShowPayload>("/api/podcasts");
