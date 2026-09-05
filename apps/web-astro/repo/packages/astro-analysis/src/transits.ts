import { z } from "zod";
import type { NatalChart } from "@astro/astro-core";
import { TimingFactGraphSchema, type TimingFactGraph } from "./timing";

export const TransitCalculationInputSchema = z.object({
  natalChart: z.unknown(), transitChart: z.unknown(), exactAt: z.string().datetime(),
  timezone: z.string(), source: z.string().min(1), transitChartHash: z.string().default("unhashed-transit")
});

const normalize = (degree: number) => ((degree % 360) + 360) % 360;
const distance = (a: number, b: number) => { const delta = Math.abs(normalize(a) - normalize(b)); return Math.min(delta, 360 - delta); };
const aspect = (value: number) => {
  const candidates = [[0, "conjunction"], [60, "sextile"], [90, "square"], [120, "trine"], [180, "opposition"]] as const;
  let best: { exact: number; name: string; orb: number } | undefined;
  for (const [exact, name] of candidates) { const orb = Math.abs(value - exact); if (orb <= 8 && (!best || orb < best.orb)) best = { exact, name, orb }; }
  return best;
};

/** Builds transit facts from already-calculated Swiss/engine charts. It never calculates astronomy itself. */
export function buildTransitFactGraph(input: {
  natalChart: NatalChart;
  transitChart: NatalChart;
  exactAt: string;
  timezone: string;
  source: string;
  transitChartHash?: string;
}): TimingFactGraph {
  const activations = [];
  for (const transit of input.transitChart.points.filter((point) => point.type !== "angle")) {
    for (const natal of input.natalChart.points.filter((point) => point.type !== "angle")) {
      const match = aspect(distance(transit.degree, natal.degree));
      if (!match) continue;
      activations.push({
        id: `transit:${transit.key.toLowerCase()}:${natal.key.toLowerCase()}:${match.name}:${input.exactAt}`,
        kind: "transit" as const,
        label: `${transit.key} ${match.name} natal ${natal.key}`,
        exactAt: input.exactAt,
        bodies: [transit.key, natal.key],
        targetFactIds: [`placement:${natal.key.toLowerCase()}`],
        orb: match.orb,
        exact: match.orb < 0.1,
        timezone: input.timezone,
        source: input.source
      });
    }
  }
  return TimingFactGraphSchema.parse({ schemaVersion: "1.0.0", engineVersion: input.transitChart.meta.engineVersion ?? "unknown", activations });
}
