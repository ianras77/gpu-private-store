import { Mastra } from "@mastra/core/mastra";
import { cartridgeWorkflow, recapWorkflow, trendWorkflow, worldkeeper } from "./workflows.js";

export const mastra = new Mastra({
  agents: { worldkeeper },
  workflows: { cartridgeWorkflow, recapWorkflow, trendWorkflow },
});
