import { describe, expect, it } from "vitest";
import { alignQueueEntriesToStartedTrack } from "../queue-align";

describe("alignQueueEntriesToStartedTrack", () => {
  it("realigns stale queue heads to the matched started track", () => {
    const result = alignQueueEntriesToStartedTrack(
      ["snippet:intro", "stale-track", "match-track", "later-track"],
      "match-track"
    );

    expect(result).toEqual({
      entriesToConsume: 3,
      poppedTrackId: "match-track",
      consumedSnippetIds: ["intro"],
      skippedTrackIds: ["stale-track"],
      matched: true
    });
  });

  it("consumes leading snippets even when the started track is not found", () => {
    const result = alignQueueEntriesToStartedTrack(
      ["snippet:intro", "snippet:station-id", "queued-track"],
      "missing-track"
    );

    expect(result).toEqual({
      entriesToConsume: 2,
      poppedTrackId: null,
      consumedSnippetIds: ["intro", "station-id"],
      skippedTrackIds: [],
      matched: false
    });
  });
});

