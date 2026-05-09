import { z } from "zod";
export declare const ChartPointSchema: z.ZodObject<{
    key: z.ZodString;
    type: z.ZodEnum<["planet", "angle", "point"]>;
    degree: z.ZodNumber;
    sign: z.ZodString;
    signDegree: z.ZodNumber;
    house: z.ZodOptional<z.ZodNumber>;
    retrograde: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    key: string;
    type: "planet" | "angle" | "point";
    degree: number;
    sign: string;
    signDegree: number;
    house?: number | undefined;
    retrograde?: boolean | undefined;
}, {
    key: string;
    type: "planet" | "angle" | "point";
    degree: number;
    sign: string;
    signDegree: number;
    house?: number | undefined;
    retrograde?: boolean | undefined;
}>;
export declare const HouseInfoSchema: z.ZodObject<{
    system: z.ZodEnum<["placidus", "whole-sign"]>;
    cusps: z.ZodArray<z.ZodNumber, "many">;
    ascendant: z.ZodOptional<z.ZodNumber>;
    midheaven: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    system: "placidus" | "whole-sign";
    cusps: number[];
    ascendant?: number | undefined;
    midheaven?: number | undefined;
}, {
    system: "placidus" | "whole-sign";
    cusps: number[];
    ascendant?: number | undefined;
    midheaven?: number | undefined;
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
    }, "strip", z.ZodTypeAny, {
        key: string;
        type: "planet" | "angle" | "point";
        degree: number;
        sign: string;
        signDegree: number;
        house?: number | undefined;
        retrograde?: boolean | undefined;
    }, {
        key: string;
        type: "planet" | "angle" | "point";
        degree: number;
        sign: string;
        signDegree: number;
        house?: number | undefined;
        retrograde?: boolean | undefined;
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
        midheaven: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        system: "placidus" | "whole-sign";
        cusps: number[];
        ascendant?: number | undefined;
        midheaven?: number | undefined;
    }, {
        system: "placidus" | "whole-sign";
        cusps: number[];
        ascendant?: number | undefined;
        midheaven?: number | undefined;
    }>>;
    meta: z.ZodObject<{
        timeUnknown: z.ZodBoolean;
        timezone: z.ZodString;
        calculatedAt: z.ZodString;
        houseSystem: z.ZodOptional<z.ZodEnum<["placidus", "whole-sign"]>>;
    }, "strip", z.ZodTypeAny, {
        timeUnknown: boolean;
        timezone: string;
        calculatedAt: string;
        houseSystem?: "placidus" | "whole-sign" | undefined;
    }, {
        timeUnknown: boolean;
        timezone: string;
        calculatedAt: string;
        houseSystem?: "placidus" | "whole-sign" | undefined;
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
        houseSystem?: "placidus" | "whole-sign" | undefined;
    };
    houses?: {
        system: "placidus" | "whole-sign";
        cusps: number[];
        ascendant?: number | undefined;
        midheaven?: number | undefined;
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
        houseSystem?: "placidus" | "whole-sign" | undefined;
    };
    houses?: {
        system: "placidus" | "whole-sign";
        cusps: number[];
        ascendant?: number | undefined;
        midheaven?: number | undefined;
    } | undefined;
}>;
export type NatalChartSchemaType = z.infer<typeof NatalChartSchema>;
//# sourceMappingURL=schema.d.ts.map