import type { ZodiacSign } from "./math";
export declare const PLANETS: readonly ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"];
export type Planet = (typeof PLANETS)[number];
export declare const OPTIONAL_POINTS: readonly ["NorthNode", "Chiron"];
export type OptionalPoint = (typeof OPTIONAL_POINTS)[number];
export declare const ANGLES: readonly ["Asc", "MC", "Desc", "IC"];
export type Angle = (typeof ANGLES)[number];
export type ChartPointType = "planet" | "angle" | "point";
export type HouseSystem = "placidus" | "whole-sign";
export type CalculationConfidence = "canonical" | "approximate" | "degraded";
export type ZodiacMode = "tropical";
export type TimezoneSource = "request" | "resolved" | "fallback";
export type AspectType = "conjunction" | "opposition" | "trine" | "square" | "sextile";
export interface Aspect {
    type: AspectType;
    between: [string, string];
    orb: number;
    exact: number;
}
export interface HouseInfo {
    system: HouseSystem;
    cusps: number[];
    ascendant?: number;
    descendant?: number;
    midheaven?: number;
    imumCoeli?: number;
}
export interface ChartPoint {
    key: string;
    type: ChartPointType;
    degree: number;
    sign: ZodiacSign;
    signDegree: number;
    house?: number;
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
    birthDate: string;
    birthTime?: string;
    timeUnknown?: boolean;
    latitude: number;
    longitude: number;
    timezone: string;
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
//# sourceMappingURL=types.d.ts.map