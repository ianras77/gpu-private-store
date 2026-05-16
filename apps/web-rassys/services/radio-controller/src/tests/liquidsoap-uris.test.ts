import { describe, expect, it } from "vitest";
import {
  buildSnippetQueueUri,
  buildTrackQueueUri,
  planSnippetPlayback,
  planTrackPlayback
} from "../liquidsoap/uris";

describe("buildTrackQueueUri", () => {
  it("annotates track metadata for Liquidsoap", () => {
    const uri = buildTrackQueueUri({
      id: "track-123",
      path: "/music/test.flac",
      title: "Night Drive",
      artist: "Rassy",
      album: "Signals",
      albumArtUrl: "https://example.com/art.jpg",
      duration: 248
    });

    expect(uri).toContain('track_id="track-123"');
    expect(uri).toContain('title="Night Drive"');
    expect(uri).toContain('artist="Rassy"');
    expect(uri).toContain('album="Signals"');
    expect(uri).toContain('url="https://example.com/art.jpg"');
    expect(uri.endsWith(":/music/test.flac")).toBe(true);
  });

  it("adds cue and fade metadata for clipped long-form tracks", () => {
    const uri = buildTrackQueueUri(
      {
        id: "track-clip",
        path: "/music/long-form.flac",
        title: "Side Long Suite",
        artist: "The Signals",
        album: "One Room",
        albumArtUrl: "https://example.com/long.jpg",
        duration: 1200
      },
      {
        playbackPlan: {
          trackId: "track-clip",
          mode: "clip",
          segment: "middle"
        },
        thresholdSeconds: 720,
        clipWindowSeconds: 300,
        edgePaddingSeconds: 45,
        fadeSeconds: 4,
        random: () => 0.5
      }
    );

    expect(uri).toContain('liq_cue_in="450"');
    expect(uri).toContain('liq_cue_out="750"');
    expect(uri).toContain('liq_fade_in="4"');
    expect(uri).toContain('liq_fade_out="4"');
    expect(uri).toContain('rassy_playback_mode="clip"');
  });

  it("adds produced transition metadata when Mr Rassy marks a handoff", () => {
    const uri = buildTrackQueueUri(
      {
        id: "track-transition",
        path: "/music/transition.flac",
        title: "Signal One",
        artist: "The Signals",
        duration: 240
      },
      {
        playbackPlan: {
          trackId: "track-transition",
          mode: "full",
          transitionAfter: true,
          transitionStyle: "bloom",
          transitionFeel: "warm lift",
          transitionDurationSeconds: 6.5,
          transitionReason: "Let the next record rise slowly.",
          transitionNextTrackId: "track-next"
        }
      }
    );

    expect(uri).toContain('rassy_transition="true"');
    expect(uri).toContain('rassy_transition_style="bloom"');
    expect(uri).toContain('rassy_transition_feel="warm lift"');
    expect(uri).toContain('rassy_transition_seconds="6.5"');
    expect(uri).toContain('rassy_transition_next_track_id="track-next"');
  });
});

describe("planSnippetPlayback", () => {
  it("plays short snippets in full", () => {
    expect(
      planSnippetPlayback(
        {
          duration: 92
        },
        {
          random: () => 0.5
        }
      )
    ).toEqual({
      durationSeconds: 92,
      trimmed: false,
      cueInSeconds: 0,
      cueOutSeconds: 92
    });
  });

  it("trims long snippets to a random 2-minute window", () => {
    const plan = planSnippetPlayback(
      {
        duration: 360
      },
      {
        trimThresholdSeconds: 180,
        playWindowSeconds: 120,
        random: () => 0.5
      }
    );

    expect(plan.trimmed).toBe(true);
    expect(plan.cueInSeconds).toBe(120);
    expect(plan.cueOutSeconds).toBe(240);
  });
});

describe("buildSnippetQueueUri", () => {
  it("adds Liquidsoap cue metadata for trimmed snippets", () => {
    const uri = buildSnippetQueueUri(
      {
        path: "/dj/identifier.mp3",
        label: "Station Ident",
        duration: 400
      },
      {
        trimThresholdSeconds: 180,
        playWindowSeconds: 120,
        random: () => 0.25
      }
    );

    expect(uri).toContain('title="Station Ident"');
    expect(uri).toContain('artist="Mr Rassy"');
    expect(uri).toContain('liq_cue_in="70"');
    expect(uri).toContain('liq_cue_out="190"');
    expect(uri.endsWith(":/dj/identifier.mp3")).toBe(true);
  });
});

describe("planTrackPlayback", () => {
  it("keeps ordinary tracks as full plays", () => {
    expect(
      planTrackPlayback(
        {
          duration: 280
        },
        {
          playbackPlan: {
            trackId: "track-a",
            mode: "clip",
            segment: "middle"
          }
        }
      )
    ).toEqual({
      durationSeconds: 280,
      trimmed: false,
      cueInSeconds: 0,
      cueOutSeconds: 280,
      fadeInSeconds: 0,
      fadeOutSeconds: 0
    });
  });

  it("plans clipped playback for long-form tracks", () => {
    expect(
      planTrackPlayback(
        {
          duration: 1200
        },
        {
          playbackPlan: {
            trackId: "track-b",
            mode: "clip",
            segment: "late"
          },
          thresholdSeconds: 720,
          clipWindowSeconds: 300,
          edgePaddingSeconds: 45,
          fadeSeconds: 4,
          random: () => 0.25
        }
      )
    ).toEqual({
      durationSeconds: 1200,
      trimmed: true,
      cueInSeconds: 660.6,
      cueOutSeconds: 960.6,
      fadeInSeconds: 4,
      fadeOutSeconds: 4
    });
  });
});
