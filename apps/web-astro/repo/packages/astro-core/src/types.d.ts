import type { ZodiacSign } from "./math";
export declare const PLANETS: readonly ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"];
export type Planet = (typeof PLANETS)[number];
export declare const OPTIONAL_POINTS: readonly ["NorthNode", "Chiron"];
export type OptionalPoint = (typeof OPTIONAL_POINTS)[number];
export declare const ANGLES: readonly ["Asc", "MC"];
export type Angle = (typeof ANGLES)[number];
export type ChartPointType = "planet" | "angle" | "point";
export type HouseSystem = "placidus" | "whole-sign";
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
    midheaven?: number;
}
export interface ChartPoint {
    key: string;
    type: ChartPointType;
    degree: number;
    sign: ZodiacSign;
    signDegree: number;
    house?: number;
    retrograde?: boolean;
}
export interface NatalChart {
    points: ChartPoint[];
    aspects: Aspect[];
    houses?: HouseInfo;
    meta: {
        timeUnknown: boolean;
        timezone: string;
        calculatedAt: string;
        houseSystem?: HouseSystem;
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