import { describe, expect, it } from "vitest";
import { resolveListenerRecommendationStatus } from "../chat-recommendations";

describe("resolveListenerRecommendationStatus", () => {
  it("keeps a confirmed lane request alive when the summary is real even without concrete track ids", () => {
    expect(
      resolveListenerRecommendationStatus({
        generatedStatus: "accepted",
        recommendationIntent: true,
        hasExplicitRecommendation: false,
        hasRecommendationSummary: true
      })
    ).toBe("accepted");

    expect(
      resolveListenerRecommendationStatus({
        generatedStatus: "considering",
        recommendationIntent: true,
        hasExplicitRecommendation: false,
        hasRecommendationSummary: true
      })
    ).toBe("considering");
  });

  it("promotes an unresolved but recognized request to considering", () => {
    expect(
      resolveListenerRecommendationStatus({
        generatedStatus: null,
        recommendationIntent: true,
        hasExplicitRecommendation: false,
        hasRecommendationSummary: true
      })
    ).toBe("considering");
  });

  it("still suppresses stray recommendation statuses when there is no recommendation signal", () => {
    expect(
      resolveListenerRecommendationStatus({
        generatedStatus: "accepted",
        recommendationIntent: false,
        hasExplicitRecommendation: false,
        hasRecommendationSummary: false
      })
    ).toBe("none");
  });
});
