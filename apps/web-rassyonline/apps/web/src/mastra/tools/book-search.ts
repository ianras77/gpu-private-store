import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { ensureBooksSyncStarted, getBooksOwnerId, syncBooks } from "@/lib/books";
import { listLibraryDocuments } from "@/lib/documents";
import { embedTexts, rerankTexts } from "@/lib/rassymind";
import { searchUserDocuments } from "@/lib/qdrant";

export const librarianTool = createTool({
  id: "librarian",
  description: "Act as the librarian for the shared read-only Books library: discover works across nested folders, retrieve relevant passages from PDF/EPUB/text books, and provide exact quote-ready text with title and relative path provenance.",
  inputSchema: z.object({ query: z.string().trim().min(1).max(1000), limit: z.number().int().min(1).max(8).default(6) }),
  outputSchema: z.object({ status: z.enum(["ok", "empty", "unavailable"]), results: z.array(z.object({ id: z.string(), score: z.number(), title: z.string(), path: z.string(), text: z.string().max(4000), quoteReady: z.boolean() })) }),
  execute: async ({ query, limit }) => {
    ensureBooksSyncStarted();
    await syncBooks();
    const ownerId = await getBooksOwnerId();
    if (!ownerId) return { status: "unavailable" as const, results: [] };
    const documents = (await listLibraryDocuments(ownerId)).filter((document) => document.status === "ready" && document.active);
    if (!documents.length) return { status: "empty" as const, results: [] };
    const [vector] = await embedTexts([query]);
    const found = await searchUserDocuments({ userId: ownerId, documentIds: documents.map((document) => document.id), vector, limit: Math.min(12, limit * 2) });
    const byId = new Map(documents.map((document) => [document.id, document]));
    const format = (item: typeof found[number]) => { const doc = byId.get(item.payload?.document_id ?? ""); return { id: item.id, score: item.score, title: doc?.title ?? item.payload?.document_title ?? "Untitled book", path: doc?.sourceKey ?? doc?.filename ?? "", text: (item.payload?.text ?? "").slice(0, 4000), quoteReady: true }; };
    try { const order = await rerankTexts(query, found.map((item) => item.payload?.text ?? "")); return { status: "ok" as const, results: order.filter((index) => Number.isInteger(index) && index >= 0 && index < found.length).slice(0, limit).map((index) => format(found[index])) }; } catch { return { status: "ok" as const, results: found.slice(0, limit).map(format) }; }
  }
});

export const bookSearchTool = librarianTool;
