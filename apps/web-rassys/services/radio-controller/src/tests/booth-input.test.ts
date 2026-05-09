import { describe, expect, it } from "vitest";
import { buildBoothInputForContext } from "../booth-input";

describe("buildBoothInputForContext", () => {
  it("keeps booth input that matches the active turn", () => {
    const result = buildBoothInputForContext(
      {
        nowPlaying: { id: "now-track", title: "Now", artist: "Rassy" },
        queuePreview: [{ id: "next-track", title: "Next", artist: "Rassy", energy: 0.5 }]
      },
      {
        djScript: "Live in the room",
        djReason: "Because it belongs now",
        trackIds: ["next-track"],
        playbackPlans: [
          {
            trackId: "next-track",
            mode: "clip"
          },
          {
            trackId: "outside-track",
            mode: "full"
          }
        ]
      }
    );

    expect(result.djScript).toBe("Live in the room");
    expect(result.djReason).toBe("Because it belongs now");
    expect(result.playbackPlans).toEqual([
      {
        trackId: "next-track",
        mode: "clip"
      }
    ]);
  });

  it("drops stale booth input that does not match the active turn", () => {
    const result = buildBoothInputForContext(
      {
        nowPlaying: { id: "now-track", title: "Now", artist: "Rassy" },
        queuePreview: [{ id: "next-track", title: "Next", artist: "Rassy", energy: 0.5 }]
      },
      {
        djScript: "Old booth talk",
        djReason: "Old reason",
        trackIds: ["old-track"]
      }
    );

    expect(result).toEqual({
      djScript: null,
      djReason: null,
      programming: null,
      playbackPlans: []
    });
  });
});

