import { describe, expect, it } from "vitest";
import { normalizeChartValues, pieChartProportions } from "./chart-geometry";

describe("chart geometry", () => {
  it("keeps coordinates finite for opposite extreme finite values", () => {
    const normalized = normalizeChartValues([Number.MAX_VALUE, -Number.MAX_VALUE]);
    expect(normalized).toEqual({ values: [1, -1], minimum: -1, maximum: 1, range: 2 });
  });

  it("scales tiny values to a visible chart range", () => {
    expect(normalizeChartValues([5e-324, 1e-323])?.values).toEqual([0.5, 1]);
  });

  it("rejects empty or non-finite chart series", () => {
    expect(normalizeChartValues([])).toBeNull();
    expect(normalizeChartValues([1, Number.POSITIVE_INFINITY])).toBeNull();
  });

  it("computes pie proportions without overflowing the total", () => {
    expect(pieChartProportions([Number.MAX_VALUE, Number.MAX_VALUE])).toEqual([0.5, 0.5]);
    expect(pieChartProportions([0, 0])).toBeNull();
    expect(pieChartProportions([2, -1])).toBeNull();
  });
});
