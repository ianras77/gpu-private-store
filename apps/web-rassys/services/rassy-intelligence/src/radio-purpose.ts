export type CompatibilityAgentId = "dungeon-master" | "radio-dj" | "radio-listener" | "music-librarian" | "mr-rassy-host";

const DJ_PURPOSES = new Set([
  "open set",
  "playlist",
  "playlist-rescue",
  "talk",
  "talk-rescue",
  "track",
  "track-rescue",
  "playback-transition-plan",
  "booth-dossier",
  "booth-dossier-recovery",
]);

export function resolveCompatibilityAgent(purpose: string): CompatibilityAgentId {
  const normalized = purpose.trim().toLowerCase();
  if (normalized.includes("dm")) return "dungeon-master";
  if (DJ_PURPOSES.has(normalized)) return "radio-dj";
  if (normalized.startsWith("track-intelligence-")) return "music-librarian";
  if (normalized === "listener-reply" || normalized.includes("radio-listener")) return "radio-listener";
  if (normalized.includes("radio")) return "radio-listener";
  return "mr-rassy-host";
}
