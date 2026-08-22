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
  extractDeltaFromSseLine,
  getChatMode,
  getRassyMindChatUrl,
  getRassyMindRequestError
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
  webSearch: z.enum(["auto", "on", "off"]).optional()
});

export async function POST(request: NextRequest) {
  const parsed = chatRequestSchema.parse(await request.json());
  const mode = getChatMode(parsed.mode);
  const user = await getUserForSessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  const latestUserMessage = [...parsed.messages].reverse().find((message) => message.role === "user");
  let upstreamMessages = parsed.messages;
  let usedWebSearch = false;

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
      const contextMessage = buildDocumentContextMessage(
        retrieved
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
      try {
        const searchContext = buildSearchContextMessage(await searchWebResources(latestUserMessage.content));
        if (searchContext) {
          upstreamMessages = [searchContext, ...upstreamMessages];
          usedWebSearch = true;
        }
      } catch {
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
      temperature: 0.7,
      max_tokens: mode.maxTokens,
      max_completion_tokens: mode.maxTokens,
      think: mode.thinking,
      reasoning_effort: mode.thinking ? "medium" : "none"
    })
  });

  if (!upstream.ok || !upstream.body) {
    const retryable = upstream.status === 429 || upstream.status === 503;
    const headers = retryable && upstream.headers.get("retry-after") ? { "retry-after": upstream.headers.get("retry-after")! } : undefined;
    return new Response(getRassyMindRequestError(upstream.status).message, { status: retryable ? 429 : 502, headers });
  }

  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let assistantText = "";
  let buffer = "";

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = upstream.body!.getReader();
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split(/\r?\n/);
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            const delta = extractDeltaFromSseLine(line);
            if (delta) {
              assistantText += delta;
              controller.enqueue(encoder.encode(delta));
            }
          }
        }

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
      "x-rassy-web-search": usedWebSearch ? "used" : "not-used"
    }
  });
}
