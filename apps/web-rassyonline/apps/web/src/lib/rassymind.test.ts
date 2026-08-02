import { afterEach, describe, expect, test, vi } from "vitest";
import {
  embedTexts,
  extractDeltaFromSseLine,
  getChatMode,
  getRassyMindChatUrl,
  getRassyMindEmbeddingsUrl
} from "./rassymind";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("RassyMind mode mapping", () => {
  test("maps friendly modes to exact RassyMind model ids", () => {
    expect(getChatMode("general").model).toBe("rassy-smart");
    expect(getChatMode("deep-coding").model).toBe("rassy-code");
    expect(getChatMode("fast-coding").model).toBe("rassy-fast");
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
});

describe("embedTexts", () => {
  test("uses only the RassyMind environment and optional API key", async () => {
    vi.stubEnv("RASSYMIND_BASE_URL", "http://rassymind.test:9000/");
    vi.stubEnv("RASSYMIND_API_KEY", "mind-secret");
    vi.stubEnv("RASSYCODEX_BASE_URL", "http://retired.test:1111");
    vi.stubEnv("RASSYGPT_BASE_URL", "http://retired.test:2222");
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
});

describe("extractDeltaFromSseLine", () => {
  test("preserves OpenAI-compatible SSE parsing", () => {
    expect(extractDeltaFromSseLine('data: {"choices":[{"delta":{"content":"hello"}}]}')).toBe("hello");
    expect(extractDeltaFromSseLine("data: [DONE]")).toBeNull();
    expect(extractDeltaFromSseLine("event: ping")).toBeNull();
    expect(extractDeltaFromSseLine("data: nope")).toBeNull();
  });
});
