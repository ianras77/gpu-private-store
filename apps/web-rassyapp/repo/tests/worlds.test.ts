import { describe, expect, it } from "vitest";
import {
  buildWorldRecipe,
  listMapPatternsForTemplate,
  listWorldProfilesForTemplate
} from "@/lib/studio/worlds";

describe("world generation helpers", () => {
  it("filters world profiles by template when possible", () => {
    const profiles = listWorldProfilesForTemplate("speed-sprint");
    expect(profiles.length).toBeGreaterThan(0);
    expect(profiles.every((profile) => profile.starterTemplates.includes("speed-sprint"))).toBe(true);
  });

  it("filters map patterns by template and profile when possible", () => {
    const patterns = listMapPatternsForTemplate({
      templateSlug: "story-quest",
      worldProfileSlug: "forest-camp"
    });
    expect(patterns.length).toBeGreaterThan(0);
    expect(patterns.every((pattern) => pattern.starterTemplates.includes("story-quest"))).toBe(true);
  });

  it("builds a recipe with zones, packs, and crew lines", () => {
    const recipe = buildWorldRecipe({
      templateSlug: "obby-rush",
      worldProfileSlug: "sky-islands",
      mapPatternSlug: "island-hop-chain",
      theme: "Candy sky",
      heroGoal: "Reach the golden flag",
      selectedAssetPackSlugs: ["happy-obby-pieces"]
    });

    expect(recipe.headline).toContain("Sky Islands");
    expect(recipe.zoneSequence.length).toBeGreaterThanOrEqual(4);
    expect(recipe.recommendedAssetPackSlugs).toContain("happy-obby-pieces");
    expect(recipe.promptLines.some((line) => line.includes("World profile"))).toBe(true);
    expect(recipe.crewLines.length).toBeGreaterThanOrEqual(3);
  });
});
