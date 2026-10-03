import { describe, expect, it } from "vitest";
import { analyzeSeries } from "./data-analysis";

describe("data analysis tool", () => {
  it("returns transparent descriptive statistics", () => {
    expect(analyzeSeries([1, 2, 3, 4], "describe").summary).toMatchObject({ count: 4, minimum: 1, maximum: 4, mean: 2.5, median: 2.5, sum: 10 });
  });
  it("makes chart-ready transformations without inventing observations", () => {
    expect(analyzeSeries([2, 4, 8], "normalize").values).toEqual([0, 0.3333333333, 1]);
    expect(analyzeSeries([2, 4, 8], "cumulative").values).toEqual([2, 6, 14]);
    expect(analyzeSeries([2, 4, 8], "percent-change").values).toEqual([0, 100, 100]);
  });
});
