import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { embedTexts, rerankTexts } from "@/lib/rassymind";
import { getReadyDocumentIdsForUser } from "@/lib/documents";
import { searchUserDocuments } from "@/lib/qdrant";

export const documentSearchTool = createTool({
  id: "document-search",
  description: "Search only the authenticated user's selected, ready documents.",
  inputSchema: z.object({ query: z.string().min(1).max(1000), documentIds: z.array(z.string()).max(50).optional(), limit: z.number().int().min(1).max(8).default(6) }),
  execute: async ({ query, documentIds, limit }, context) => {
    const userId = context?.requestContext?.get?.("userId");
    if (typeof userId !== "string" || !userId) return { status: "unauthorized" as const, results: [] };
    const ids = await getReadyDocumentIdsForUser(userId, documentIds ?? []);
    if (!ids.length) return { status: "empty" as const, results: [] };
    const [vector] = await embedTexts([query]);
    const found = await searchUserDocuments({ userId, documentIds: ids, vector, limit });
    try {
      const order = await rerankTexts(query, found.map((item) => item.payload?.text ?? ""));
      return { status: "ok" as const, results: order.map((index) => found[index]).filter(Boolean) };
    } catch { return { status: "ok" as const, results: found }; }
  }
});
