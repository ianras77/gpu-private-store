import { describe, expect, it } from "vitest";
import { modelForAgent, parseModelCapability } from "./model-capabilities";

describe("model capability adapter", () => {
  it("fails closed for absent or stale metadata and caps output", () => {
    expect(parseModelCapability("rassy-agent", null).streaming).toBe("unknown");
    expect(parseModelCapability("rassy-agent", { status: "qualified", features: { streaming: "qualified", tools: "supported" }, max_output_tokens: 99999 })).toEqual({ model: "rassy-agent", status: "qualified", streaming: "qualified", tools: "supported", maxOutputTokens: 8192 });
    expect(modelForAgent("coder")).toBe("rassy-code");
  });
});
