import { describe, expect, it, vi } from "vitest";
import { OpenAICompatibleProvider } from "@/lib/ai/openai-compatible";

describe("OpenAI-compatible provider", () => {
  it("lists models and preserves bearer authentication", async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => new Response(JSON.stringify({ data: [{ id: "rassy-fast", owned_by: "local" }] }), { status: 200, headers: { "content-type": "application/json" } }));
    const provider = new OpenAICompatibleProvider({ baseUrl: "http://provider/v1/", apiKey: "secret", fetcher });
    await expect(provider.listModels()).resolves.toEqual([{ id: "rassy-fast", ownedBy: "local" }]);
    expect(fetcher.mock.calls[0][0]).toBe("http://provider/v1/models");
    expect((fetcher.mock.calls[0][1] as RequestInit).headers).toMatchObject({ authorization: "Bearer secret" });
  });

  it("normalizes streamed OpenAI SSE deltas", async () => {
    const body = new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"hello"}}]}\n\ndata: {"choices":[{"delta":{"content":" world"}}]}\n\ndata: [DONE]\n\n')); controller.close(); } });
    const fetcher = vi.fn(async () => new Response(body, { status: 200 }));
    const provider = new OpenAICompatibleProvider({ baseUrl: "http://provider/v1", fetcher });
    const events = [];
    for await (const event of provider.stream({ modelId: "rassy-fast", messages: [{ role: "user", content: "hi" }] })) events.push(event);
    expect(events).toEqual([{ type: "text.delta", text: "hello" }, { type: "text.delta", text: " world" }, { type: "completed", response: { model: "rassy-fast", text: "hello world" } }]);
  });
});
