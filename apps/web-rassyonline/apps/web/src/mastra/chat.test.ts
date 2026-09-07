import { describe, expect, it, vi } from "vitest";
import { streamMastraChat } from "./chat";

describe("Mastra chat transport", () => {
  it("uses the latest turn while preserving durable thread/resource memory", async () => {
    const stream = vi.fn().mockResolvedValue({ fullStream: (async function* () {})() });
    const agent = { stream } as never;
    const signal = new AbortController().signal;
    await streamMastraChat({
      agent,
      threadId: "thread-1",
      resourceId: "resource-1",
      signal,
      messages: [
        { role: "user", content: "earlier" },
        { role: "assistant", content: "old answer" },
        { role: "user", content: "latest" }
      ]
    });
    expect(stream).toHaveBeenCalledWith("latest", expect.objectContaining({ memory: { thread: "thread-1", resource: "resource-1" }, abortSignal: signal }));
  });

  it("requires a tool for research turns", async () => {
    const stream = vi.fn().mockResolvedValue({ fullStream: (async function* () {})() });
    await streamMastraChat({ agent: { stream } as never, threadId: "t", resourceId: "r", toolChoice: "required", messages: [{ role: "user", content: "research this" }] });
    expect(stream).toHaveBeenCalledWith("research this", expect.objectContaining({ toolChoice: "required" }));
  });
});
