import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { embedTexts, rerankTexts } from "@/lib/rassymind";
import { getReadyDocumentIdsForUser } from "@/lib/documents";
import { searchUserDocuments } from "@/lib/qdrant";

export const documentSearchTool = createTool({
  id: "document-search",
  description: "Search only the authenticated user's selected, ready documents.",
  inputSchema: z.object({ query: z.string().trim().min(1).max(1000), documentIds: z.array(z.string().trim().min(1).max(200)).max(50).optional(), limit: z.number().int().min(1).max(8).default(6) }),
  outputSchema: z.object({ status: z.enum(["ok", "empty", "unauthorized"]), results: z.array(z.object({ id: z.string(), score: z.number(), documentTitle: z.string(), text: z.string().max(2000) })) }),
  execute: async ({ query, documentIds, limit }, context) => {
    const userId = context?.requestContext?.get?.("userId");
    if (typeof userId !== "string" || !userId) return { status: "unauthorized" as const, results: [] };
    const ids = [...new Set(await getReadyDocumentIdsForUser(userId, [...new Set(documentIds ?? [])]))];
    if (!ids.length) return { status: "empty" as const, results: [] };
    const [vector] = await embedTexts([query]);
    const found = await searchUserDocuments({ userId, documentIds: ids, vector, limit });
    const format = (item: typeof found[number]) => ({ id: item.id, score: item.score, documentTitle: item.payload?.document_title ?? "Untitled document", text: (item.payload?.text ?? "").slice(0, 2000) });
    try {
      const order = await rerankTexts(query, found.map((item) => item.payload?.text ?? ""));
      const seen = new Set<number>();
      return { status: "ok" as const, results: order.filter((index) => Number.isInteger(index) && index >= 0 && index < found.length && !seen.has(index) && seen.add(index)).map((index) => format(found[index])).slice(0, limit) };
    } catch { return { status: "ok" as const, results: found.slice(0, limit).map(format) }; }
  }
});
