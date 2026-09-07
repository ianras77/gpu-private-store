import { describe, expect, it } from "vitest";
import { agentForMode, selectMastraAgent } from "./routing";

describe("Mastra automatic routing", () => {
  it("keeps ordinary conversation on Rassy", () => {
    expect(selectMastraAgent({ mode: "general", searchRequested: false })).toBe("rassy");
  });

  it("promotes freshness-sensitive requests to research", () => {
    expect(selectMastraAgent({ mode: "general", searchRequested: true })).toBe("researcher");
  });

  it("keeps explicit coding focus as a secondary preference", () => {
    expect(agentForMode("deep-coding")).toBe("coder");
    expect(selectMastraAgent({ mode: "deep-coding", searchRequested: true })).toBe("coder");
  });

  it("does not expose provider lanes for the quick preference", () => {
    expect(agentForMode("quick")).toBe("utility");
  });
});
