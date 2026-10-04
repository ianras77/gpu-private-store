import { describe, expect, it } from "vitest";
import { toPublicTrack } from "../library/public-track";
import type { Track } from "../library/types";

describe("public track serialization", () => {
  it("keeps MStream credentials out of public metadata", () => {
    const track: Track = {
      id: "track-1234",
      path: "https://mstream.example/media/song.flac?token=private-stream-token",
      title: "A Song",
      artist: "An Artist",
      albumArtUrl:
        "https://mstream.example/album-art/cover.jpg?compress=l&token=private-art-token",
      energy: 0.5,
      moodTags: [],
      hasArtwork: false,
    };

    const publicTrack = toPublicTrack(track);

    expect(publicTrack.hasArtwork).toBe(true);
    expect(JSON.stringify(publicTrack)).not.toContain("private-stream-token");
    expect(JSON.stringify(publicTrack)).not.toContain("private-art-token");
    expect(publicTrack).not.toHaveProperty("streamUrl");
    expect(publicTrack).not.toHaveProperty("albumArtUrl");
  });
});
