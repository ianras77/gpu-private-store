import { Mastra } from "@mastra/core";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { ChartFactGraphSchema } from "@astro/astro-analysis";
import { natalReportV2Workflow } from "./workflow";
import { compatibilityV1Workflow, weeklyTransitV1Workflow } from "./variant-workflows";

export const getChartFactsTool = createTool({
  id: "get-chart-facts",
  description: "Return only the requested deterministic chart facts. This tool never calculates or changes facts.",
  inputSchema: z.object({ graph: ChartFactGraphSchema, factIds: z.array(z.string()).max(80).optional() }),
  outputSchema: z.object({ facts: z.array(z.unknown()), analysisVersion: z.string() }),
  execute: async (context) => ({ facts: context.factIds?.length ? context.graph.facts.filter((fact) => context.factIds?.includes(fact.id)) : context.graph.facts, analysisVersion: context.graph.analysisVersion })
});

export const astroTools = { getChartFacts: getChartFactsTool };

/** Registry boundary. No model, storage, Studio, or public server is enabled here. */
export const createAstroMastra = () => new Mastra({ tools: astroTools, workflows: { natalReportV2: natalReportV2Workflow, compatibilityV1: compatibilityV1Workflow, weeklyTransitV1: weeklyTransitV1Workflow } });
