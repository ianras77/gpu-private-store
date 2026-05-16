import { afterEach, describe, expect, it, vi } from "vitest";
import { pickTrack, sanitizeRequest } from "../utils/selection";

const makeTrack = (id: string, artist: string, energy = 0.5) => ({
  id,
  path: `/music/${id}.mp3`,
  title: id,
  artist,
  energy,
  moodTags: ["daydream"]
});

describe("pickTrack", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("avoids banned and recent tracks", () => {
    const tracks = [makeTrack("a", "alpha"), makeTrack("b", "beta")];
    const picked = pickTrack(tracks, {
      mood: "daydream",
      bannedTrackIds: new Set(["a"]),
      bannedArtists: new Set(),
      recentTrackIds: new Set(),
      recentArtists: new Set()
    });
    expect(picked?.id).toBe("b");
  });

  it("prefers upvoted tracks when mood scores are similar", () => {
    const tracks = [makeTrack("a", "alpha", 0.5), makeTrack("b", "beta", 0.5)];
    const picked = pickTrack(tracks, {
      mood: "daydream",
      bannedTrackIds: new Set(),
      bannedArtists: new Set(),
      recentTrackIds: new Set(),
      recentArtists: new Set(),
      feedbackScores: new Map([
        ["a", -8],
        ["b", 8]
      ]),
      feedbackWeight: 0.8
    });
    expect(picked?.id).toBe("b");
  });

  it("leans into hour-and-day specific texture when scoring similar tracks", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);

    const tracks = [
      {
        ...makeTrack("night", "alpha", 0.26),
        title: "Velvet Drift",
        genres: ["ambient", "dub"]
      },
      {
        ...makeTrack("day", "beta", 0.26),
        title: "Festival Heat",
        genres: ["dance", "house"]
      }
    ];

    const picked = pickTrack(tracks, {
      mood: "dreamy / velvet static",
      dayPart: "deep night",
      dayOfWeek: "Sunday",
      emotionalWeather: "velvet static",
      bannedTrackIds: new Set(),
      bannedArtists: new Set(),
      recentTrackIds: new Set(),
      recentArtists: new Set()
    });

    expect(picked?.id).toBe("night");
  });

  it("treats alternate versions of the same title and artist as recent", () => {
    const tracks = [
      {
        ...makeTrack("heart-remaster", "Neil Young", 0.44),
        title: "Heart of Gold (2009 Remaster)"
      },
      {
        ...makeTrack("fresh", "The Signals", 0.5),
        title: "Fresh Turn"
      }
    ];

    const picked = pickTrack(tracks, {
      mood: "late morning / steady shine",
      dayPart: "late morning",
      dayOfWeek: "Saturday",
      emotionalWeather: "steady shine",
      bannedTrackIds: new Set(),
      bannedArtists: new Set(),
      recentTrackIds: new Set(),
      recentTrackSignatures: new Set(["neil young::heart of gold"]),
      recentArtists: new Set()
    });

    expect(picked?.id).toBe("fresh");
  });

  it("normalizes file-derived artist and title metadata for cooldowns", () => {
    const tracks = [
      {
        ...makeTrack("heart-live", "17", 0.44),
        title: "Neil Young - Harvest - Heart of Gold (Live)"
      },
      {
        ...makeTrack("fresh", "The Signals", 0.5),
        title: "Fresh Turn"
      }
    ];

    const picked = pickTrack(tracks, {
      mood: "late morning / steady shine",
      dayPart: "late morning",
      dayOfWeek: "Saturday",
      emotionalWeather: "steady shine",
      bannedTrackIds: new Set(),
      bannedArtists: new Set(),
      recentTrackIds: new Set(),
      recentTrackSignatures: new Set(["neil young::heart of gold"]),
      recentArtists: new Set()
    });

    expect(picked?.id).toBe("fresh");
  });
});

describe("sanitizeRequest", () => {
  it("strips unsafe characters", () => {
    const cleaned = sanitizeRequest("Hello <script>alert(1)</script> world!!!");
    expect(cleaned).toBe("Hello scriptalert(1)script world!!!");
  });
});
