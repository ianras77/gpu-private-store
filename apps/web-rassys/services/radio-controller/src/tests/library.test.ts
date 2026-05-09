import { describe, expect, it } from "vitest";
import { LibraryStore } from "../library";

const makeTrack = (overrides: Partial<Parameters<LibraryStore["setTracks"]>[0][number]> = {}) => ({
  id: overrides.id ?? "track-1",
  path: overrides.path ?? "/music/track-1.flac",
  title: overrides.title ?? "Midnight City (Remastered 2012)",
  artist: overrides.artist ?? "The Beatles",
  album: overrides.album ?? "Signals",
  energy: overrides.energy ?? 0.5,
  moodTags: overrides.moodTags ?? ["late-night"]
});

describe("LibraryStore.findByTitleArtist", () => {
  it("matches titles even when metadata strips edition markers", () => {
    const store = new LibraryStore();
    store.setTracks([makeTrack()]);

    const matched = store.findByTitleArtist("Midnight City", "The Beatles");
    expect(matched?.id).toBe("track-1");
  });

  it("matches artists when the incoming metadata drops leading articles", () => {
    const store = new LibraryStore();
    store.setTracks([makeTrack({ artist: "The Chemical Brothers" })]);

    const matched = store.findByTitleArtist("Midnight City", "Chemical Brothers");
    expect(matched?.artist).toBe("The Chemical Brothers");
  });
});
