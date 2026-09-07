import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { embedTexts, rerankTexts } from "@/lib/rassymind";
import { getReadyDocumentIdsForUser } from "@/lib/documents";
import { searchUserDocuments } from "@/lib/qdrant";

export const documentSearchTool = createTool({
  id: "document-search",
  description: "Search only the authenticated user's selected, ready documents.",
  inputSchema: z.object({ userId: z.string().min(1), query: z.string().min(1).max(1000), documentIds: z.array(z.string()).max(50).optional(), limit: z.number().int().min(1).max(8).default(6) }),
  execute: async ({ userId, query, documentIds, limit }) => {
    const ids = await getReadyDocumentIdsForUser(userId, documentIds ?? []);
    if (!ids.length) return [];
    const [vector] = await embedTexts([query]);
    const found = await searchUserDocuments({ userId, documentIds: ids, vector, limit });
    try {
      const order = await rerankTexts(query, found.map((item) => item.payload?.text ?? ""));
      return order.map((index) => found[index]).filter(Boolean);
    } catch { return found; }
  }
});
