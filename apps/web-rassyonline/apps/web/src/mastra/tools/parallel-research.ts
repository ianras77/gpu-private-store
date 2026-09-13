import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { executeWebSearch, type WebSearchInput, type WebSearchResult } from "@/lib/web-search";

const inputSchema = z.object({
  searches: z.array(z.object({ query: z.string().trim().min(2).max(500), recency: z.enum(["day", "week", "month", "year"]).optional(), domains: z.array(z.string().trim().min(1).max(120)).max(10).optional(), max_results: z.number().int().min(1).max(8).default(4) })).min(2).max(4)
}).superRefine((value, context) => {
  const queries = value.searches.map((search) => search.query.toLowerCase().replace(/\s+/g, " "));
  if (new Set(queries).size !== queries.length) context.addIssue({ code: "custom", path: ["searches"], message: "parallel searches must use distinct queries" });
});

export type ParallelResearchResult = { searches: Array<{ query: string; status: "ok" | "empty" | "failed"; results: WebSearchResult[] }> };

export async function executeParallelResearch(searches: WebSearchInput[]): Promise<ParallelResearchResult> {
  const outputs = await Promise.all(searches.map(async (search) => ({ query: search.query, ...(await executeWebSearch(search)) })));
  return { searches: outputs };
}

export const parallelResearchTool = createTool({
  id: "parallel-research",
  description: "Run two to four independent web searches concurrently for comparison research. Returns grouped evidence and per-search status.",
  inputSchema,
  outputSchema: z.object({ searches: z.array(z.object({ query: z.string(), status: z.enum(["ok", "empty", "failed"]), results: z.array(z.object({ title: z.string(), url: z.string(), source: z.string().optional(), publishedAt: z.string().optional(), snippet: z.string(), status: z.literal("ok").optional() })) })) }),
  execute: async ({ searches }) => executeParallelResearch(searches)
});
