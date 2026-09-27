import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { executeWebSearch, type WebSearchResult } from "@/lib/web-search";

const inputSchema = z.object({
  goal: z.string().trim().min(3).max(500),
  queries: z.array(z.object({ query: z.string().trim().min(2).max(500), recency: z.enum(["day", "week", "month", "year"]).optional(), domains: z.array(z.string().trim().min(1).max(120)).max(10).optional() })).min(1).max(4)
}).superRefine(({ queries }, context) => {
  const seen = new Set<string>();
  queries.forEach((entry, index) => {
    const key = entry.query.toLocaleLowerCase().replace(/\s+/g, " ");
    if (seen.has(key)) context.addIssue({ code: "custom", path: ["queries", index, "query"], message: "research queries must be distinct" });
    seen.add(key);
  });
});

export async function executeAdaptiveResearch(input: z.infer<typeof inputSchema>, seenQueries: string[] = []) {
  const prior = new Set(seenQueries.map((query) => query.toLocaleLowerCase().replace(/\s+/g, " ")));
  const fresh = input.queries.filter((entry) => !prior.has(entry.query.toLocaleLowerCase().replace(/\s+/g, " ")));
  const skipped = input.queries.filter((entry) => !fresh.includes(entry)).map((entry) => entry.query);
  const searches = await Promise.all(fresh.map(async (entry) => ({ query: entry.query, ...(await executeWebSearch({ ...entry, max_results: 5 })) })));
  const results = searches.flatMap((search) => search.results);
  const unique = [...new Map(results.map((result) => [result.url, result] as [string, WebSearchResult])).values()].slice(0, 12);
  return { goal: input.goal, searches, skipped, results: unique };
}

export const adaptiveResearchTool = createTool({
  id: "adaptive-research",
  description: "Plan and run one to four distinct web-research lanes for the current goal. You may call this again later with new, more specific queries after inspecting evidence; never repeat a prior query. Use domains only when the user requested a source boundary. Returns grouped provenance plus a deduplicated evidence set.",
  inputSchema,
  outputSchema: z.object({
    goal: z.string(),
    searches: z.array(z.object({
      query: z.string(), status: z.enum(["ok", "empty", "failed"]), reason: z.string().optional(),
      results: z.array(z.object({ title: z.string(), url: z.string(), source: z.string().optional(), publishedAt: z.string().optional(), snippet: z.string(), status: z.literal("ok").optional() }))
    })),
    skipped: z.array(z.string()),
    results: z.array(z.object({ title: z.string(), url: z.string(), source: z.string().optional(), publishedAt: z.string().optional(), snippet: z.string(), status: z.literal("ok").optional() }))
  }),
  execute: async (input, context) => {
    const prior = context?.requestContext?.get?.("researchQueries");
    const seen = Array.isArray(prior) ? prior.filter((value): value is string => typeof value === "string") : [];
    const output = await executeAdaptiveResearch(input, seen);
    context?.requestContext?.set?.("researchQueries", [...seen, ...output.searches.map((search) => search.query)].slice(-24));
    return output;
  }
});
