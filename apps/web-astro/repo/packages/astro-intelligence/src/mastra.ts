import { Mastra } from "@mastra/core";
import { getChartFactsTool } from "./fact-tools";
import { natalReportV2Workflow } from "./workflow";
import { compatibilityV1Workflow, weeklyTransitV1Workflow } from "./variant-workflows";
import { chartCompanionV1Workflow } from "./companion-workflow";

export { getChartFactsTool } from "./fact-tools";
export const astroTools = { getChartFacts: getChartFactsTool };

/** Registry boundary. No model, storage, Studio, or public server is enabled here. */
export const createAstroMastra = () => new Mastra({ tools: astroTools, workflows: { natalReportV2: natalReportV2Workflow, compatibilityV1: compatibilityV1Workflow, weeklyTransitV1: weeklyTransitV1Workflow, chartCompanionV1: chartCompanionV1Workflow } });
