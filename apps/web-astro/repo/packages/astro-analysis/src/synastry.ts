import { z } from "zod";
import type { NatalChart } from "@astro/astro-core";
import { ChartFactGraphSchema, type ChartFact, type ChartFactGraph } from "./index";

const ChartFactSchemaForSynastry = z.object({
  id: z.string(), category: z.literal("synastry"), label: z.string(), value: z.unknown(),
  humanText: z.string(), importance: z.number().min(0).max(1),
  confidence: z.enum(["exact", "high", "conditional", "unknown"]),
  sourcePath: z.array(z.string()), relatedFactIds: z.array(z.string())
});

export const SynastryFactGraphSchema = z.object({
  schemaVersion: z.literal("1.0.0"),
  analysisVersion: z.string(),
  chartAHash: z.string(),
  chartBHash: z.string(),
  facts: z.array(ChartFactSchemaForSynastry)
});

export type SynastryFactGraph = z.infer<typeof SynastryFactGraphSchema>;

const normalize = (degree: number) => ((degree % 360) + 360) % 360;
const separation = (a: number, b: number) => {
  const delta = Math.abs(normalize(a) - normalize(b));
  return Math.min(delta, 360 - delta);
};
const aspectName = (distance: number) => {
  const candidates = [
    [0, "conjunction"], [60, "sextile"], [90, "square"], [120, "trine"], [180, "opposition"]
  ] as const;
  let best: { name: string; orb: number } | undefined;
  for (const [exact, name] of candidates) {
    const orb = Math.abs(distance - exact);
    if (orb <= 8 && (!best || orb < best.orb)) best = { name, orb };
  }
  return best;
};

export function buildSynastryFactGraph(
  chartA: NatalChart,
  chartB: NatalChart,
  chartAHash = "unhashed-a",
  chartBHash = "unhashed-b",
  analysisVersion = "1.0.0"
): SynastryFactGraph {
  const facts: ChartFact[] = [];
  const confidence = chartA.meta.timeUnknown || chartB.meta.timeUnknown ? "conditional" : "exact";
  for (const pointA of chartA.points.filter((point) => point.type !== "angle")) {
    for (const pointB of chartB.points.filter((point) => point.type !== "angle")) {
      const match = aspectName(separation(pointA.degree, pointB.degree));
      if (!match) continue;
      const id = `synastry:${pointA.key.toLowerCase()}:${pointB.key.toLowerCase()}:${match.name}`;
      facts.push({
        id,
        category: "synastry",
        label: `${pointA.key}-${pointB.key} ${match.name}`,
        value: { personA: pointA.key, personB: pointB.key, aspect: match.name, orb: match.orb },
        humanText: `Person A ${pointA.key} forms a ${match.name} with Person B ${pointB.key} (${match.orb.toFixed(2)} degree orb).`,
        importance: Math.max(0.2, 1 - match.orb / 8),
        confidence,
        sourcePath: ["chartA", "points", pointA.key, "chartB", "points", pointB.key],
        relatedFactIds: []
      });
    }
  }
  return SynastryFactGraphSchema.parse({ schemaVersion: "1.0.0", analysisVersion, chartAHash, chartBHash, facts });
}

export function synastryToChartFactGraph(graph: SynastryFactGraph): ChartFactGraph {
  return ChartFactGraphSchema.parse({ schemaVersion: "1.0.0", analysisVersion: graph.analysisVersion, chartHash: `${graph.chartAHash}:${graph.chartBHash}`, facts: graph.facts });
}
