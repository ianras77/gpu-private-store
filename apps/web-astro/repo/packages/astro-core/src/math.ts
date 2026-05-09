export const ZODIAC_SIGNS = [
  "Aries",
  "Taurus",
  "Gemini",
  "Cancer",
  "Leo",
  "Virgo",
  "Libra",
  "Scorpio",
  "Sagittarius",
  "Capricorn",
  "Aquarius",
  "Pisces"
] as const;

export type ZodiacSign = (typeof ZODIAC_SIGNS)[number];

export const normalizeDegree = (deg: number): number => {
  const mod = deg % 360;
  return mod < 0 ? mod + 360 : mod;
};

export const degreeToSign = (deg: number): ZodiacSign => {
  const normalized = normalizeDegree(deg);
  const index = Math.floor(normalized / 30) % 12;
  return ZODIAC_SIGNS[index] ?? ZODIAC_SIGNS[0];
};

export const degreeToSignDegree = (deg: number): number => {
  const normalized = normalizeDegree(deg);
  return normalized % 30;
};

export const shortestArc = (degA: number, degB: number): number => {
  const diff = Math.abs(normalizeDegree(degA) - normalizeDegree(degB));
  return diff > 180 ? 360 - diff : diff;
};

export const interpolateArc = (start: number, end: number, t: number): number => {
  const s = normalizeDegree(start);
  const e = normalizeDegree(end);
  const delta = normalizeDegree(e - s);
  return normalizeDegree(s + delta * t);
};
