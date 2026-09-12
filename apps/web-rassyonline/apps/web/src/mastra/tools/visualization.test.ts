import { describe, expect, it } from "vitest";
import { makeAsciiArt } from "./ascii-art";

describe("visualization tools", () => {
  it("creates bounded readable ASCII artifacts", () => {
    const art = makeAsciiArt("bar-chart", "Scores", ["A", "B"], [2, 4]);
    expect(art).toContain("A"); expect(art).toContain("████"); expect(art.split("\n")).toHaveLength(2);
  });
});
