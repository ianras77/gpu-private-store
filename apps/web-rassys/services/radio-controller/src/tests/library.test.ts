import { describe, expect, it } from "vitest";
import { LibraryStore, mergeQuickTracks } from "../library";

const makeTrack = (overrides: Partial<Parameters<LibraryStore["setTracks"]>[0][number]> = {}) => ({
  id: overrides.id ?? "track-1",
  path: overrides.path ?? "/music/track-1.flac",
  title: overrides.title ?? "Midnight City (Remastered 2012)",
  artist: overrides.artist ?? "The Beatles",
  album: overrides.album ?? "Signals",
  energy: overrides.energy ?? 0.5,
  moodTags: overrides.moodTags ?? ["late-night"],
  ...overrides
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

describe("mergeQuickTracks", () => {
  it("keeps fully indexed metadata and artwork when the fast filesystem scan runs", () => {
    const indexed = makeTrack({
      id: "track-art",
      path: "/music/record.flac",
      title: "The Real Title",
      artist: "The Real Artist",
      album: "The Real Album",
      hasArtwork: true,
      duration: 245,
      format: "FLAC",
      lossless: true,
      sampleRate: 96_000,
      bitsPerSample: 24
    });
    const quickFallback = {
      ...makeTrack({
        id: "track-art",
        path: "/music/record.flac",
        title: "record",
        artist: "Unknown Artist"
      }),
      format: "FLAC"
    };

    expect(mergeQuickTracks([indexed], [quickFallback])).toEqual([
      expect.objectContaining({
        title: "The Real Title",
        artist: "The Real Artist",
        album: "The Real Album",
        hasArtwork: true,
        duration: 245,
        lossless: true,
        sampleRate: 96_000,
        bitsPerSample: 24
      })
    ]);
  });
});
