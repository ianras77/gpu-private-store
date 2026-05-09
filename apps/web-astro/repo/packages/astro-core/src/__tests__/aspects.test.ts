import { describe, it, expect } from "vitest";
import { detectAspects } from "../aspects";
import type { ChartPoint } from "../types";

const mockPoint = (key: string, degree: number): ChartPoint => ({
  key,
  type: "planet",
  degree,
  sign: "Aries",
  signDegree: 0
});

describe("detectAspects", () => {
  it("finds conjunctions and oppositions", () => {
    const points = [mockPoint("Sun", 0), mockPoint("Moon", 2), mockPoint("Mars", 180)];
    const aspects = detectAspects(points);
    const types = aspects.map((aspect) => aspect.type);
    expect(types).toContain("conjunction");
    expect(types).toContain("opposition");
  });
});
