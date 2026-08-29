import { describe, expect, it } from "vitest";
import {
  hasStrongSkipReason,
  looksLikeBroadLaneRequest,
  looksLikeMusicContextQuestion,
  looksLikeRecommendationRequest,
  looksLikeSkipRequest
} from "../chat-intents";

describe("looksLikeSkipRequest", () => {
  it("does not misread music-context questions as skip requests", () => {
    expect(looksLikeSkipRequest("Why this Iron Butterfly cut right now?")).toBe(false);
    expect(looksLikeSkipRequest("Give me a deep cut note on the record in the air.")).toBe(false);
    expect(looksLikeSkipRequest("Tell me about the cut in the air.")).toBe(false);
  });

  it("still catches direct skip asks", () => {
    expect(looksLikeSkipRequest("Skip this, it is dragging the room.")).toBe(true);
    expect(looksLikeSkipRequest("Cut this song, it is killing the mood.")).toBe(true);
    expect(looksLikeSkipRequest("Get this off and move on.")).toBe(true);
  });
});

describe("looksLikeMusicContextQuestion", () => {
  it("recognizes music-context prompts without treating them like requests", () => {
    expect(looksLikeMusicContextQuestion("Why this cut right now?")).toBe(true);
    expect(looksLikeMusicContextQuestion("What should I listen for in Right Now by Van Halen?")).toBe(true);
    expect(looksLikeMusicContextQuestion("Give me a deep cut note on the record in the air.")).toBe(true);
  });
});

describe("looksLikeRecommendationRequest", () => {
  it("does not let track-title words fake a request", () => {
    expect(
      looksLikeRecommendationRequest("Why this (You Need Meat) Don't Go No Further right now?")
    ).toBe(false);
    expect(looksLikeRecommendationRequest("Tell me about Right Now by Van Halen.")).toBe(false);
    expect(looksLikeRecommendationRequest("I feel wrecked tonight.")).toBe(false);
    expect(looksLikeBroadLaneRequest("What does this hour feel like to you?")).toBe(false);
  });

  it("still catches direct requests and broad lane asks", () => {
    expect(looksLikeRecommendationRequest("Play Right Now by Van Halen.")).toBe(true);
    expect(looksLikeRecommendationRequest("Can you keep Into the Fourth Dimension by The Orb on the line?")).toBe(
      true
    );
    expect(looksLikeRecommendationRequest("I am wrung out tonight. Give me a lane to stay with.")).toBe(
      true
    );
    expect(looksLikeRecommendationRequest("I need a lane to stay with tonight.")).toBe(true);
    expect(looksLikeBroadLaneRequest("I am wrung out tonight. Give me a lane to stay with.")).toBe(
      true
    );
  });

  it("recognizes natural recommendation questions", () => {
    expect(looksLikeRecommendationRequest("What should I listen to tonight?")).toBe(true);
    expect(looksLikeRecommendationRequest("Pick something strange for me.")).toBe(true);
    expect(looksLikeRecommendationRequest("Surprise me with a record.")).toBe(true);
  });
});

describe("hasStrongSkipReason", () => {
  it("requires a concrete reason instead of a shrug", () => {
    expect(hasStrongSkipReason("skip it")).toBe(false);
    expect(
      hasStrongSkipReason("Skip this because the same energy keeps repeating and it is dragging.")
    ).toBe(true);
  });
});
