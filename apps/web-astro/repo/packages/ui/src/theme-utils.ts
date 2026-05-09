import type { BrandTokens } from "@astro/brands";

type Rgb = { r: number; g: number; b: number };

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

const normalizeHex = (hex: string): string => {
  const cleaned = hex.replace("#", "").trim();
  if (cleaned.length === 3) {
    return cleaned
      .split("")
      .map((char) => char + char)
      .join("");
  }
  if (cleaned.length === 6) return cleaned;
  return "000000";
};

const hexToRgb = (hex: string): Rgb => {
  const normalized = normalizeHex(hex);
  const value = parseInt(normalized, 16);
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255
  };
};

const rgbToHex = ({ r, g, b }: Rgb): string => {
  const toHex = (channel: number) =>
    clamp(Math.round(channel), 0, 255).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
};

const mix = (from: Rgb, to: Rgb, amount: number): Rgb => ({
  r: from.r + (to.r - from.r) * amount,
  g: from.g + (to.g - from.g) * amount,
  b: from.b + (to.b - from.b) * amount
});

const mixHex = (base: string, target: string, amount: number): string => {
  const blended = mix(hexToRgb(base), hexToRgb(target), amount);
  return rgbToHex(blended);
};

const withAlpha = (hex: string, alpha: number): string => {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${clamp(alpha, 0, 1)})`;
};

const luminance = ({ r, g, b }: Rgb): number => {
  const transform = (value: number) => {
    const channel = value / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * transform(r) + 0.7152 * transform(g) + 0.0722 * transform(b);
};

export const deriveTokens = (tokens: BrandTokens) => {
  const isDark = luminance(hexToRgb(tokens.background)) < 0.42;
  const surface = mixHex(tokens.background, isDark ? "#ffffff" : "#000000", isDark ? 0.09 : 0.05);
  const surfaceStrong = mixHex(tokens.background, isDark ? "#ffffff" : "#000000", isDark ? 0.17 : 0.1);
  const accentStrong = mixHex(tokens.accent, isDark ? "#ffffff" : "#000000", isDark ? 0.18 : 0.15);

  return {
    isDark,
    surface,
    surfaceStrong,
    accentStrong,
    accentSoft: withAlpha(tokens.accent, isDark ? 0.2 : 0.12),
    mutedSoft: withAlpha(tokens.muted, isDark ? 0.22 : 0.14),
    borderSoft: withAlpha(tokens.border, isDark ? 0.45 : 0.75),
    shadowSoft: isDark
      ? "0 22px 60px rgba(0, 0, 0, 0.55)"
      : "0 22px 60px rgba(15, 18, 25, 0.12)",
    shadowLift: isDark
      ? "0 10px 28px rgba(0, 0, 0, 0.45)"
      : "0 10px 28px rgba(15, 18, 25, 0.12)"
  };
};
