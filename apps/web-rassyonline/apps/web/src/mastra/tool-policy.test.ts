import { describe, expect, it } from "vitest";
import { buildToolExecutionContext, isResearchToolName, normalizeToolName, toolFailureText } from "./tool-policy";

describe("tool execution policy", () => {
  it("normalizes Mastra and provider tool naming variants", () => {
    expect(normalizeToolName("adaptive-research")).toBe("adaptiveresearch");
    expect(isResearchToolName("parallelResearch")).toBe(true);
  });

  it("gives the model an executable matrix contract", () => {
    expect(buildToolExecutionContext("solve this matrix equation")).toContain("operation=solve");
    expect(buildToolExecutionContext("chart these values")).toContain("bar, line, scatter, or pie");
  });

  it("keeps tool failures actionable without exposing provider detail", () => {
    expect(toolFailureText("mathLab")).toContain("math Lab did not complete");
  });
});
