import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { ChartFactGraphSchema } from "@astro/astro-analysis";

const factWords = (value: string) => new Set(value.toLowerCase().match(/[a-z0-9]+/g) ?? []);

export function selectRelevantFacts<T extends { id: string; humanText: string; category: string }>(facts: T[], query: string): T[] {
  if (!query.trim()) return facts.slice(0, 16);
  const queryWords = factWords(query);
  const planetNames = ["sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn", "uranus", "neptune", "pluto", "rising", "ascendant", "midheaven"];
  const requestedPlanets = planetNames.filter((name) => queryWords.has(name));
  const ranked = facts.map((fact, index) => {
    const words = factWords(`${fact.id} ${fact.humanText} ${fact.category}`);
    let score = 0;
    for (const word of queryWords) if (word.length > 2 && words.has(word)) score += 2;
    if (requestedPlanets.some((name) => words.has(name) || fact.id.toLowerCase().includes(name))) score += 8;
    if (/aspect|together|tension|pattern|relationship/.test(query.toLowerCase()) && fact.category === "aspect") score += 3;
    if (/house|career|home|work|family|money|friend/.test(query.toLowerCase()) && fact.category === "house") score += 3;
    return { fact, score, index };
  });
  const matching = ranked.filter((item) => item.score > 0).sort((a, b) => b.score - a.score || a.index - b.index).slice(0, 16);
  return matching.map((item) => item.fact);
}

export const getChartFactsTool = createTool({
  id: "get-chart-facts",
  description: "Retrieve deterministic chart facts relevant to a question. This tool never calculates or changes facts.",
  inputSchema: z.object({ graph: ChartFactGraphSchema, factIds: z.array(z.string()).max(80).optional(), query: z.string().max(2_000).optional() }),
  outputSchema: z.object({ facts: z.array(z.unknown()), analysisVersion: z.string() }),
  execute: async (input) => {
    const facts = input.factIds?.length
      ? input.graph.facts.filter((fact) => input.factIds?.includes(fact.id))
      : selectRelevantFacts(input.graph.facts, input.query ?? "");
    return { facts, analysisVersion: input.graph.analysisVersion };
  }
});
