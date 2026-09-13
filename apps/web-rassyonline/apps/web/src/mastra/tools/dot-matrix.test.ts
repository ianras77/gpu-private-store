import { describe, expect, it } from "vitest";
import { makeDotMatrixSvg } from "./dot-matrix";

describe("dot-matrix tool", () => {
  it("creates bounded, printable monochrome SVG output", () => {
    const svg = makeDotMatrixSvg("rosette", "Test study", "stable-seed");
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="500" height="500"/);
    expect(svg).toContain("<rect width=\"500\" height=\"500\" fill=\"white\"/>");
    expect(svg).toContain("<g fill=\"black\">");
    expect((svg.match(/<circle /g) ?? []).length).toBeGreaterThan(100);
    expect(svg).not.toContain("<script");
  });
});
