import { NextRequest } from "next/server";
import { z } from "zod";
import { SESSION_COOKIE } from "@/lib/auth/sessions";
import { getUserForSessionToken } from "@/lib/auth/users";
import { appendMessage, createThread, findThreadForUser } from "@/lib/chat-store";
import { buildDocumentContextMessage } from "@/lib/document-memory";
import { getReadyDocumentIdsForUser } from "@/lib/documents";
import { searchUserDocuments } from "@/lib/qdrant";
import { embedTexts, extractDeltaFromSseLine, getChatMode, getRassyCodexChatUrl } from "@/lib/rassycodex";

export const dynamic = "force-dynamic";

const chatMessageSchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.string().min(1).max(50000)
});

const chatRequestSchema = z.object({
  mode: z.string().optional(),
  threadId: z.string().optional().nullable(),
  messages: z.array(chatMessageSchema).min(1).max(60),
  activeDocumentIds: z.array(z.string()).max(50).optional()
});

export async function POST(request: NextRequest) {
  const parsed = chatRequestSchema.parse(await request.json());
  const mode = getChatMode(parsed.mode);
  const user = await getUserForSessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  const latestUserMessage = [...parsed.messages].reverse().find((message) => message.role === "user");
  let upstreamMessages = parsed.messages;

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

  const baseUrl = process.env.RASSYCODEX_BASE_URL ?? "http://host.docker.internal:8844";
  const upstream = await fetch(getRassyCodexChatUrl(baseUrl), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(process.env.RASSYCODEX_API_KEY ? { authorization: `Bearer ${process.env.RASSYCODEX_API_KEY}` } : {})
    },
    body: JSON.stringify({
      model: mode.model,
      messages: upstreamMessages,
      stream: true,
      temperature: 0.7
    })
  });

  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text().catch(() => "");
    return new Response(`RassyCodex request failed: ${upstream.status} ${text}`.trim(), { status: 502 });
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
      "x-rassy-model": mode.model
    }
  });
}
