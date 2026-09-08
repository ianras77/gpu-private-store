import { documentSearchTool } from "./document-search";
import { webSearchTool } from "./web-search";
import { parallelResearchTool } from "./parallel-research";

export const toolRegistry = {
  "document-search": { tool: documentSearchTool, category: "knowledge", risk: "read-only", enabled: true },
  "web-search": { tool: webSearchTool, category: "web", risk: "read-only", enabled: true },
  "parallel-research": { tool: parallelResearchTool, category: "web", risk: "read-only", enabled: true }
} as const;

export const rassyTools = { documentSearch: documentSearchTool, webSearch: webSearchTool, parallelResearch: parallelResearchTool };
