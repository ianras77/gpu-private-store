import { z } from "zod";

export const GpsPointSchema = z.object({
  lat: z.number(),
  lon: z.number(),
  altitude_m: z.number().nullable().optional(),
  timestamp: z.string(),
  accuracy_m: z.number().nullable().optional()
});

export const WorkoutSchema = z.object({
  id: z.string().uuid(),
  source: z.enum(["ios", "watch"]).or(z.string()),
  started_at: z.string(),
  ended_at: z.string(),
  duration_s: z.number(),
  distance_m: z.number(),
  avg_pace_s_per_km: z.number(),
  calories_kcal: z.number().nullable().optional(),
  avg_hr: z.number().nullable().optional(),
  elevation_gain_m: z.number().nullable().optional(),
  raw_payload_json: z.record(z.unknown()).nullable().optional(),
  created_at: z.string()
});

export const RouteSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  route_hash: z.string(),
  created_at: z.string(),
  is_course: z.boolean().optional().default(false),
  distance_m: z.number().optional().nullable(),
  typical_pace_s_per_km: z.number().optional().nullable(),
  frequency: z.number().optional().nullable(),
  last_run_at: z.string().optional().nullable()
});

export const AdventureSegmentSchema = z.object({
  distance_start_m: z.number(),
  distance_end_m: z.number(),
  biome: z.string(),
  hazards: z.array(z.string()),
  loot: z.array(z.string())
});

export const AdventureSummarySchema = z.object({
  title: z.string(),
  seed: z.number(),
  boss_moment: z.boolean(),
  obstacle_density: z.number(),
  collectibles: z.array(z.string()),
  scenes: z.array(z.string()),
  segments: z.array(AdventureSegmentSchema)
});

export type GpsPoint = z.infer<typeof GpsPointSchema>;
export type Workout = z.infer<typeof WorkoutSchema>;
export type Route = z.infer<typeof RouteSchema>;
export type AdventureSummary = z.infer<typeof AdventureSummarySchema>;
