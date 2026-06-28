import { z } from "zod";
export const ChartPointSchema = z.object({
    key: z.string(),
    type: z.enum(["planet", "angle", "point"]),
    degree: z.number(),
    sign: z.string(),
    signDegree: z.number(),
    house: z.number().int().min(1).max(12).optional(),
    retrograde: z.boolean().optional(),
    speed: z.number().optional()
});
export const HouseInfoSchema = z.object({
    system: z.enum(["placidus", "whole-sign"]),
    cusps: z.array(z.number()).length(12),
    ascendant: z.number().optional(),
    descendant: z.number().optional(),
    midheaven: z.number().optional(),
    imumCoeli: z.number().optional()
});
export const AspectSchema = z.object({
    type: z.enum(["conjunction", "opposition", "trine", "square", "sextile"]),
    between: z.tuple([z.string(), z.string()]),
    orb: z.number(),
    exact: z.number()
});
export const NatalChartSchema = z.object({
    points: z.array(ChartPointSchema),
    aspects: z.array(AspectSchema),
    houses: HouseInfoSchema.optional(),
    meta: z.object({
        timeUnknown: z.boolean(),
        timezone: z.string(),
        calculatedAt: z.string(),
        birthMomentUtc: z.string().optional(),
        julianDay: z.number().optional(),
        houseSystem: z.enum(["placidus", "whole-sign"]).optional(),
        engineId: z.string().optional(),
        engineVersion: z.string().optional(),
        ephemerisSource: z.string().optional(),
        calculationConfidence: z.enum(["canonical", "approximate", "degraded"]).optional(),
        zodiacMode: z.enum(["tropical"]).optional(),
        timezoneSource: z.enum(["request", "resolved", "fallback"]).optional()
    })
});
