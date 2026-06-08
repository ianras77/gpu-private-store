import { describe, expect, it } from "vitest";
import { planSnippetBumperCluster } from "../snippets/clusters";

const sequenceRandom = (...values: number[]) => {
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)] ?? 0;
};

describe("planSnippetBumperCluster", () => {
  it("skips random snippets when the station chance misses", () => {
    expect(
      planSnippetBumperCluster({
        hasPrimarySnippet: false,
        allowRandomFallback: true,
        snippetChance: 0.25,
        clusterChance: 0.75,
        maxCluster: 3,
        random: () => 0.9
      })
    ).toBe(0);
  });

  it("keeps a primary DJ-picked snippet and can extend it into a three-cut cluster", () => {
    expect(
      planSnippetBumperCluster({
        hasPrimarySnippet: true,
        allowRandomFallback: false,
        snippetChance: 0,
        clusterChance: 0.75,
        maxCluster: 3,
        random: sequenceRandom(0.2, 0.3)
      })
    ).toBe(3);
  });

  it("starts random bumper clusters from the random snippet chance", () => {
    expect(
      planSnippetBumperCluster({
        hasPrimarySnippet: false,
        allowRandomFallback: true,
        snippetChance: 0.45,
        clusterChance: 0.75,
        maxCluster: 3,
        random: sequenceRandom(0.1, 0.2, 0.95)
      })
    ).toBe(2);
  });
});
