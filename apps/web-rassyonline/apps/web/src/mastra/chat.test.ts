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
      includePriorContext: true,
      signal,
      messages: [
        { role: "user", content: "earlier" },
        { role: "assistant", content: "old answer" },
        { role: "user", content: "latest" }
      ]
    });
    expect(stream).toHaveBeenCalledWith("latest", expect.objectContaining({ memory: { thread: "thread-1", resource: "resource-1" }, abortSignal: signal }));
    const options = stream.mock.calls[0]?.[1] as { context?: Array<{ content: string }> };
    expect(options.context?.[0]?.content).toContain("earlier");
    expect(options.context?.[0]?.content).toContain("old answer");
  });

  it("requires a tool for research turns", async () => {
    const stream = vi.fn().mockResolvedValue({ fullStream: (async function* () {})() });
    await streamMastraChat({ agent: { stream } as never, threadId: "t", resourceId: "r", toolChoice: "required", messages: [{ role: "user", content: "research this" }] });
    expect(stream).toHaveBeenCalledWith("research this", expect.objectContaining({ toolChoice: "required" }));
  });

  it("forces a specifically requested tool on the first step, then permits the answer step", async () => {
    const stream = vi.fn().mockResolvedValue({ fullStream: (async function* () {})() });
    await streamMastraChat({ agent: { stream } as never, threadId: "t", resourceId: "r", toolChoice: { type: "tool", toolName: "diagramStudio" }, messages: [{ role: "user", content: "create a diagram" }] });
    const options = stream.mock.calls[0]?.[1] as { toolChoice?: unknown; prepareStep?: unknown };
    const prepareStep = options.prepareStep as unknown as ((input: { stepNumber: number }) => { toolChoice?: string } | undefined) | undefined;

    expect(options.toolChoice).toEqual({ type: "tool", toolName: "diagramStudio" });
    expect(prepareStep?.({ stepNumber: 0 })).toBeUndefined();
    expect(prepareStep?.({ stepNumber: 1 })).toEqual({ toolChoice: "auto" });
  });

  it("forwards bounded applied generation settings to Mastra", async () => {
    const stream = vi.fn().mockResolvedValue({ fullStream: (async function* () {})() });
    await streamMastraChat({ agent: { stream } as never, threadId: "t", resourceId: "r", temperature: 0.4, maxTokens: 1024, messages: [{ role: "user", content: "hello" }] });
    expect(stream).toHaveBeenCalledWith("hello", expect.objectContaining({ modelSettings: { temperature: 0.4, maxOutputTokens: 1024 } }));
  });

  it("clamps provider tool-loop budgets to the stability envelope", async () => {
    const stream = vi.fn().mockResolvedValue({ fullStream: (async function* () {})() });
    await streamMastraChat({ agent: { stream } as never, threadId: "t", resourceId: "r", maxSteps: 999, messages: [{ role: "user", content: "bounded" }] });
    expect(stream.mock.calls[0]?.[1]).toEqual(expect.objectContaining({ maxSteps: 16 }));
  });
});
