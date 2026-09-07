import { NextRequest } from "next/server";
import { z } from "zod";
import { SESSION_COOKIE } from "@/lib/auth/sessions";
import { getUserForSessionToken } from "@/lib/auth/users";
import { appendMessage, createThread, findThreadForUser } from "@/lib/chat-store";
import { buildDocumentContextMessage } from "@/lib/document-memory";
import { getReadyDocumentIdsForUser } from "@/lib/documents";
import { searchUserDocuments } from "@/lib/qdrant";
import {
  embedTexts,
  extractDeltaPayloadFromSseLine,
  getChatMode,
  getRassyMindChatUrl,
  getRassyMindRequestError,
  rerankTexts
} from "@/lib/rassymind";
import { buildSearchContextMessage, searchWebResources, shouldUseWebSearch } from "@/lib/web-search";

export const dynamic = "force-dynamic";

const chatMessageSchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.string().min(1).max(50000)
});

const chatRequestSchema = z.object({
  mode: z.string().optional(),
  threadId: z.string().optional().nullable(),
  messages: z.array(chatMessageSchema).min(1).max(60),
  activeDocumentIds: z.array(z.string()).max(50).optional(),
  webSearch: z.enum(["auto", "on", "off"]).optional(),
  temperature: z.number().min(0).max(1.5).optional(),
  maxTokens: z.number().int().min(256).max(8192).optional()
});

const RASSY_VOICE = `You are Rassy: fast, professional, warm, and direct, with a little personality. Use light humor only when it helps. Answer clearly and avoid filler. When fresh facts may have changed, the supplied web context is the result of a real search: use it, cite its URLs naturally, and never say you cannot browse when results are present. When the supplied web context is empty or marked unavailable, say so plainly. When user documents are supplied, ground the answer in them and say when context is missing. Do not invent tools, sources, or capabilities.`;

