import { fetchRadio } from "./radio-api";
import { createVolatileCache } from "./stale-cache";

export type RadioNoteTrack = {
  id?: string;
  title: string;
  artist: string;
  album?: string;
  albumArtUrl?: string;
  year?: number;
  genres?: string[];
  energy?: number;
  duration?: number;
};

export type RadioNoteBoothDossierCard = {
  label: string;
  title: string;
  body: string;
};

export type RadioNoteBoothSection = {
  title: string;
  body: string;
};

export type RadioNoteBoothSessionTrack = {
  trackId?: string;
  title: string;
  artist: string;
  slot: number;
  role?: "now" | "next" | "later";
  whyItFits: string;
  context: string;
  listenFor: string;
  playbackMode?: "full" | "clip";
  playbackReason?: string;
};

export type RadioNoteBoothProgrammingPlayback = {
  trackId?: string;
  title?: string;
  artist?: string;
  mode: "full" | "clip";
  segment?: "opening" | "middle" | "late";
  cueInSeconds?: number;
  cueOutSeconds?: number;
  fadeInSeconds?: number;
  fadeOutSeconds?: number;
  reason?: string;
};

export type RadioNoteBoothProgramming = {
  mode: "standard" | "special";
  label: string;
  description: string;
  specialType?: string;
  playback: RadioNoteBoothProgrammingPlayback[];
};

export type RadioNoteBoothDossier = {
  headline: string;
  intro: string;
  tags: string[];
  cards: RadioNoteBoothDossierCard[];
  deepCut: string;
  nextMove: string;
  sections?: {
    lineup?: RadioNoteBoothSection;
    context?: RadioNoteBoothSection;
    listenFor?: RadioNoteBoothSection;
  };
  sessionTracks?: RadioNoteBoothSessionTrack[];
  programming?: RadioNoteBoothProgramming;
  at?: number;
  source?: "llm" | "fallback";
  signature?: string;
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
  boothDossier?: RadioNoteBoothDossier | null;
  createdAt: string;
};

export type RadioNotesFacet = {
  value: string;
  count: number;
};

export type IndexedRadioNote = RadioNote & {
  artists: string[];
  genres: string[];
  tags: string[];
  leadTrack?: RadioNoteTrack | null;
  energyLabel?: string | null;
  programmingLabel?: string | null;
  specialType?: string | null;
  searchText: string;
};

export type RadioNotesCatalog = {
  notes: IndexedRadioNote[];
  facets: {
    artists: RadioNotesFacet[];
    genres: RadioNotesFacet[];
    tags: RadioNotesFacet[];
    noteTypes: RadioNotesFacet[];
    specialTypes: RadioNotesFacet[];
  };
};

const LEGACY_ALBUM_ART_HOST =
  /^https?:\/\/music\.(?:rassy|rasies|rassys)\.com\//i;

const localArtworkPath = (trackId: string) =>
  `/api/library/tracks/${encodeURIComponent(trackId)}/artwork`;

const localPlaceholderArtworkPath = (track: Pick<RadioNoteTrack, "title" | "artist">) =>
  `/api/library/artwork/placeholder?title=${encodeURIComponent(track.title)}&artist=${encodeURIComponent(track.artist)}`;

const normalizeRadioNoteTrack = (
  track: RadioNoteTrack | null | undefined,
): RadioNoteTrack | null | undefined => {
  if (!track) return track;

  const albumArtUrl = track.albumArtUrl?.trim();
  if (!albumArtUrl || !LEGACY_ALBUM_ART_HOST.test(albumArtUrl)) {
    return track;
  }

  if (!track.id) {
    return {
      ...track,
      albumArtUrl: localPlaceholderArtworkPath(track),
    };
  }

  return {
    ...track,
    albumArtUrl: localArtworkPath(track.id),
  };
};

export const normalizeRadioNote = (note: RadioNote): RadioNote => ({
  ...note,
  currentTrack: normalizeRadioNoteTrack(note.currentTrack),
  setlist: note.setlist.map((track) => normalizeRadioNoteTrack(track) ?? track),
});

export const normalizeRadioNotes = (notes: RadioNote[]) =>
  notes.map((note) => normalizeRadioNote(note));

const notesListCache = new Map<
  number,
  ReturnType<typeof createVolatileCache<RadioNote[]>>
>();

const getNotesListCache = (limit: number) => {
  let cache = notesListCache.get(limit);
  if (!cache) {
    cache = createVolatileCache<RadioNote[]>();
    notesListCache.set(limit, cache);
  }
  return cache;
};

