import { afterEach, describe, expect, it, vi } from "vitest";
import { buildSearchContextMessage, executeWebSearch, normalizeSearchQuery, searchQueryForPrompt, shouldUseWebSearch, unsupportedCitationUrls } from "./web-search";

afterEach(() => vi.restoreAllMocks());

describe("shouldUseWebSearch", () => {
  it("detects natural requests for current web resources", () => {
    expect(shouldUseWebSearch("search the web for current Next.js 15 cache docs")).toBe(true);
    expect(shouldUseWebSearch("can you look up recent examples before answering?")).toBe(true);
    expect(shouldUseWebSearch("what is the latest release note for this library?")).toBe(true);
  });

  it("keeps normal local chat internet-blind", () => {
    expect(shouldUseWebSearch("explain this code and suggest a cleaner name")).toBe(false);
  });

  it("recognizes common freshness-sensitive questions", () => {
    expect(shouldUseWebSearch("what is the weather forecast for tomorrow?")).toBe(true);
    expect(shouldUseWebSearch("what is the latest price of this service?")).toBe(true);
  });

  it("does not send the current date to web search", () => {
    expect(shouldUseWebSearch("What is the current date?" )).toBe(false);
  });

  it("cleans conversational search prompts", () => {
    expect(searchQueryForPrompt("Please look up the latest Next.js release notes")).toBe("the latest Next.js release notes");
  });
});

describe("buildSearchContextMessage", () => {
  it("creates compact cited context for the model", () => {
    expect(
      buildSearchContextMessage([
        {
          title: "One",
          url: "https://example.com/one",
          snippet: "First useful result."
        },
        {
          title: "Two",
          url: "https://example.com/two",
          snippet: "Second useful result."
        }
      ])
    ).toEqual({
      role: "system",
      content:
        "AUTHORITATIVE FRESH WEB EVIDENCE: The following results were retrieved for this turn and are available to you now. Answer from this evidence when it addresses the user request. Do not say you cannot browse or claim the search did not happen. If the evidence is insufficient or off-topic, say that plainly and do not invent facts or URLs. Cite only URLs included below.\n\n[1] One\nhttps://example.com/one\nFirst useful result.\n\n[2] Two\nhttps://example.com/two\nSecond useful result."
    });
  });
});

describe("normalizeSearchQuery", () => {
  it("removes chat instructions before querying the web", () => {
    expect(normalizeSearchQuery("Please search the web for the latest Python release")).toBe("the latest Python release");
    expect(normalizeSearchQuery("latest Python release")).toBe("latest Python release");
  });
});

describe("citation provenance", () => {
  it("rejects URLs that were not returned by the search tool", () => {
    expect(unsupportedCitationUrls("See https://example.com/ok and https://fake.example/nope.", ["https://example.com/ok"])).toEqual(["https://fake.example/nope"]);
  });
});

describe("Mastra web-search execution contract", () => {
  it("returns structured source metadata on success", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ results: [{ title: "Docs", url: "https://mastra.ai/docs", content: "Useful passage", publishedDate: "2026-01-01" }] }), { status: 200 })));
    await expect(executeWebSearch({ query: "Mastra docs", max_results: 1 })).resolves.toEqual({ status: "ok", results: [{ title: "Docs", url: "https://mastra.ai/docs", source: "mastra.ai", publishedAt: "2026-01-01", snippet: "Useful passage", status: "ok" }] });
  });

  it("distinguishes empty and failed searches", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ results: [] }), { status: 200 })).mockRejectedValueOnce(new Error("offline")));
    await expect(executeWebSearch({ query: "nothing" })).resolves.toEqual({ status: "empty", results: [] });
    await expect(executeWebSearch({ query: "offline" })).resolves.toEqual({ status: "failed", results: [] });
  });
});
