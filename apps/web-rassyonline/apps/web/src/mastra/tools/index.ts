import { documentSearchTool } from "./document-search";
import { webSearchTool } from "./web-search";

export const toolRegistry = {
  "document-search": { tool: documentSearchTool, category: "knowledge", risk: "read-only", enabled: true },
  "web-search": { tool: webSearchTool, category: "web", risk: "read-only", enabled: true }
} as const;

export const rassyTools = { documentSearch: documentSearchTool, webSearch: webSearchTool };
