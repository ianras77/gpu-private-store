import { describe, expect, it, vi } from "vitest";
import { executeAdaptiveResearch } from "./adaptive-research";

describe("adaptive research", () => {
  it("runs distinct lanes and skips queries already used in the turn", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ results: [{ title: "Result", url: "https://example.org/result", content: "fresh evidence" }] }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await executeAdaptiveResearch({ goal: "check both sides", queries: [{ query: "already used" }, { query: "new evidence" }] }, ["already used"]);
    expect(result.skipped).toEqual(["already used"]);
    expect(result.searches).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
