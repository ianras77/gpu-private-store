import { afterEach, describe, expect, test, vi } from "vitest";
import {
  CHAT_MODES,
  embedTexts,
  extractDeltaFromSseLine,
  getChatMode,
  getRassyMindChatUrl,
  getRassyMindEmbeddingsUrl,
  getRassyMindRequestError,
  rerankTexts
} from "./rassymind";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("RassyMind mode mapping", () => {
  test("publishes the exact ordered chat modes", () => {
    expect(CHAT_MODES).toEqual([
      { id: "general", label: "Talk", model: "rassy-mind", maxTokens: 2048, thinking: true, contextWindow: "Mind lane", description: "Reasoning, conversation, and synthesis through the general RassyMind lane." },
      { id: "deep-coding", label: "Deep Code", model: "rassy-code", maxTokens: 4096, thinking: true, contextWindow: "Code lane", description: "High-context coding, systems reasoning, and operator work." },
      { id: "fast-coding", label: "Fast Code", model: "rassy-code", maxTokens: 1536, thinking: false, contextWindow: "Code lane", description: "Focused implementation loops through the same canonical code lane." },
      { id: "quick", label: "Utility", model: "rassy-utility", maxTokens: 768, thinking: false, contextWindow: "Utility lane", description: "Short answers, titles, summaries, and quick transforms." },
      { id: "spark", label: "Spark", model: "rassy-fast", maxTokens: 512, thinking: false, contextWindow: "Fast lane", description: "Low-latency transforms when speed matters more than depth." },
      { id: "knowledge", label: "Knowledge", model: "rassy-mind", maxTokens: 3072, thinking: true, contextWindow: "Mind + vectors", description: "RassyMind reasoning grounded with your selected document vectors." }
    ]);
  });

  test("maps friendly modes to exact RassyMind model ids", () => {
    expect(getChatMode("general").model).toBe("rassy-mind");
    expect(getChatMode("deep-coding").model).toBe("rassy-code");
    expect(getChatMode("fast-coding").model).toBe("rassy-code");
    expect(getChatMode("quick").model).toBe("rassy-utility");
    expect(getChatMode("knowledge").model).toBe("rassy-mind");
  });

  test("falls back to general for unknown modes", () => {
    expect(getChatMode("made-up").id).toBe("general");
  });
});

describe("RassyMind URLs", () => {
  test("builds OpenAI-compatible chat and embeddings URLs", () => {
    expect(getRassyMindChatUrl("http://host.docker.internal:8844/")).toBe(
      "http://host.docker.internal:8844/v1/chat/completions"
    );
    expect(getRassyMindEmbeddingsUrl("http://host.docker.internal:8844/")).toBe(
      "http://host.docker.internal:8844/v1/embeddings"
    );
  });

  test("normalizes a base ending in multiple slashes", () => {
    expect(getRassyMindChatUrl("http://rassymind.test:9000//")).toBe("http://rassymind.test:9000/v1/chat/completions");
    expect(getRassyMindEmbeddingsUrl("http://rassymind.test:9000//")).toBe("http://rassymind.test:9000/v1/embeddings");
  });
});

describe("embedTexts", () => {
  test("uses only the RassyMind environment and optional API key", async () => {
    vi.stubEnv("RASSYMIND_BASE_URL", "http://rassymind.test:9000/");
    vi.stubEnv("RASSYMIND_API_KEY", "mind-secret");
    vi.stubEnv(["RASSY", "CODEX_BASE_URL"].join(""), "http://retired.test:1111");
    vi.stubEnv(["RASSY", "GPT_BASE_URL"].join(""), "http://retired.test:2222");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: [{ embedding: [1, 2] }] }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );

    await expect(embedTexts(["hello"])).resolves.toEqual([[1, 2]]);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://rassymind.test:9000/v1/embeddings",
      expect.objectContaining({
        headers: expect.objectContaining({ authorization: "Bearer mind-secret" })
      })
    );
  });

  test("excludes upstream response bodies from errors", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("fake mind-secret", { status: 503 }));

    const error = await embedTexts(["hello"]).catch((caught: unknown) => caught);
    expect(error).toEqual(new Error("RassyMind request failed with status 503"));
    expect(String(error)).not.toContain("mind-secret");
  });
});

describe("RassyMind request errors", () => {
  test("creates a safe generic chat error", () => {
    const error = getRassyMindRequestError(502);
    expect(error.message).toBe("RassyMind request failed with status 502");
    expect(error.message).not.toContain("mind-secret");
  });
});

describe("RassyMind reranking", () => {
  test("uses the canonical rerank lane and returns relevance order", async () => {
    vi.stubEnv("RASSYMIND_BASE_URL", "http://rassymind.test:9000");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ results: [
      { index: 1, relevance_score: 0.9 }, { index: 0, relevance_score: 0.2 }
    ] }), { status: 200 }));
    await expect(rerankTexts("query", ["one", "two"])).resolves.toEqual([1, 0]);
    expect(fetchMock).toHaveBeenCalledWith("http://rassymind.test:9000/v1/rerank", expect.objectContaining({ method: "POST" }));
  });
});

describe("extractDeltaFromSseLine", () => {
  test("preserves OpenAI-compatible SSE parsing", () => {
    expect(extractDeltaFromSseLine('data: {"choices":[{"delta":{"content":"hello"}}]}')).toBe("hello");
    expect(extractDeltaFromSseLine("data: [DONE]")).toBeNull();
    expect(extractDeltaFromSseLine("event: ping")).toBeNull();
    expect(extractDeltaFromSseLine("data: nope")).toBeNull();
  });
});
