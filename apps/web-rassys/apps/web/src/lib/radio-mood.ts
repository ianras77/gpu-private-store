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
