import { describe, expect, it } from "vitest";
import { buildToolExecutionContext, diagramToolChoiceForPrompt, isResearchToolName, normalizeToolName, toolFailureText } from "./tool-policy";

describe("tool execution policy", () => {
  it("normalizes Mastra and provider tool naming variants", () => {
    expect(normalizeToolName("adaptive-research")).toBe("adaptiveresearch");
    expect(isResearchToolName("parallelResearch")).toBe(true);
  });

  it("gives the model an executable matrix contract", () => {
    expect(buildToolExecutionContext("solve this matrix equation")).toContain("operation=solve");
    expect(buildToolExecutionContext("chart these values")).toContain("bar, line, scatter, or pie");
  });

  it("forces the native diagram tool for diagram creation requests", () => {
    expect(diagramToolChoiceForPrompt("Create an editable flow diagram with three nodes")).toEqual({ type: "tool", toolName: "diagramStudio" });
    expect(diagramToolChoiceForPrompt("Show me an architecture diagram for this system")).toEqual({ type: "tool", toolName: "diagramStudio" });
    expect(diagramToolChoiceForPrompt("Draw a network topology with services and queues")).toEqual({ type: "tool", toolName: "diagramStudio" });
    expect(diagramToolChoiceForPrompt("Update the diagram to add a retry path")).toEqual({ type: "tool", toolName: "diagramStudio" });
    expect(buildToolExecutionContext("Draw an ERD from these tables")).toContain("call diagramStudio");
    expect(buildToolExecutionContext("Revise the workflow diagram")).toContain("preserve any existing nodes");
    expect(diagramToolChoiceForPrompt("Explain when a diagram tool is useful")).toBeUndefined();
  });

  it("keeps tool failures actionable without exposing provider detail", () => {
    expect(toolFailureText("mathLab")).toContain("math Lab did not complete");
  });
});
