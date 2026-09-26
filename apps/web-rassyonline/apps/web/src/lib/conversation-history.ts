import { conversationMemory } from "@/mastra/agents";
import { findThreadForUser, listMessagesForThread, listThreadsForUser } from "@/lib/chat-store";

export async function listConversationThreads(userId: string) {
  const [mastra, legacy] = await Promise.all([
    conversationMemory.listThreads({ filter: { resourceId: userId }, perPage: 50 }),
    listThreadsForUser(userId)
  ]);
  const byId = new Map(legacy.map((thread) => [thread.id, thread]));
  for (const thread of mastra.threads) byId.set(thread.id, {
    id: thread.id, userId, title: thread.title || "Conversation", mode: "general",
    createdAt: thread.createdAt, updatedAt: thread.updatedAt
  });
  return [...byId.values()].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()).slice(0, 50);
}

export async function getConversationForUser(threadId: string, userId: string) {
  const [mastraThread, legacyThread] = await Promise.all([
    conversationMemory.getThreadById({ threadId, resourceId: userId }),
    findThreadForUser(threadId, userId)
  ]);
  if (mastraThread) {
    const [recalled, legacyMessages] = await Promise.all([
      conversationMemory.recall({ threadId, resourceId: userId, perPage: false }),
      legacyThread ? listMessagesForThread(threadId, userId) : Promise.resolve([])
    ]);
    const currentMessages = recalled.messages.filter((message) => message.role === "user" || message.role === "assistant").map((message) => ({
      id: message.id, threadId, role: message.role, createdAt: message.createdAt,
      content: message.content.parts.filter((part): part is Extract<typeof part, { type: "text" }> => part.type === "text").map((part) => part.text).join("")
    })).filter((message) => message.content);
    return {
      thread: { id: mastraThread.id, userId, title: mastraThread.title || "Conversation", mode: "general", createdAt: mastraThread.createdAt, updatedAt: mastraThread.updatedAt },
      messages: [...legacyMessages, ...currentMessages].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    };
  }
  return legacyThread ? { thread: legacyThread, messages: await listMessagesForThread(threadId, userId) } : null;
}
