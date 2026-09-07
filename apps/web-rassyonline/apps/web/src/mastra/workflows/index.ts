/** Code-owned workflow catalog. Dynamic definitions may reference only registered primitives. */
export const workflowRegistry = {
  research: { id: "research", description: "Search, gather, and synthesize current evidence", status: "available", agents: ["researcher"] },
  knowledge: { id: "knowledge", description: "Retrieve, rerank, and answer from user knowledge", status: "available", agents: ["knowledge"] },
  deepAnalysis: { id: "deep-analysis", description: "Bounded decomposition and synthesis", status: "planned", agents: ["rassy"] }
} as const;
