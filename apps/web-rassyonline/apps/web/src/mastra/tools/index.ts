import { documentSearchTool } from "./document-search";
import { webSearchTool } from "./web-search";
import { parallelResearchTool } from "./parallel-research";
import { pageReaderTool } from "./page-reader";
import { calculatorTool } from "./calculator";
import { timeTool } from "./time";
import { chartTool } from "./chart";
import { asciiArtTool } from "./ascii-art";
import { dotMatrixTool } from "./dot-matrix";
import { mathLabTool } from "./math-lab";
import { librarianTool } from "./book-search";

export const toolRegistry = {
  "document-search": { tool: documentSearchTool, category: "knowledge", risk: "read-only", enabled: true },
  "librarian": { tool: librarianTool, category: "knowledge", risk: "read-only", enabled: true },
  "web-search": { tool: webSearchTool, category: "web", risk: "read-only", enabled: true },
  "parallel-research": { tool: parallelResearchTool, category: "web", risk: "read-only", enabled: true }
  ,"page-reader": { tool: pageReaderTool, category: "web", risk: "read-only", enabled: true }
  ,"calculator": { tool: calculatorTool, category: "utility", risk: "read-only", enabled: true }
  ,"current-time": { tool: timeTool, category: "utility", risk: "read-only", enabled: true }
  ,"chart": { tool: chartTool, category: "visualization", risk: "read-only", enabled: true }
  ,"ascii-art": { tool: asciiArtTool, category: "visualization", risk: "read-only", enabled: true }
  ,"dot-matrix": { tool: dotMatrixTool, category: "visualization", risk: "read-only", enabled: true }
  ,"math-lab": { tool: mathLabTool, category: "visualization", risk: "read-only", enabled: true }
} as const;

export const rassyTools = { documentSearch: documentSearchTool, librarian: librarianTool, webSearch: webSearchTool, parallelResearch: parallelResearchTool, pageReader: pageReaderTool, calculator: calculatorTool, currentTime: timeTool, chart: chartTool, asciiArt: asciiArtTool, dotMatrix: dotMatrixTool, mathLab: mathLabTool };
