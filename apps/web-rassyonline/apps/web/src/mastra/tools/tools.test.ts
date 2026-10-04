import { describe, expect, it, vi } from "vitest";
import { calculate } from "./calculator";
import { readPublicPage } from "./page-reader";
import { currentTime, isCurrentTimeQuestion } from "./time";
import { agentRegistry } from "../agents";
import { toolRegistry } from ".";

describe("Mastra utility tools", () => {
  it("connects every enabled registry tool to at least one agent", async () => {
    const agentTools = await Promise.all(Object.values(agentRegistry).map((agent) => agent.getToolsForExecution({})));
    const reachable = new Set(agentTools.flatMap((tools) => Object.keys(tools)).map((name) => name.replace(/[-_\s]/g, "").toLowerCase()));
    for (const [id, definition] of Object.entries(toolRegistry)) {
      if (definition.enabled) expect(reachable.has(id.replace(/[-_\s]/g, "").toLowerCase()), `${id} should be attached to an agent`).toBe(true);
    }
  });

  it("exposes both search paths to the researcher while keeping local-only turns web-blind", async () => {
    const [researcherToolSet, localToolSet] = await Promise.all([
      agentRegistry.researcher.getToolsForExecution({}),
      agentRegistry["rassy-local"].getToolsForExecution({})
    ]);
    const researcherTools = Object.keys(researcherToolSet).map((name) => name.replace(/[-_\s]/g, "").toLowerCase());
    const localTools = Object.keys(localToolSet).map((name) => name.replace(/[-_\s]/g, "").toLowerCase());
    expect(researcherTools).toEqual(expect.arrayContaining(["websearch", "parallelresearch", "adaptiveresearch", "pagereader"]));
    expect(localTools).not.toEqual(expect.arrayContaining(["websearch", "parallelresearch", "adaptiveresearch", "pagereader"]));
  });

  it("calculates arithmetic without code evaluation", async () => {
    expect(calculate("(1847 * 39) / 3")).toBe(24011);
  });

  it("uses conventional unary-minus and exponent precedence", () => {
    expect(calculate("-2^2")).toBe(-4);
    expect(calculate("2^-2")).toBe(0.25);
    expect(calculate("2^3^2")).toBe(512);
    expect(calculate("(-2)^2")).toBe(4);
  });

  it("supports scientific functions, constants, and powers", () => {
    expect(calculate("sqrt(81) + 2^3 + pi")).toBeCloseTo(20.14159, 4);
    expect(calculate("round(12.6) * abs(-4)")).toBe(52);
  });

  it("rejects non-arithmetic calculator input", async () => {
    expect(() => calculate("process.exit()")).toThrow();
  });

  it("returns a valid timezone result", async () => {
    expect(currentTime("UTC").iso).toMatch(/Z$/);
  });

  it("recognizes current date and time questions", () => {
    expect(isCurrentTimeQuestion("What is the current date?" )).toBe(true);
    expect(isCurrentTimeQuestion("Explain date formatting" )).toBe(false);
  });

  it("rejects private page targets", async () => {
    const result = await readPublicPage("http://127.0.0.1/admin");
    expect(result).toMatchObject({ status: "failed", text: "" });
  });

  it("rejects IPv6 private targets and non-document content", async () => {
    expect(await readPublicPage("http://[::1]/admin")).toMatchObject({ status: "failed", text: "" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("PNG", { status: 200, headers: { "content-type": "image/png" } })));
    expect(await readPublicPage("https://example.com/image")).toMatchObject({ status: "failed", text: "" });
  });
});
