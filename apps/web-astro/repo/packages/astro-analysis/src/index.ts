import { z } from "zod";
import type { NatalChart, ChartPoint } from "@astro/astro-core";
export * from "./timing";
export * from "./synastry";
export * from "./transits";

export const ChartFactSchema = z.object({
  id: z.string(), category: z.enum(["placement", "angle", "house", "aspect", "dominant", "ruler", "configuration", "uncertainty", "transit", "synastry"]),
  label: z.string(), value: z.unknown(), humanText: z.string(), importance: z.number().min(0).max(1),
  confidence: z.enum(["exact", "high", "conditional", "unknown"]), sourcePath: z.array(z.string()), relatedFactIds: z.array(z.string())
});
export const ChartFactGraphSchema = z.object({ schemaVersion: z.literal("1.0.0"), analysisVersion: z.string(), chartHash: z.string(), facts: z.array(ChartFactSchema) });
export type ChartFact = z.infer<typeof ChartFactSchema>;
export type ChartFactGraph = z.infer<typeof ChartFactGraphSchema>;

const slug = (value: string) => value.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
const confidence = (chart: NatalChart): ChartFact["confidence"] => chart.meta.timeUnknown ? "conditional" : "exact";
const ELEMENTS: Record<string, string> = { Aries: "fire", Leo: "fire", Sagittarius: "fire", Taurus: "earth", Virgo: "earth", Capricorn: "earth", Gemini: "air", Libra: "air", Aquarius: "air", Cancer: "water", Scorpio: "water", Pisces: "water" };
const MODALITIES: Record<string, string> = { Aries: "cardinal", Cancer: "cardinal", Libra: "cardinal", Capricorn: "cardinal", Taurus: "fixed", Leo: "fixed", Scorpio: "fixed", Aquarius: "fixed", Gemini: "mutable", Virgo: "mutable", Sagittarius: "mutable", Pisces: "mutable" };
const RULERS: Record<string, string> = { Aries: "Mars", Taurus: "Venus", Gemini: "Mercury", Cancer: "Moon", Leo: "Sun", Virgo: "Mercury", Libra: "Venus", Scorpio: "Mars", Sagittarius: "Jupiter", Capricorn: "Saturn", Aquarius: "Saturn", Pisces: "Jupiter" };

