import type { DJContext } from "./dj/interface";
import type { Track } from "./library/types";
import { toBoothDossierSnapshot, type BoothDossierSnapshot } from "./booth-dossier";

export type NoteEventType = "playlist" | "talk" | "manual";

export type NoteTrack = {
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

export type NoteBoothDossier = BoothDossierSnapshot;

const asText = (value: unknown) => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const asNumber = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

const trackKey = (track: NoteTrack) =>
  track.id
    ? `id:${track.id}`
    : `name:${track.artist.toLowerCase()}::${track.title.toLowerCase()}`;

const dedupeTracks = (tracks: Array<NoteTrack | null | undefined>, limit = 8) => {
  const unique: NoteTrack[] = [];
  const seen = new Set<string>();

  for (const track of tracks) {
    if (!track) continue;
    const key = trackKey(track);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(track);
    if (unique.length >= limit) break;
  }

  return unique;
};

export const toNoteTrack = (value: unknown): NoteTrack | null => {
  if (!value || typeof value !== "object") return null;
  const track = value as Partial<Track> & Record<string, unknown>;
  const title = asText(track.title);
  const artist = asText(track.artist);
  if (!title || !artist) return null;

  const id = asText(track.id);
  const album = asText(track.album);
  const albumArtUrl = asText(track.albumArtUrl);
  const year = asNumber(track.year);
  const energy = asNumber(track.energy);
  const duration = asNumber(track.duration);
  const genres = Array.isArray(track.genres)
    ? track.genres
        .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
        .slice(0, 3)
    : [];

  return {
    ...(id ? { id } : {}),
    title,
    artist,
    ...(album ? { album } : {}),
    ...(albumArtUrl ? { albumArtUrl } : {}),
    ...(typeof year === "number" ? { year: Math.round(year) } : {}),
    ...(genres.length > 0 ? { genres } : {}),
    ...(typeof energy === "number" ? { energy: Math.max(0, Math.min(1, energy)) } : {}),
    ...(typeof duration === "number" ? { duration: Math.round(duration) } : {})
  };
};

export const buildNoteCurrentTrack = (context?: DJContext | null) => toNoteTrack(context?.nowPlaying ?? null);

export const buildNoteSetlist = (input: {
  context?: DJContext | null;
  selectedTracks?: unknown[];
  limit?: number;
}) => {
  const source =
    Array.isArray(input.selectedTracks) && input.selectedTracks.length > 0
      ? input.selectedTracks
      : (input.context?.queuePreview ?? []);
  return dedupeTracks(source.map((track) => toNoteTrack(track)), input.limit ?? 8);
};

const cleanMood = (value?: string | null) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed.replace(/[_-]+/g, " ") : null;
};

const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

export const buildRadioNoteTitle = (input: {
  mood?: string | null;
  currentTrack?: NoteTrack | null;
  setlist?: NoteTrack[];
  eventType?: NoteEventType | null;
}) => {
  const currentTrack = input.currentTrack ?? null;
  const setlist = input.setlist ?? [];
  const lead = setlist[0];
  const mood = cleanMood(input.mood);

  if (currentTrack && lead && trackKey(currentTrack) !== trackKey(lead)) {
    return `${currentTrack.title} into ${lead.title}`;
  }
  if (lead && mood) {
    return `${lead.title} in the ${mood}`;
  }
  if (lead) {
    return `${lead.title} on deck`;
  }
  if (currentTrack && mood) {
    return `${currentTrack.title} while the booth runs ${mood}`;
  }
  if (currentTrack) {
    return `${currentTrack.title} in the booth`;
  }
  if (mood) {
    return `${capitalize(mood)} booth notes`;
  }
  if (input.eventType === "manual") {
    return "Manual booth note";
  }
  return "Notes from Mr Rassy";
};

export const buildRadioNoteExcerpt = (script: string, maxLength = 180) => {
  const cleaned = script.replace(/\s+/g, " ").trim();
  if (cleaned.length <= maxLength) return cleaned;
  const cut = cleaned.slice(0, maxLength);
  return `${cut.replace(/\s+\S*$/, "")}...`;
};

export const parseTrackIds = (value: unknown) => {
  if (!Array.isArray(value)) return [];
  const ids = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
  return Array.from(new Set(ids));
};

export const parseNoteTrackList = (value: unknown, limit = 8) => {
  if (!Array.isArray(value)) return [];
  return dedupeTracks(value.map((item) => toNoteTrack(item)), limit);
};

export const parseNoteBoothDossier = (value: unknown) => toBoothDossierSnapshot(value);
