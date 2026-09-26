import { describe, expect, it } from "vitest";
import { buildResearchPlan, buildResearchPlanContext } from "./research-plan";

describe("research planning", () => {
  it("keeps a straightforward lookup to one intent-preserving lane", () => {
    const plan = buildResearchPlan("What is the latest Next.js 15 cache documentation?");
    expect(plan.objective).toBe("lookup");
    expect(plan.queries).toHaveLength(1);
    expect(plan.queries[0]?.query).toContain("Next.js 15 cache");
    expect(plan.requiresPrimarySources).toBe(true);
  });

  it("plans independent lanes for both sides of a comparison", () => {
    const plan = buildResearchPlan("Compare Mastra and LangGraph using official documentation");
    expect(plan.objective).toBe("comparison");
    expect(plan.queries.map((query) => query.purpose)).toEqual(["primary", "left-side", "right-side"]);
    expect(plan.queries.map((query) => query.query).join(" ")).toContain("Mastra official documentation");
    expect(plan.queries.map((query) => query.query).join(" ")).toContain("LangGraph official documentation");
  });

  it("preserves explicit source limits and plans a fresh verification lane", () => {
    const plan = buildResearchPlan("Verify this month's changes to the API using only example.org");
    expect(plan.objective).toBe("verification");
    expect(plan.requiredDomains).toEqual(["example.org"]);
    expect(plan.queries).toHaveLength(2);
    expect(buildResearchPlanContext(plan)).toContain("source_policy=prefer primary or official sources");
  });
});
