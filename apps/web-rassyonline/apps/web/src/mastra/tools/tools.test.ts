import { describe, expect, it } from "vitest";
import { calculate } from "./calculator";
import { readPublicPage } from "./page-reader";
import { currentTime, isCurrentTimeQuestion } from "./time";

describe("Mastra utility tools", () => {
  it("calculates arithmetic without code evaluation", async () => {
    expect(calculate("(1847 * 39) / 3")).toBe(24011);
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
});
