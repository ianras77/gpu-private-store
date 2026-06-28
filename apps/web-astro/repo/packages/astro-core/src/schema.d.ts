import { z } from "zod";
export declare const ChartPointSchema: z.ZodObject<{
    key: z.ZodString;
    type: z.ZodEnum<["planet", "angle", "point"]>;
    degree: z.ZodNumber;
    sign: z.ZodString;
    signDegree: z.ZodNumber;
    house: z.ZodOptional<z.ZodNumber>;
    retrograde: z.ZodOptional<z.ZodBoolean>;
    speed: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    key: string;
    type: "planet" | "angle" | "point";
    degree: number;
    sign: string;
    signDegree: number;
    house?: number | undefined;
    retrograde?: boolean | undefined;
    speed?: number | undefined;
}, {
    key: string;
    type: "planet" | "angle" | "point";
    degree: number;
    sign: string;
    signDegree: number;
    house?: number | undefined;
    retrograde?: boolean | undefined;
    speed?: number | undefined;
}>;
export declare const HouseInfoSchema: z.ZodObject<{
    system: z.ZodEnum<["placidus", "whole-sign"]>;
    cusps: z.ZodArray<z.ZodNumber, "many">;
    ascendant: z.ZodOptional<z.ZodNumber>;
    descendant: z.ZodOptional<z.ZodNumber>;
    midheaven: z.ZodOptional<z.ZodNumber>;
    imumCoeli: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    system: "placidus" | "whole-sign";
    cusps: number[];
    ascendant?: number | undefined;
    descendant?: number | undefined;
    midheaven?: number | undefined;
    imumCoeli?: number | undefined;
}, {
    system: "placidus" | "whole-sign";
    cusps: number[];
    ascendant?: number | undefined;
    descendant?: number | undefined;
    midheaven?: number | undefined;
    imumCoeli?: number | undefined;
}>;
export declare const AspectSchema: z.ZodObject<{
    type: z.ZodEnum<["conjunction", "opposition", "trine", "square", "sextile"]>;
    between: z.ZodTuple<[z.ZodString, z.ZodString], null>;
    orb: z.ZodNumber;
    exact: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    type: "conjunction" | "opposition" | "trine" | "square" | "sextile";
    exact: number;
    between: [string, string];
    orb: number;
}, {
    type: "conjunction" | "opposition" | "trine" | "square" | "sextile";
    exact: number;
    between: [string, string];
    orb: number;
}>;
export declare const NatalChartSchema: z.ZodObject<{
    points: z.ZodArray<z.ZodObject<{
        key: z.ZodString;
        type: z.ZodEnum<["planet", "angle", "point"]>;
        degree: z.ZodNumber;
        sign: z.ZodString;
        signDegree: z.ZodNumber;
        house: z.ZodOptional<z.ZodNumber>;
        retrograde: z.ZodOptional<z.ZodBoolean>;
        speed: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        key: string;
        type: "planet" | "angle" | "point";
        degree: number;
        sign: string;
        signDegree: number;
        house?: number | undefined;
        retrograde?: boolean | undefined;
        speed?: number | undefined;
    }, {
        key: string;
        type: "planet" | "angle" | "point";
        degree: number;
        sign: string;
        signDegree: number;
        house?: number | undefined;
        retrograde?: boolean | undefined;
        speed?: number | undefined;
    }>, "many">;
    aspects: z.ZodArray<z.ZodObject<{
        type: z.ZodEnum<["conjunction", "opposition", "trine", "square", "sextile"]>;
        between: z.ZodTuple<[z.ZodString, z.ZodString], null>;
        orb: z.ZodNumber;
        exact: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        type: "conjunction" | "opposition" | "trine" | "square" | "sextile";
        exact: number;
        between: [string, string];
        orb: number;
    }, {
        type: "conjunction" | "opposition" | "trine" | "square" | "sextile";
        exact: number;
        between: [string, string];
        orb: number;
    }>, "many">;
    houses: z.ZodOptional<z.ZodObject<{
        system: z.ZodEnum<["placidus", "whole-sign"]>;
        cusps: z.ZodArray<z.ZodNumber, "many">;
        ascendant: z.ZodOptional<z.ZodNumber>;
        descendant: z.ZodOptional<z.ZodNumber>;
        midheaven: z.ZodOptional<z.ZodNumber>;
        imumCoeli: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        system: "placidus" | "whole-sign";
        cusps: number[];
        ascendant?: number | undefined;
        descendant?: number | undefined;
        midheaven?: number | undefined;
        imumCoeli?: number | undefined;
    }, {
        system: "placidus" | "whole-sign";
        cusps: number[];
        ascendant?: number | undefined;
        descendant?: number | undefined;
        midheaven?: number | undefined;
        imumCoeli?: number | undefined;
    }>>;
    meta: z.ZodObject<{
        timeUnknown: z.ZodBoolean;
        timezone: z.ZodString;
        calculatedAt: z.ZodString;
        birthMomentUtc: z.ZodOptional<z.ZodString>;
        julianDay: z.ZodOptional<z.ZodNumber>;
        houseSystem: z.ZodOptional<z.ZodEnum<["placidus", "whole-sign"]>>;
        engineId: z.ZodOptional<z.ZodString>;
        engineVersion: z.ZodOptional<z.ZodString>;
        ephemerisSource: z.ZodOptional<z.ZodString>;
        calculationConfidence: z.ZodOptional<z.ZodEnum<["canonical", "approximate", "degraded"]>>;
        zodiacMode: z.ZodOptional<z.ZodEnum<["tropical"]>>;
        timezoneSource: z.ZodOptional<z.ZodEnum<["request", "resolved", "fallback"]>>;
    }, "strip", z.ZodTypeAny, {
        timeUnknown: boolean;
        timezone: string;
        calculatedAt: string;
        birthMomentUtc?: string | undefined;
        julianDay?: number | undefined;
        houseSystem?: "placidus" | "whole-sign" | undefined;
        engineId?: string | undefined;
        engineVersion?: string | undefined;
        ephemerisSource?: string | undefined;
        calculationConfidence?: "canonical" | "approximate" | "degraded" | undefined;
        zodiacMode?: "tropical" | undefined;
        timezoneSource?: "request" | "resolved" | "fallback" | undefined;
    }, {
        timeUnknown: boolean;
        timezone: string;
        calculatedAt: string;
        birthMomentUtc?: string | undefined;
        julianDay?: number | undefined;
        houseSystem?: "placidus" | "whole-sign" | undefined;
        engineId?: string | undefined;
        engineVersion?: string | undefined;
        ephemerisSource?: string | undefined;
        calculationConfidence?: "canonical" | "approximate" | "degraded" | undefined;
        zodiacMode?: "tropical" | undefined;
        timezoneSource?: "request" | "resolved" | "fallback" | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    points: {
        key: string;
        type: "planet" | "angle" | "point";
        degree: number;
        sign: string;
        signDegree: number;
        house?: number | undefined;
        retrograde?: boolean | undefined;
        speed?: number | undefined;
    }[];
    aspects: {
        type: "conjunction" | "opposition" | "trine" | "square" | "sextile";
        exact: number;
        between: [string, string];
        orb: number;
    }[];
    meta: {
        timeUnknown: boolean;
        timezone: string;
        calculatedAt: string;
        birthMomentUtc?: string | undefined;
        julianDay?: number | undefined;
        houseSystem?: "placidus" | "whole-sign" | undefined;
        engineId?: string | undefined;
        engineVersion?: string | undefined;
        ephemerisSource?: string | undefined;
        calculationConfidence?: "canonical" | "approximate" | "degraded" | undefined;
        zodiacMode?: "tropical" | undefined;
        timezoneSource?: "request" | "resolved" | "fallback" | undefined;
    };
    houses?: {
        system: "placidus" | "whole-sign";
        cusps: number[];
        ascendant?: number | undefined;
        descendant?: number | undefined;
        midheaven?: number | undefined;
        imumCoeli?: number | undefined;
    } | undefined;
}, {
    points: {
        key: string;
        type: "planet" | "angle" | "point";
        degree: number;
        sign: string;
        signDegree: number;
        house?: number | undefined;
        retrograde?: boolean | undefined;
        speed?: number | undefined;
    }[];
    aspects: {
        type: "conjunction" | "opposition" | "trine" | "square" | "sextile";
        exact: number;
        between: [string, string];
        orb: number;
    }[];
    meta: {
        timeUnknown: boolean;
        timezone: string;
        calculatedAt: string;
        birthMomentUtc?: string | undefined;
        julianDay?: number | undefined;
        houseSystem?: "placidus" | "whole-sign" | undefined;
        engineId?: string | undefined;
        engineVersion?: string | undefined;
        ephemerisSource?: string | undefined;
        calculationConfidence?: "canonical" | "approximate" | "degraded" | undefined;
        zodiacMode?: "tropical" | undefined;
        timezoneSource?: "request" | "resolved" | "fallback" | undefined;
    };
    houses?: {
        system: "placidus" | "whole-sign";
        cusps: number[];
        ascendant?: number | undefined;
        descendant?: number | undefined;
        midheaven?: number | undefined;
        imumCoeli?: number | undefined;
    } | undefined;
}>;
export type NatalChartSchemaType = z.infer<typeof NatalChartSchema>;
//# sourceMappingURL=schema.d.ts.map