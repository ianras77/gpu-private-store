import { documentSearchTool } from "./document-search";
import { webSearchTool } from "./web-search";
import { parallelResearchTool } from "./parallel-research";
import { pageReaderTool } from "./page-reader";
import { calculatorTool } from "./calculator";
import { timeTool } from "./time";

export const toolRegistry = {
  "document-search": { tool: documentSearchTool, category: "knowledge", risk: "read-only", enabled: true },
  "web-search": { tool: webSearchTool, category: "web", risk: "read-only", enabled: true },
  "parallel-research": { tool: parallelResearchTool, category: "web", risk: "read-only", enabled: true }
  ,"page-reader": { tool: pageReaderTool, category: "web", risk: "read-only", enabled: true }
  ,"calculator": { tool: calculatorTool, category: "utility", risk: "read-only", enabled: true }
  ,"current-time": { tool: timeTool, category: "utility", risk: "read-only", enabled: true }
} as const;

export const rassyTools = { documentSearch: documentSearchTool, webSearch: webSearchTool, parallelResearch: parallelResearchTool, pageReader: pageReaderTool, calculator: calculatorTool, currentTime: timeTool };
