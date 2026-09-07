import { NextRequest } from "next/server";
import { z } from "zod";
import { SESSION_COOKIE } from "@/lib/auth/sessions";
import { getUserForSessionToken } from "@/lib/auth/users";
import { agentRegistry } from "@/mastra";
import { streamMastraChat } from "@/mastra/chat";
import { shouldUseWebSearch, unsupportedCitationUrls } from "@/lib/web-search";
import { buildDocumentContextMessage } from "@/lib/document-memory";
import { getReadyDocumentIdsForUser } from "@/lib/documents";
import { embedTexts, rerankTexts } from "@/lib/rassymind";
import { searchUserDocuments } from "@/lib/qdrant";
import { selectMastraAgent, type MastraAgentId } from "@/mastra/routing";

export const dynamic = "force-dynamic";
const schema = z.object({
  agent: z.enum(["rassy", "researcher", "knowledge", "coder", "utility"]).default("rassy"),
  mode: z.string().optional(),
  webSearch: z.enum(["auto", "on", "off"]).default("auto"),
  activeDocumentIds: z.array(z.string()).max(50).default([]),
  threadId: z.string().min(1).max(200),
  messages: z.array(z.object({ role: z.enum(["user", "assistant", "system"]), content: z.string().min(1).max(50000) })).min(1).max(60)
});

export async function POST(request: NextRequest) {
  const user = await getUserForSessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return Response.json({ ok: false, error: "invalid_request" }, { status: 400 });
  if (!user && parsed.data.activeDocumentIds.length) return Response.json({ ok: false, error: "auth_required" }, { status: 401 });
  try {
    const latestUserMessage = [...parsed.data.messages].reverse().find((message) => message.role === "user");
    let messages = parsed.data.messages;
    const knowledgeRequested = parsed.data.mode === "knowledge" || parsed.data.activeDocumentIds.length > 0;
    if (latestUserMessage && knowledgeRequested && parsed.data.activeDocumentIds.length) {
      const documentIds = await getReadyDocumentIdsForUser(user!.id, parsed.data.activeDocumentIds);
      if (documentIds.length) {
        const [vector] = await embedTexts([latestUserMessage.content]);
        const found = await searchUserDocuments({ userId: user!.id, documentIds, vector, limit: 6 });
        let ranked = found;
        try {
          const order = await rerankTexts(latestUserMessage.content, found.map((item) => item.payload?.text ?? ""));
          if (order.length) ranked = order.map((index) => found[index]).filter(Boolean);
        } catch {
          // Vector similarity is the bounded fallback when reranking is unavailable.
        }
        const context = buildDocumentContextMessage(ranked.filter((item) => item.payload?.text && item.payload.document_title).map((item) => ({ documentTitle: item.payload?.document_title ?? "Document", text: item.payload?.text ?? "", score: item.score })));
        if (context) messages = [context, ...messages];
      }
    }
    const searchRequested = parsed.data.webSearch === "on" || (parsed.data.webSearch === "auto" && Boolean(latestUserMessage && shouldUseWebSearch(latestUserMessage.content)));
    const selectedAgent = selectMastraAgent({ requestedAgent: parsed.data.agent as MastraAgentId, mode: parsed.data.mode, searchRequested });
    const result = await streamMastraChat({ agent: agentRegistry[selectedAgent], messages, threadId: parsed.data.threadId, resourceId: user?.id ?? `guest:${parsed.data.threadId}`, signal: request.signal });
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let searched = false;
        let searchStatus: "used" | "failed" | "empty" | "not-used" = searchRequested ? "empty" : "not-used";
        let answerText = "";
        const returnedUrls = new Set<string>();
        const send = (event: string, data: unknown) => controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        try {
          for await (const part of result.fullStream as AsyncIterable<{ type: string; textDelta?: string; toolName?: string; toolCallId?: string; output?: unknown; error?: unknown }>) {
            if (part.type === "tool-call" || part.type === "tool-call-streaming-start" || part.type === "tool-call-delta") {
              if (part.toolName === "webSearch" || part.toolName === "web-search") { searched = true; send("activity", { status: "searching", tool: "web-search", toolCallId: part.toolCallId }); }
            } else if (part.type === "tool-result") {
              if (part.toolName === "webSearch" || part.toolName === "web-search") {
                const output = part.output as { status?: string; results?: Array<{ title: string; url: string; source?: string; publishedAt?: string; snippet: string }> } | undefined;
                searchStatus = output?.status === "ok" ? "used" : output?.status === "failed" ? "failed" : "empty";
                for (const source of output?.results ?? []) returnedUrls.add(source.url);
                send("search", { status: searchStatus, results: output?.results ?? [] });
              }
            } else if (part.type === "text-delta" && part.textDelta) {
              answerText += part.textDelta;
              send("text", { delta: part.textDelta });
            } else if (part.type === "error") {
              send("error", { message: "Mastra execution failed" });
            }
          }
          const unsupported = searched ? unsupportedCitationUrls(answerText, [...returnedUrls]) : [];
          if (unsupported.length) send("citation-warning", { status: "unsupported", count: unsupported.length });
          send("complete", { searchStatus: searched ? searchStatus : "not-used", citationStatus: unsupported.length ? "unsupported" : searched ? "verified" : "not-applicable" });
          controller.close();
        } catch {
          send("error", { message: "Mastra execution failed" });
          controller.close();
        }
      }
    });
    return new Response(stream, { headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store", connection: "keep-alive", "x-rassy-agent": selectedAgent, "x-rassy-thread-id": parsed.data.threadId, "x-rassy-web-search": searchRequested ? "delegated-to-mastra" : "not-requested" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Mastra agent failed";
    return new Response(message, { status: /429|503|busy/i.test(message) ? 429 : 502 });
  }
}
