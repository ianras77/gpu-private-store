import { describe, expect, it } from "vitest";
import { resolveLLMRoute } from "../llm";

describe("legacy LLM compatibility boundary", () => {
  it("routes production-compatible configuration through RassyMind", () => {
    const route = resolveLLMRoute({ ASTRO_RASSYMIND_ENABLED: "1", RASSYMIND_API_KEY: "secret", RASSYMIND_BASE_URL: "http://rassymind/v1/" });
    expect(route).toMatchObject({ useRassyMind: true, baseURL: "http://rassymind/v1", model: "rassy-fast", provider: "rassymind" });
  });

  it("fails closed unless the legacy path is explicitly enabled", () => {
    expect(resolveLLMRoute({ OPENAI_API_KEY: "secret", OPENAI_BASE_URL: "http://legacy" }).provider).toBe("unconfigured");
    expect(resolveLLMRoute({ ASTRO_LEGACY_LLM_ENABLED: "1", OPENAI_API_KEY: "secret", OPENAI_BASE_URL: "http://legacy" }).provider).toBe("legacy-openai-compatible");
  });
});