const envNumber = (key: string, fallback: number) => {
  const parsed = Number(process.env[key]);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const safeDate = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const listRadioNotes = async (limit = 24) => {
  const safeLimit = Math.min(120, Math.max(1, Math.floor(limit)));
  const cache = getNotesListCache(safeLimit);
  const cacheTtlMs = Math.max(
    0,
    envNumber("RADIO_NOTES_LIST_CACHE_TTL_MS", 20_000)
  );
  const cached = cacheTtlMs > 0 ? cache.read(cacheTtlMs) : null;

  if (cached) return cached.value;

  try {
    const payload = await fetchRadio<{ notes?: RadioNote[] }>(`/public/notes?limit=${safeLimit}`);
    const notes = Array.isArray(payload.notes) ? normalizeRadioNotes(payload.notes) : [];
    cache.write(notes);
    return notes;
  } catch {
    const stale = cache.read(
      Math.max(0, envNumber("RADIO_NOTES_LIST_STALE_TTL_MS", 2 * 60 * 1000))
    );
    if (stale) return stale.value;
    return [];
  }
};

const uniqueValues = (values: Array<string | null | undefined>) =>
  Array.from(
    new Set(
      values
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value))
    )
  );

const buildFacet = (values: string[], limit: number) => {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([value, count]) => ({ value, count }))
    .sort((left, right) => {
      if (right.count !== left.count) return right.count - left.count;
      return left.value.localeCompare(right.value);
    })
    .slice(0, limit);
};

export const energyLabel = (energy?: number) => {
  if (typeof energy !== "number") return null;
  if (energy < 0.35) return "slow burn";
  if (energy < 0.65) return "steady pulse";
  return "high voltage";
};

export const formatRadioNoteType = (value: RadioNote["eventType"]) => {
  if (value === "playlist") return "Playlist note";
  if (value === "manual") return "Manual note";
  return "Live booth note";
};

export const indexRadioNote = (note: RadioNote): IndexedRadioNote => {
  const leadTrack = note.currentTrack ?? note.setlist[0] ?? null;
  const artists = uniqueValues([
    note.currentTrack?.artist,
    ...note.setlist.map((track) => track.artist),
    ...(note.boothDossier?.sessionTracks?.map((track) => track.artist) ?? [])
  ]);
  const genres = uniqueValues([
    ...(note.currentTrack?.genres ?? []),
    ...note.setlist.flatMap((track) => track.genres ?? [])
  ]);
  const tags = uniqueValues([
    ...(note.boothDossier?.tags ?? []),
    note.boothDossier?.programming?.label,
    note.boothDossier?.programming?.specialType,
    note.mood ?? undefined,
    note.eventType
  ]);
  const programmingLabel = note.boothDossier?.programming?.label ?? null;
  const specialType = note.boothDossier?.programming?.specialType ?? null;
  const searchText = [
    note.title,
    note.script,
    note.excerpt,
    note.reason,
    note.mood,
    note.currentTrack?.title,
    note.currentTrack?.artist,
    note.currentTrack?.album,
    ...artists,
    ...genres,
    ...tags,
    note.boothDossier?.headline,
    note.boothDossier?.intro,
    note.boothDossier?.deepCut,
    note.boothDossier?.nextMove,
    note.boothDossier?.sections?.lineup?.title,
    note.boothDossier?.sections?.lineup?.body,
    note.boothDossier?.sections?.context?.title,
    note.boothDossier?.sections?.context?.body,
    note.boothDossier?.sections?.listenFor?.title,
    note.boothDossier?.sections?.listenFor?.body,
    note.boothDossier?.programming?.label,
    note.boothDossier?.programming?.description,
    note.boothDossier?.programming?.specialType,
    ...(note.boothDossier?.programming?.playback ?? []).flatMap((playback) => [
      playback.title,
      playback.artist,
      playback.mode,
      playback.segment,
      playback.reason
    ]),
    ...(note.boothDossier?.sessionTracks ?? []).flatMap((track) => [
      track.title,
      track.artist,
      track.whyItFits,
      track.context,
      track.listenFor,
      track.playbackMode,
      track.playbackReason
    ])
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return {
    ...note,
    artists,
    genres,
    tags,
    leadTrack,
    energyLabel: energyLabel(leadTrack?.energy),
    programmingLabel,
    specialType,
    searchText
  };
};

export const buildRadioNotesCatalog = (notes: RadioNote[]): RadioNotesCatalog => {
  const indexedNotes = notes.map(indexRadioNote);

  return {
    notes: indexedNotes,
    facets: {
      artists: buildFacet(indexedNotes.flatMap((note) => note.artists), 18),
      genres: buildFacet(indexedNotes.flatMap((note) => note.genres), 18),
      tags: buildFacet(indexedNotes.flatMap((note) => note.tags), 18),
      noteTypes: buildFacet(indexedNotes.map((note) => formatRadioNoteType(note.eventType)), 3),
      specialTypes: buildFacet(
        indexedNotes
          .map((note) => note.specialType)
          .filter((value): value is string => Boolean(value)),
        8
      )
    }
  };
};

export const formatRadioNoteDate = (value: string) => {
  const date = safeDate(value);
  if (!date) return "Recently";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
};

export const formatRadioNoteTime = (value: string) => {
  const date = safeDate(value);
  if (!date) return "";
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit"
  });
};

export const formatRadioMood = (value?: string | null) => {
  const trimmed = value?.trim();
  if (!trimmed) return "after-hours";
  const cleaned = trimmed.replace(/[_-]+/g, " ");
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
};
