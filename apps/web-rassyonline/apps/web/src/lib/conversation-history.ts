import { conversationMemory } from "@/mastra/agents";
import { findThreadForUser, listMessagesForThread, listThreadsForUser } from "@/lib/chat-store";
import { listConversationTurnData, type ConversationArtifact, type ConversationSource, type ConversationTerminalStatus } from "@/lib/conversation-turn-data";

type RestoredMessage = {
  id: string;
  threadId: string;
  role: "user" | "assistant" | "system";
  createdAt: Date;
  content: string;
  sources?: ConversationSource[];
  artifacts?: ConversationArtifact[];
  terminalStatus?: ConversationTerminalStatus;
};

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
    const [recalled, legacyMessages, turnData] = await Promise.all([
      conversationMemory.recall({ threadId, resourceId: userId, perPage: false }),
      legacyThread ? listMessagesForThread(threadId, userId) : Promise.resolve([]),
      listConversationTurnData(threadId, userId)
    ]);
    const currentMessages: RestoredMessage[] = recalled.messages.filter((message): message is typeof message & { role: "user" | "assistant" } => message.role === "user" || message.role === "assistant").map((message) => ({
      id: message.id, threadId, role: message.role, createdAt: message.createdAt,
      content: message.content.parts.filter((part): part is Extract<typeof part, { type: "text" }> => part.type === "text").map((part) => part.text).join("")
    })).filter((message) => message.content);
    const available = new Map<string, typeof turnData>();
    for (const data of turnData) available.set(data.assistantContent, [...(available.get(data.assistantContent) ?? []), data]);
    for (const message of currentMessages) {
      if (message.role !== "assistant") continue;
      const records = available.get(message.content);
      const record = records?.shift();
      if (record) Object.assign(message, { sources: record.sources, artifacts: record.artifacts, terminalStatus: record.terminalStatus });
    }
    return {
      thread: { id: mastraThread.id, userId, title: mastraThread.title || "Conversation", mode: "general", createdAt: mastraThread.createdAt, updatedAt: mastraThread.updatedAt },
      messages: [...legacyMessages, ...currentMessages].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    };
  }
  return legacyThread ? { thread: legacyThread, messages: await listMessagesForThread(threadId, userId) } : null;
}
