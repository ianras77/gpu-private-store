import { describe, expect, it } from "vitest";
import { calculate } from "./calculator";
import { readPublicPage } from "./page-reader";
import { currentTime } from "./time";

describe("Mastra utility tools", () => {
  it("calculates arithmetic without code evaluation", async () => {
    expect(calculate("(1847 * 39) / 3")).toBe(24011);
  });

  it("rejects non-arithmetic calculator input", async () => {
    expect(() => calculate("process.exit()")).toThrow();
  });

  it("returns a valid timezone result", async () => {
    expect(currentTime("UTC").iso).toMatch(/Z$/);
  });

  it("rejects private page targets", async () => {
    const result = await readPublicPage("http://127.0.0.1/admin");
    expect(result).toMatchObject({ status: "failed", text: "" });
  });
});
