import type { Track } from "./types";

// Keep credential-bearing media URLs inside the controller. Public clients
// receive track IDs and request media through the controller's proxy routes.
export const toPublicTrack = (track: Track) => ({
  id: track.id,
  title: track.title,
  artist: track.artist,
  album: track.album,
  year: track.year,
  genres: track.genres,
  duration: track.duration,
  bpm: track.bpm,
  energy: track.energy,
  hasArtwork: Boolean(track.hasArtwork || track.albumArtUrl),
  sourceKind: track.sourceKind ?? "music",
  format: track.format,
  sampleRate: track.sampleRate,
  bitsPerSample: track.bitsPerSample,
  bitrate: track.bitrate,
  lossless: track.lossless,
});
