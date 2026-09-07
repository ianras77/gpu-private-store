import { describe, expect, it } from "vitest";
import { buildSearchContextMessage, normalizeSearchQuery, shouldUseWebSearch } from "./web-search";

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
        "Fresh web context from search.rasies.com. Use it only when relevant, cite URLs in the answer, and say when it is insufficient.\n\n[1] One\nhttps://example.com/one\nFirst useful result.\n\n[2] Two\nhttps://example.com/two\nSecond useful result."
    });
  });
});

describe("normalizeSearchQuery", () => {
  it("removes chat instructions before querying the web", () => {
    expect(normalizeSearchQuery("Please search the web for the latest Python release")).toBe("the latest Python release");
    expect(normalizeSearchQuery("latest Python release")).toBe("latest Python release");
  });
});
