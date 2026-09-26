import { afterEach, describe, expect, it, vi } from "vitest";
import { executeParallelResearch } from "./parallel-research";

afterEach(() => vi.restoreAllMocks());

describe("parallel research", () => {
  it("keeps independent result groups and preserves failures", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ results: [{ title: "One", url: "https://one.example", content: "one" }] }), { status: 200, headers: { "content-type": "application/json" } }))
      .mockRejectedValueOnce(new Error("offline"));
    vi.stubGlobal("fetch", fetchMock);
    await expect(executeParallelResearch([{ query: "one" }, { query: "two" }])).resolves.toMatchObject({ searches: [
      { query: "one", status: "ok" },
      { query: "two", status: "failed", results: [] }
    ] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
