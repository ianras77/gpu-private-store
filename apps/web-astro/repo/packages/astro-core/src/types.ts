import type { ZodiacSign } from "./math";

export const PLANETS = [
  "Sun",
  "Moon",
  "Mercury",
  "Venus",
  "Mars",
  "Jupiter",
  "Saturn",
  "Uranus",
  "Neptune",
  "Pluto"
] as const;

export type Planet = (typeof PLANETS)[number];

export const OPTIONAL_POINTS = ["NorthNode", "Chiron"] as const;
export type OptionalPoint = (typeof OPTIONAL_POINTS)[number];

export const ANGLES = ["Asc", "MC", "Desc", "IC"] as const;
export type Angle = (typeof ANGLES)[number];

export type ChartPointType = "planet" | "angle" | "point";

export type HouseSystem = "placidus" | "whole-sign";

export type CalculationConfidence = "canonical" | "approximate" | "degraded";
export type ZodiacMode = "tropical";
export type TimezoneSource = "request" | "resolved" | "fallback";

export type AspectType =
  | "conjunction"
  | "opposition"
  | "trine"
  | "square"
  | "sextile";

export interface Aspect {
  type: AspectType;
  between: [string, string];
  orb: number;
  exact: number;
}

export interface HouseInfo {
  system: HouseSystem;
  cusps: number[]; // length 12, each 0..360
  ascendant?: number;
  descendant?: number;
  midheaven?: number;
  imumCoeli?: number;
}

export interface ChartPoint {
  key: string;
  type: ChartPointType;
  degree: number; // 0..360
  sign: ZodiacSign;
  signDegree: number; // 0..30
  house?: number; // 1..12
  retrograde?: boolean;
  speed?: number;
}

export interface NatalChart {
  points: ChartPoint[];
  aspects: Aspect[];
  houses?: HouseInfo;
  meta: {
    timeUnknown: boolean;
    timezone: string;
    calculatedAt: string;
    birthMomentUtc?: string;
    julianDay?: number;
    houseSystem?: HouseSystem;
    engineId?: string;
    engineVersion?: string;
    ephemerisSource?: string;
    calculationConfidence?: CalculationConfidence;
    zodiacMode?: ZodiacMode;
    timezoneSource?: TimezoneSource;
  };
}

export interface ChartInput {
  birthDate: string; // YYYY-MM-DD
  birthTime?: string; // HH:mm
  timeUnknown?: boolean;
  latitude: number;
  longitude: number;
  timezone: string; // IANA tz
}

export interface ChartOptions {
  houseSystem?: HouseSystem;
  includePoints?: {
    northNode?: boolean;
    chiron?: boolean;
  };
}

export interface AstroEngine {
  id: string;
  calculateChart: (input: ChartInput, options?: ChartOptions) => Promise<NatalChart>;
}
