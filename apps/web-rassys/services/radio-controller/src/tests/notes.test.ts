import { describe, expect, it } from "vitest";
import {
  buildNoteCurrentTrack,
  buildNoteSetlist,
  buildRadioNoteExcerpt,
  buildRadioNoteTitle,
  parseTrackIds
} from "../notes";

const context = {
  mood: "after-hours",
  timeOfDay: "23:41",
  recentTracks: [],
  recentArtists: [],
  queueDepth: 2,
  nowPlaying: {
    id: "now-1",
    title: "Current Pressure",
    artist: "The Signals",
    album: "Transmit",
    year: 1998,
    genres: ["electro"],
    energy: 0.64
  },
  librarySample: [],
  queuePreview: [
    {
      id: "next-1",
      title: "Glass Receiver",
      artist: "Night Relay",
      album: "Transmit",
      year: 2001,
      genres: ["electro"],
      energy: 0.59
    },
    {
      id: "next-2",
      title: "Second Spark",
      artist: "Night Relay",
      album: "Transmit",
      year: 2001,
      genres: ["electro"],
      energy: 0.62
    }
  ],
  snippetSample: [],
  feedback: [],
  feedbackTopLiked: [],
  feedbackTopDisliked: [],
  requests: [],
  bans: {
    trackIds: [],
    artists: []
  }
};

describe("buildNoteSetlist", () => {
  it("prefers explicit selected tracks and removes duplicates", () => {
    const setlist = buildNoteSetlist({
      context,
      selectedTracks: [
        {
          id: "next-1",
          title: "Glass Receiver",
          artist: "Night Relay",
          energy: 0.59
        },
        {
          id: "next-1",
          title: "Glass Receiver",
          artist: "Night Relay",
          energy: 0.59
        },
        {
          id: "next-3",
          title: "Turn the Neon",
          artist: "Static Harbor",
          energy: 0.72
        }
      ]
    });

    expect(setlist.map((track) => track.id)).toEqual(["next-1", "next-3"]);
  });

  it("falls back to the queue preview when no explicit tracks are passed", () => {
    const setlist = buildNoteSetlist({ context });
    expect(setlist.map((track) => track.id)).toEqual(["next-1", "next-2"]);
  });
});

describe("buildRadioNoteTitle", () => {
  it("threads the current record into the next one when both exist", () => {
    const title = buildRadioNoteTitle({
      mood: context.mood,
      currentTrack: buildNoteCurrentTrack(context),
      setlist: buildNoteSetlist({ context }),
      eventType: "playlist"
    });

    expect(title).toBe("Current Pressure into Glass Receiver");
  });

  it("falls back to a mood-based title when there are no tracks", () => {
    const title = buildRadioNoteTitle({
      mood: "deep-night",
      currentTrack: null,
      setlist: [],
      eventType: "talk"
    });

    expect(title).toBe("Deep night booth notes");
  });
});

describe("buildRadioNoteExcerpt", () => {
  it("trims long booth copy without cutting mid-word", () => {
    const excerpt = buildRadioNoteExcerpt(
      "Mr Rassy is opening the room slowly and deliberately, letting the bassline do the first few sentences while the next record waits in the dark just behind it.",
      90
    );

    expect(excerpt).toBe("Mr Rassy is opening the room slowly and deliberately, letting the bassline do the first...");
  });
});

describe("parseTrackIds", () => {
  it("keeps unique, non-empty ids only", () => {
    expect(parseTrackIds(["a", "b", "a", "", 4, null])).toEqual(["a", "b"]);
  });
});
