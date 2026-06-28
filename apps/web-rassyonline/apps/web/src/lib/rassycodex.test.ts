import { describe, expect, test } from "vitest";
import { extractDeltaFromSseLine, getChatMode, getRassyCodexEmbeddingsUrl } from "./rassycodex";

describe("RassyCodex mode mapping", () => {
  test("maps friendly modes to exact RassyCodex model ids", () => {
    expect(getChatMode("general").model).toBe("rassy-general");
    expect(getChatMode("deep-coding").model).toBe("rassy-codex");
    expect(getChatMode("fast-coding").model).toBe("rassy-codex-lite");
    expect(getChatMode("quick").model).toBe("rassy-fast");
  });

  test("falls back to general for unknown modes", () => {
    expect(getChatMode("made-up").id).toBe("general");
  });
});

describe("extractDeltaFromSseLine", () => {
  test("extracts OpenAI-compatible text deltas", () => {
    const line = 'data: {"choices":[{"delta":{"content":"hello"}}]}';

    expect(extractDeltaFromSseLine(line)).toBe("hello");
  });

  test("ignores done and malformed lines", () => {
    expect(extractDeltaFromSseLine("data: [DONE]")).toBeNull();
    expect(extractDeltaFromSseLine("event: ping")).toBeNull();
    expect(extractDeltaFromSseLine("data: nope")).toBeNull();
  });
});

describe("RassyCodex URLs", () => {
  test("builds the OpenAI-compatible embeddings URL", () => {
    expect(getRassyCodexEmbeddingsUrl("http://host.docker.internal:8844/")).toBe("http://host.docker.internal:8844/v1/embeddings");
  });
});
