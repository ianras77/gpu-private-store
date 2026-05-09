import { describe, it, expect } from "vitest";
import { NatalChartSchema } from "../schema";

const sample = {
  points: [
    {
      key: "Sun",
      type: "planet",
      degree: 120,
      sign: "Leo",
      signDegree: 0,
      house: 5
    }
  ],
  aspects: [
    {
      type: "trine",
      between: ["Sun", "Moon"],
      orb: 2,
      exact: 120
    }
  ],
  houses: {
    system: "placidus",
    cusps: Array.from({ length: 12 }, (_, i) => i * 30)
  },
  meta: {
    timeUnknown: false,
    timezone: "UTC",
    calculatedAt: new Date().toISOString(),
    houseSystem: "placidus"
  }
};

describe("NatalChartSchema", () => {
  it("validates chart JSON", () => {
    expect(() => NatalChartSchema.parse(sample)).not.toThrow();
  });
});
