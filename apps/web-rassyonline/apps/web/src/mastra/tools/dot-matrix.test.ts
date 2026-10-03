import { describe, expect, it } from "vitest";
import { makeDotMatrixSvg } from "./dot-matrix";

describe("dot-matrix tool", () => {
  it("creates bounded dark-canvas SVG output", () => {
    const svg = makeDotMatrixSvg("rosette", "Test study", "stable-seed");
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="500" height="500"/);
    expect(svg).toContain("<rect width=\"500\" height=\"500\" fill=\"#0b0d0d\"/>");
    expect(svg).toContain("<g fill=\"#9de8ce\">");
    expect((svg.match(/<circle /g) ?? []).length).toBeGreaterThan(100);
    expect(svg).not.toContain("<script");
  });
});
