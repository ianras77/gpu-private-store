import { describe, expect, it } from "vitest";
import { readRassyMindCapabilities, requireRassyMindCapability } from "../index";

describe("RassyMind capability contract", () => {
  it("fails closed when structured output is not qualified", () => {
    const env = { ASTRO_RASSYMIND_FAST_MODEL: "rassy-fast", RASSYMIND_CAPABILITIES_JSON: JSON.stringify({ "rassy-fast": { chat: true, structuredOutput: false, tools: false, streaming: false } }) };
    expect(readRassyMindCapabilities(env)["rassy-fast"]?.structuredOutput).toBe(false);
    expect(() => requireRassyMindCapability("rassy-fast", "structuredOutput", env)).toThrow(/not qualified/);
  });
  it("accepts a qualified lane", () => {
    const env = { RASSYMIND_CAPABILITIES_JSON: JSON.stringify({ "rassy-mind": { chat: true, structuredOutput: true, tools: true, streaming: true } }) };
    expect(requireRassyMindCapability("rassy-mind", "structuredOutput", env)).toBe("rassy-mind");
  });
});