export async function POST(request: NextRequest) {
  const parsed = chatRequestSchema.parse(await request.json());
  const mode = getChatMode(parsed.mode);
  const user = await getUserForSessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  const latestUserMessage = [...parsed.messages].reverse().find((message) => message.role === "user");
  let upstreamMessages = parsed.messages;
  let attemptedWebSearch = false;
  let usedWebSearch = false;
  let webSearchFailed = false;
  let searchResults: Awaited<ReturnType<typeof searchWebResources>> = [];

  let threadId: string | null = null;
  if (user && latestUserMessage) {
    const existingThread = parsed.threadId ? await findThreadForUser(parsed.threadId, user.id) : null;
    const thread =
      existingThread ??
      (await createThread({
        userId: user.id,
        title: latestUserMessage.content.slice(0, 72),
        mode: mode.id
      }));
    threadId = thread.id;
    await appendMessage({
      threadId,
      role: "user",
      content: latestUserMessage.content,
      mode: mode.id,
      model: mode.model
    });
  }

  if (user && latestUserMessage && parsed.activeDocumentIds?.length) {
    const documentIds = await getReadyDocumentIdsForUser(user.id, parsed.activeDocumentIds);
    if (documentIds.length) {
      const [queryVector] = await embedTexts([latestUserMessage.content]);
      const retrieved = await searchUserDocuments({
        userId: user.id,
        documentIds,
        vector: queryVector,
        limit: 6
      });
      let ranked = retrieved;
      try {
        const order = await rerankTexts(latestUserMessage.content, retrieved.map((item) => item.payload?.text ?? ""));
        if (order.length) ranked = order.map((index) => retrieved[index]).filter(Boolean);
      } catch {
        // Vector similarity remains a useful, bounded fallback when the optional rerank lane is busy.
      }
      const contextMessage = buildDocumentContextMessage(
        ranked
          .filter((item) => item.payload?.text && item.payload.document_title)
          .map((item) => ({
            documentTitle: item.payload?.document_title ?? "Document",
            text: item.payload?.text ?? "",
            score: item.score
          }))
      );
      if (contextMessage) {
        upstreamMessages = [contextMessage, ...parsed.messages];
      }
    }
  }

  if (latestUserMessage) {
    const searchMode = parsed.webSearch ?? "auto";
    const shouldSearch = searchMode === "on" || (searchMode === "auto" && shouldUseWebSearch(latestUserMessage.content));
    if (shouldSearch) {
      attemptedWebSearch = true;
      try {
        searchResults = await searchWebResources(latestUserMessage.content);
        const searchContext = buildSearchContextMessage(searchResults);
        if (searchContext) {
          upstreamMessages = [searchContext, ...upstreamMessages];
          usedWebSearch = true;
        } else {
          webSearchFailed = true;
          upstreamMessages = [{ role: "system", content: "Live web search returned no usable results for this request. Do not claim that you searched; answer only from known context and clearly state that no usable web results were found." }, ...upstreamMessages];
        }
      } catch {
        webSearchFailed = true;
        const searchFailed = {
          role: "system" as const,
          content:
            "The user allowed web search, but search.rasies.com was unavailable for this request. Answer from available context and say that live search could not be reached if freshness matters."
        };
        upstreamMessages = [searchFailed, ...upstreamMessages];
      }
    }
  }

  const baseUrl = process.env.RASSYMIND_BASE_URL ?? "http://host.docker.internal:8844";
  // Qwen's chat template accepts a single system message, and it must be first.
  // Search, document memory, and the Rassy voice are all system context, so merge
  // them instead of placing additional system messages after the conversation.
  const systemContext = upstreamMessages
    .filter((message) => message.role === "system")
    .map((message) => message.content.trim())
    .filter(Boolean);
  const conversationMessages = upstreamMessages.filter((message) => message.role !== "system");
  upstreamMessages = [
    { role: "system", content: [RASSY_VOICE, ...systemContext].join("\n\n") },
    ...conversationMessages
  ];
  const upstream = await fetch(getRassyMindChatUrl(baseUrl), {
    method: "POST",
    signal: AbortSignal.timeout(10 * 60 * 1000),
    headers: {
      "content-type": "application/json",
      ...(process.env.RASSYMIND_API_KEY ? { authorization: `Bearer ${process.env.RASSYMIND_API_KEY}` } : {})
    },
    body: JSON.stringify({
      model: mode.model,
      messages: upstreamMessages,
      stream: true,
      temperature: parsed.temperature ?? 0.7,
      max_tokens: parsed.maxTokens ?? mode.maxTokens,
      reasoning_effort: mode.reasoningEffort
    })
  });

  if (!upstream.ok || !upstream.body) {
    const retryable = upstream.status === 429 || upstream.status === 503;
    const headers = retryable && upstream.headers.get("retry-after") ? { "retry-after": upstream.headers.get("retry-after")! } : undefined;
    const detail = (await upstream.text()).trim();
    return new Response(detail || getRassyMindRequestError(upstream.status).message, { status: retryable ? 429 : 502, headers });
  }

  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let assistantText = "";
  let buffer = "";

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = upstream.body!.getReader();
      try {
        const consumeLine = (line: string) => {
          const payload = extractDeltaPayloadFromSseLine(line);
          if (payload?.reasoning) controller.enqueue(encoder.encode(`<think>${payload.reasoning}</think>`));
          if (payload?.content) {
            assistantText += payload.content;
            controller.enqueue(encoder.encode(payload.content));
          }
        };
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split(/\r?\n/);
          buffer = lines.pop() ?? "";

          for (const line of lines) consumeLine(line);
        }
        buffer += decoder.decode();
        if (buffer.trim()) consumeLine(buffer);

        if (threadId && assistantText.trim()) {
          await appendMessage({
            threadId,
            role: "assistant",
            content: assistantText,
            mode: mode.id,
            model: mode.model
          });
        }
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    }
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
      ...(threadId ? { "x-thread-id": threadId } : {}),
      "x-rassy-mode": mode.id,
      "x-rassy-model": mode.model,
      "x-rassy-web-search": usedWebSearch ? "used" : webSearchFailed ? "failed" : attemptedWebSearch ? "empty" : "not-used",
      ...(searchResults.length ? {
        // Keep transport metadata small; full snippets stay in the model context.
        "x-rassy-search-results": encodeURIComponent(JSON.stringify(searchResults.map(({ title, url }) => ({ title, url }))))
      } : {})
    }
  });
}
