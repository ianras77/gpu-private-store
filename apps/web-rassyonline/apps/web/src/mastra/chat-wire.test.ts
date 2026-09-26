import { afterEach, describe, expect, it, vi } from "vitest";
import { createOpenAI } from "@ai-sdk/openai";
import { Agent } from "@mastra/core/agent";
import { InMemoryStore } from "@mastra/core/storage";
import { Memory } from "@mastra/memory";
import { streamMastraChat } from "./chat";

afterEach(() => vi.unstubAllGlobals());

describe("installed Mastra provider wire settings", () => {
  it("serializes temperature and output budget into the outgoing request", async () => {
    let requestBody: Record<string, unknown> | null = null;
    vi.stubGlobal("fetch", vi.fn(async (_input: unknown, init?: RequestInit) => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      const chunk = (delta: string, finish: string | null) => `data: ${JSON.stringify({ id: "synthetic", object: "chat.completion.chunk", created: 1, model: "rassy-agent", choices: [{ index: 0, delta: { role: "assistant", content: delta }, finish_reason: finish }] })}\n\n`;
      return new Response(chunk("ok", null) + chunk("", "stop") + "data: [DONE]\n\n", { status: 200, headers: { "content-type": "text/event-stream" } });
    }));
    const provider = createOpenAI({ baseURL: "https://example.invalid/v1", apiKey: "synthetic" });
    const memory = new Memory({ storage: new InMemoryStore({ id: "wire-test" }) });
    const agent = new Agent({ id: "wire-test", name: "wire-test", instructions: "Reply briefly.", model: provider.chat("rassy-agent"), memory });
    const result = await streamMastraChat({ agent, threadId: "wire-thread", resourceId: "wire-user", messages: [{ role: "user", content: "hello" }], temperature: 0.4, maxTokens: 1024, toolChoice: "none" });
    for await (const _part of result.fullStream) { /* consume to completion */ }
    expect(requestBody).toMatchObject({ temperature: 0.4, max_tokens: 1024 });
  });
});