export function buildChartFactGraph(chart: NatalChart, chartHash = "unhashed", analysisVersion = "1.0.0"): ChartFactGraph {
  const facts: ChartFact[] = [];
  const add = (fact: Omit<ChartFact, "relatedFactIds">) => facts.push({ ...fact, relatedFactIds: [] });
  for (const point of chart.points) {
    const category = point.type === "angle" ? "angle" : "placement";
    add({ id: `${category}:${slug(point.key)}`, category, label: point.key, value: { degree: point.degree, sign: point.sign, signDegree: point.signDegree, house: point.house, retrograde: point.retrograde }, humanText: `${point.key} is in ${point.sign} at ${point.signDegree.toFixed(2)} degrees${point.house ? ` in house ${point.house}` : ""}.`, importance: point.type === "angle" || ["Sun", "Moon", "Asc"].includes(point.key) ? 1 : 0.6, confidence: category === "angle" && chart.meta.timeUnknown ? "unknown" : confidence(chart), sourcePath: ["points", point.key] });
    if (point.house) add({ id: `house:${slug(point.key)}`, category: "house", label: `${point.key} house`, value: point.house, humanText: `${point.key} occupies house ${point.house}.`, importance: 0.55, confidence: confidence(chart), sourcePath: ["points", point.key, "house"] });
  }
  chart.aspects.forEach((aspect, index) => add({ id: `aspect:${index}:${slug(aspect.between.join("-"))}`, category: "aspect", label: aspect.type, value: aspect, humanText: `${aspect.between[0]} forms a ${aspect.type} with ${aspect.between[1]} (${aspect.orb.toFixed(2)} degree orb).`, importance: Math.max(0.2, 1 - aspect.orb / 10), confidence: "exact", sourcePath: ["aspects", String(index)] }));
  const planets = chart.points.filter((point) => point.type === "planet");
  const planetCounts = planets.reduce<Record<string, number>>((counts, point) => { counts[point.key] = (counts[point.key] ?? 0) + 1; return counts; }, {});
  const signCounts = planets.reduce<Record<string, number>>((counts, point) => { counts[point.sign] = (counts[point.sign] ?? 0) + 1; return counts; }, {});
  const houseCounts = planets.reduce<Record<string, number>>((counts, point) => { if (point.house) counts[String(point.house)] = (counts[String(point.house)] ?? 0) + 1; return counts; }, {});
  const elementCounts = planets.reduce<Record<string, number>>((counts, point) => { const element = ELEMENTS[point.sign]; if (element) counts[element] = (counts[element] ?? 0) + 1; return counts; }, {});
  const modalityCounts = planets.reduce<Record<string, number>>((counts, point) => { const modality = MODALITIES[point.sign]; if (modality) counts[modality] = (counts[modality] ?? 0) + 1; return counts; }, {});
  add({ id: "dominant:elements", category: "dominant", label: "Element balance", value: elementCounts, humanText: `Element balance: ${Object.entries(elementCounts).map(([key, value]) => `${key} ${value}`).join(", ")}.`, importance: 0.7, confidence: confidence(chart), sourcePath: ["derived", "elements"] });
  add({ id: "dominant:modalities", category: "dominant", label: "Modality balance", value: modalityCounts, humanText: `Modality balance: ${Object.entries(modalityCounts).map(([key, value]) => `${key} ${value}`).join(", ")}.`, importance: 0.7, confidence: confidence(chart), sourcePath: ["derived", "modalities"] });
  add({ id: "dominant:planets", category: "dominant", label: "Planet emphasis", value: planetCounts, humanText: `Planet emphasis is ranked from the calculated planetary placements.`, importance: 0.65, confidence: confidence(chart), sourcePath: ["derived", "planetEmphasis"] });
  add({ id: "dominant:signs", category: "dominant", label: "Sign emphasis", value: signCounts, humanText: `Sign emphasis is ranked from the calculated planetary placements.`, importance: 0.65, confidence: confidence(chart), sourcePath: ["derived", "signEmphasis"] });
  if (!chart.meta.timeUnknown) add({ id: "dominant:houses", category: "dominant", label: "House emphasis", value: houseCounts, humanText: `House emphasis is ranked from the calculated house placements.`, importance: 0.65, confidence: "exact", sourcePath: ["derived", "houseEmphasis"] });
  const angularPoints = chart.points.filter((point) => point.type === "angle").map((point) => point.key);
  if (!chart.meta.timeUnknown && angularPoints.length) add({ id: "dominant:angularity", category: "dominant", label: "Angular emphasis", value: { angles: angularPoints }, humanText: `The chart includes calculated angular points: ${angularPoints.join(", ")}.`, importance: 0.8, confidence: "exact", sourcePath: ["derived", "angularity"] });
  const ascendant = chart.points.find((point) => point.key === "Asc");
  if (ascendant && !chart.meta.timeUnknown) { const ruler = RULERS[ascendant.sign]; if (ruler) add({ id: "ruler:chart", category: "ruler", label: "Chart ruler", value: { sign: ascendant.sign, planet: ruler }, humanText: `${ascendant.sign} rising makes ${ruler} the chart ruler.`, importance: 0.9, confidence: "exact", sourcePath: ["derived", "chartRuler"] }); }
  if (chart.meta.timeUnknown) add({ id: "uncertainty:birth-time", category: "uncertainty", label: "Birth time unknown", value: true, humanText: "Birth time is unknown; angles, houses, and time-sensitive Moon claims require caution.", importance: 1, confidence: "unknown", sourcePath: ["meta", "timeUnknown"] });
  return ChartFactGraphSchema.parse({ schemaVersion: "1.0.0", analysisVersion, chartHash, facts });
}

export function summarizeDominants(chart: NatalChart): Record<string, number> {
  return chart.points.reduce<Record<string, number>>((out, point: ChartPoint) => { out[point.key] = (out[point.key] ?? 0) + (point.type === "angle" ? 2 : point.house ? 1.2 : 1); return out; }, {});
}
