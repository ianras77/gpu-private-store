const weakMoodTokens = new Set([
  "chill",
  "cool",
  "flow",
  "fun",
  "good",
  "mood",
  "nice",
  "set",
  "short",
  "silly",
  "vibe",
]);

const capitalize = (value: string) =>
  value.charAt(0).toUpperCase() + value.slice(1);

const cleanMood = (value?: string | null) =>
  value
    ?.trim()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim() ?? "";

const fallbackMoods: Record<string, string[]> = {
  "after-hours": ["After-hours glow", "Midnight magnetism", "Low-lit drift"],
  daybreak: ["Daybreak static", "First-light lift", "Coffee-and-sparks"],
  morning: ["Clear-air pulse", "Open-window warmth", "Bright-start motion"],
  afternoon: ["Open-window drift", "Sunlit momentum", "Easy-weather charge"],
  evening: ["Nightfall magnetism", "Velvet-hour voltage", "Golden fade"],
};

const fallbackMood = (date = new Date()) => {
  const hour = date.getHours();
  const period = hour < 5 ? "after-hours" : hour < 9 ? "daybreak" : hour < 13 ? "morning" : hour < 18 ? "afternoon" : hour < 22 ? "evening" : "after-hours";
  const choices = fallbackMoods[period];
  return choices[(date.getDate() + Math.floor(hour / 3)) % choices.length];
};

const atmosphereWords: Record<string, string[]> = {
  "after-hours": ["neon hush", "midnight lift", "velvet static", "moonlit pressure"],
  daybreak: ["first-light shimmer", "soft ignition", "open-window lift", "morning voltage"],
  morning: ["clear-air mischief", "bright-room motion", "coffeehouse sparkle", "easy momentum"],
  afternoon: ["sunlit drift", "open-road charge", "bright pressure", "warm-weather glide"],
  evening: ["golden-hour pull", "dusky magnetism", "velvet voltage", "nightfall bloom"],
};

const atmosphereHash = (value: string) => [...value].reduce((hash, character) => ((hash * 31) + character.charCodeAt(0)) >>> 0, 7);

export const formatHomepageAtmosphere = (options: {
  mood?: string | null;
  artist?: string | null;
  title?: string | null;
  date?: Date;
}) => {
  const date = options.date ?? new Date();
  const hour = date.getHours();
  const period = hour < 5 || hour >= 22 ? "after-hours" : hour < 9 ? "daybreak" : hour < 13 ? "morning" : hour < 18 ? "afternoon" : "evening";
  const currentMood = cleanMood(options.mood);
  if (currentMood && !weakMoodTokens.has(currentMood.toLowerCase()) && currentMood.length >= 5) {
    return formatRadioMood(currentMood);
  }
  const seed = `${options.artist ?? "station"}:${options.title ?? "air"}:${date.toISOString().slice(0, 10)}:${Math.floor(hour / 3)}`;
  return capitalize(atmosphereWords[period][atmosphereHash(seed) % atmosphereWords[period].length]);
};

export const formatRadioMood = (
  value?: string | null,
  options?: { lowercaseFallback?: boolean },
) => {
  const cleaned = cleanMood(value);
  const lowered = cleaned.toLowerCase();

  if (
    !cleaned ||
    cleaned.length < 5 ||
    (cleaned.split(" ").length === 1 && weakMoodTokens.has(lowered))
  ) {
    const fallback = fallbackMood();
    return options?.lowercaseFallback ? fallback.toLowerCase() : fallback;
  }

  const polished = cleaned
    .split("/")
    .map((part) => capitalize(part.trim()))
    .join(" · ");
  return options?.lowercaseFallback ? polished.toLowerCase() : polished;
};
