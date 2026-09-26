import { beforeEach, describe, expect, it, vi } from "vitest";

const memory = vi.hoisted(() => ({ listThreads: vi.fn(), getThreadById: vi.fn(), recall: vi.fn() }));
const legacy = vi.hoisted(() => ({ listThreadsForUser: vi.fn(), findThreadForUser: vi.fn(), listMessagesForThread: vi.fn() }));
const turnData = vi.hoisted(() => ({ listConversationTurnData: vi.fn() }));
vi.mock("@/mastra/agents", () => ({ conversationMemory: memory }));
vi.mock("@/lib/chat-store", () => legacy);
vi.mock("@/lib/conversation-turn-data", () => turnData);

import { getConversationForUser, listConversationThreads } from "./conversation-history";

beforeEach(() => { vi.clearAllMocks(); turnData.listConversationTurnData.mockResolvedValue([]); });

describe("conversation history", () => {
  it("merges Mastra and legacy thread lists without duplicates", async () => {
    const old = new Date("2026-01-01T00:00:00Z");
    const fresh = new Date("2026-02-01T00:00:00Z");
    memory.listThreads.mockResolvedValue({ threads: [{ id: "same", resourceId: "u", title: "Current", createdAt: old, updatedAt: fresh }] });
    legacy.listThreadsForUser.mockResolvedValue([{ id: "same", userId: "u", title: "Old", mode: "general", createdAt: old, updatedAt: old }]);
    const threads = await listConversationThreads("u");
    expect(threads).toHaveLength(1);
    expect(threads[0].title).toBe("Current");
    expect(memory.listThreads).toHaveBeenCalledWith({ filter: { resourceId: "u" }, perPage: 50 });
  });

  it("keeps legacy messages when the same thread gains Mastra messages", async () => {
    const old = new Date("2026-01-01T00:00:00Z");
    const fresh = new Date("2026-02-01T00:00:00Z");
    memory.getThreadById.mockResolvedValue({ id: "t", resourceId: "u", title: "Current", createdAt: old, updatedAt: fresh });
    legacy.findThreadForUser.mockResolvedValue({ id: "t", userId: "u", title: "Old", createdAt: old, updatedAt: old });
    legacy.listMessagesForThread.mockResolvedValue([{ id: "legacy", threadId: "t", role: "user", content: "Earlier", createdAt: old }]);
    memory.recall.mockResolvedValue({ messages: [{ id: "mastra", threadId: "t", role: "assistant", content: { format: 2, parts: [{ type: "text", text: "Current answer" }] }, createdAt: fresh }] });
    const conversation = await getConversationForUser("t", "u");
    expect(conversation?.messages.map((message) => message.content)).toEqual(["Earlier", "Current answer"]);
    expect(memory.recall).toHaveBeenCalledWith({ threadId: "t", resourceId: "u", perPage: false });
  });

  it("restores evidence and artifacts with the persisted assistant turn", async () => {
    const at = new Date("2026-02-01T00:00:00Z");
    memory.getThreadById.mockResolvedValue({ id: "t", resourceId: "u", title: "Current", createdAt: at, updatedAt: at });
    legacy.findThreadForUser.mockResolvedValue(null);
    memory.recall.mockResolvedValue({ messages: [{ id: "m", threadId: "t", role: "assistant", content: { format: 2, parts: [{ type: "text", text: "Answer" }] }, createdAt: at }] });
    turnData.listConversationTurnData.mockResolvedValue([{ assistantContent: "Answer", sources: [{ title: "Source", url: "https://example.com", snippet: "evidence" }], artifacts: [{ kind: "chart" }], terminalStatus: "complete" }]);
    const conversation = await getConversationForUser("t", "u");
    expect(conversation?.messages[0]).toMatchObject({ sources: [{ title: "Source" }], artifacts: [{ kind: "chart" }], terminalStatus: "complete" });
  });

  it("does not return another user's absent thread", async () => {
    memory.getThreadById.mockResolvedValue(null);
    legacy.findThreadForUser.mockResolvedValue(null);
    expect(await getConversationForUser("other", "u")).toBeNull();
  });
});
