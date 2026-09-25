import { describe, expect, it } from "vitest";
import { agentForMode, buildExecutionBrief, maxStepsForMode, selectMastraAgent, taskShape } from "./routing";

describe("Mastra automatic routing", () => {
  it("keeps ordinary conversation on Rassy", () => {
    expect(selectMastraAgent({ mode: "general", searchRequested: false })).toBe("rassy");
  });

  it("promotes freshness-sensitive requests to research", () => {
    expect(selectMastraAgent({ mode: "general", searchRequested: true })).toBe("researcher");
  });

  it("keeps research capability selection separate from plain chat", () => {
    expect(selectMastraAgent({ mode: "general", searchRequested: false })).not.toBe("researcher");
  });

  it("keeps explicit coding focus as a secondary preference", () => {
    expect(agentForMode("deep-coding")).toBe("coder");
    expect(selectMastraAgent({ mode: "deep-coding", searchRequested: true })).toBe("coder");
  });

  it("does not expose provider lanes for the quick preference", () => {
    expect(agentForMode("quick")).toBe("utility");
  });

  it("budgets tool loops by task shape", () => {
    expect(maxStepsForMode("quick", "utility")).toBe(3);
    expect(maxStepsForMode("deep-coding", "coder")).toBe(12);
    expect(maxStepsForMode("general", "researcher")).toBe(10);
  });

  it("creates an execution posture for intelligent task completion", () => {
    expect(taskShape("implement and verify this change", { mode: "general", searchRequested: false })).toBe("build");
    expect(taskShape("compare these current options", { mode: "general", searchRequested: true })).toBe("research");
    expect(buildExecutionBrief("implement and verify this change", { mode: "general", searchRequested: false })).toContain("verify outputs");
    expect(maxStepsForMode("general", "rassy", "build")).toBe(12);
  });
});
