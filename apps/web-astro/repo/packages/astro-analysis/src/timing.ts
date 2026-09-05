import { z } from "zod";

export const TimingKindSchema = z.enum(["transit", "station", "eclipse", "solar-return", "progression", "profection"]);
export const TimingActivationSchema = z.object({
  id: z.string(), kind: TimingKindSchema, label: z.string(), exactAt: z.string().datetime(), windowStart: z.string().datetime().optional(), windowEnd: z.string().datetime().optional(),
  bodies: z.array(z.string()), targetFactIds: z.array(z.string()), orb: z.number().nonnegative().optional(), exact: z.boolean(), timezone: z.string(), source: z.string()
});
export const TimingFactGraphSchema = z.object({ schemaVersion: z.literal("1.0.0"), engineVersion: z.string(), activations: z.array(TimingActivationSchema) });
export type TimingActivation = z.infer<typeof TimingActivationSchema>;
export type TimingFactGraph = z.infer<typeof TimingFactGraphSchema>;

/** Validates calculated timing output. It intentionally performs no astronomy. */
export function validateTimingGraph(graph: unknown): TimingFactGraph { return TimingFactGraphSchema.parse(graph); }
