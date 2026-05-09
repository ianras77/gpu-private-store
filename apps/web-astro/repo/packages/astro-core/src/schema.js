import { z } from "zod";
export const ChartPointSchema = z.object({
    key: z.string(),
    type: z.enum(["planet", "angle", "point"]),
    degree: z.number(),
    sign: z.string(),
    signDegree: z.number(),
    house: z.number().int().min(1).max(12).optional(),
    retrograde: z.boolean().optional()
});
export const HouseInfoSchema = z.object({
    system: z.enum(["placidus", "whole-sign"]),
    cusps: z.array(z.number()).length(12),
    ascendant: z.number().optional(),
    midheaven: z.number().optional()
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
        houseSystem: z.enum(["placidus", "whole-sign"]).optional()
    })
});
