import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { executeWebSearch, type WebSearchInput, type WebSearchResult } from "@/lib/web-search";

const inputSchema = z.object({
  searches: z.array(z.object({ query: z.string().min(2).max(500), recency: z.string().optional(), domains: z.array(z.string()).max(10).optional(), max_results: z.number().int().min(1).max(8).default(4) })).min(2).max(4)
});

export const parallelResearchTool = createTool({
  id: "parallel-research",
  description: "Run two to four independent web searches concurrently for comparison research. Returns grouped evidence and per-search status.",
  inputSchema,
  outputSchema: z.object({ searches: z.array(z.object({ query: z.string(), status: z.enum(["ok", "empty", "failed"]), results: z.array(z.object({ title: z.string(), url: z.string(), source: z.string().optional(), publishedAt: z.string().optional(), snippet: z.string(), status: z.literal("ok").optional() })) })) }),
  execute: async ({ searches }) => {
    const outputs = await Promise.all(searches.map(async (search: WebSearchInput) => ({ query: search.query, ...(await executeWebSearch(search)) })));
    return { searches: outputs as Array<{ query: string; status: "ok" | "empty" | "failed"; results: WebSearchResult[] }> };
  }
});
