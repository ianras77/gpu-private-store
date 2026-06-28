export type ThemeId = "aurora" | "ember" | "verdant";

export type ThemePreset = {
  id: ThemeId;
  label: string;
  words: string[];
};

export const THEME_PRESETS: ThemePreset[] = [
  {
    id: "aurora",
    label: "Aurora",
    words: ["aurora", "cosmic", "starlight", "default", "rassy"]
  },
  {
    id: "ember",
    label: "Ember",
    words: ["ember", "sunset", "forge", "warm", "gold"]
  },
  {
    id: "verdant",
    label: "Verdant",
    words: ["verdant", "garden", "moss", "green", "observatory"]
  }
];

export function getTheme(value: string | null | undefined): ThemePreset {
  return THEME_PRESETS.find((theme) => theme.id === value) ?? THEME_PRESETS[0];
}

export function detectThemeIntent(prompt: string): ThemeId | null {
  const normalized = prompt.toLowerCase();
  const hasVisualIntent = /\b(theme|look|style|skin|palette|atmosphere|make (it|the site)|switch)\b/.test(normalized);
  if (!hasVisualIntent) return null;

  for (const theme of THEME_PRESETS) {
    if (theme.words.some((word) => normalized.includes(word))) {
      return theme.id;
    }
  }
  return null;
}
