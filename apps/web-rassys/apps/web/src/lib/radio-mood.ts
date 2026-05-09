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

const fallbackMood = (date = new Date()) => {
  const hour = date.getHours();

  if (hour < 5) return "After-hours glow";
  if (hour < 9) return "Daybreak static";
  if (hour < 13) return "Clear-air pulse";
  if (hour < 18) return "Open-window drift";
  if (hour < 22) return "Nightfall magnetism";
  return "Late-night pressure";
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

  return options?.lowercaseFallback ? lowered : capitalize(cleaned);
};
