import { DJTrackPlaybackPlan, type DJTrackPlaybackSegment } from "../dj/interface";
import { Snippet, Track } from "../library/types";

const DEFAULT_SNIPPET_TRIM_THRESHOLD_SECONDS = 3 * 60;
const DEFAULT_SNIPPET_PLAY_WINDOW_SECONDS = 2 * 60;
const DEFAULT_LONG_TRACK_THRESHOLD_SECONDS = 12 * 60;
const DEFAULT_LONG_TRACK_CLIP_SECONDS = 5 * 60;
const DEFAULT_LONG_TRACK_EDGE_PADDING_SECONDS = 45;
const DEFAULT_LONG_TRACK_FADE_SECONDS = 4;

const formatCueValue = (value: number) => Number(value.toFixed(3)).toString();

const pushMetadata = (metadata: string[], key: string, value?: string | null) => {
  if (!value) return;
  metadata.push(`${key}=${JSON.stringify(value)}`);
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const resolveLongTrackWindow = (
  durationSeconds: number,
  clipWindowSeconds: number,
  edgePaddingSeconds: number,
  segment: DJTrackPlaybackSegment,
  randomValue: number
) => {
  const maxCueInSeconds = Math.max(0, durationSeconds - clipWindowSeconds);
  if (maxCueInSeconds <= 0) return 0;

  const safeStart = clamp(edgePaddingSeconds, 0, maxCueInSeconds);
  const safeEnd = clamp(durationSeconds - clipWindowSeconds - edgePaddingSeconds, 0, maxCueInSeconds);
  const zoneStart =
    segment === "opening"
      ? 0
      : segment === "middle"
        ? 0.3
        : 0.68;
  const zoneEnd =
    segment === "opening"
      ? 0.28
      : segment === "middle"
        ? 0.7
        : 1;
  const effectiveStart = clamp(safeStart + (safeEnd - safeStart) * zoneStart, 0, maxCueInSeconds);
  const effectiveEnd = clamp(safeStart + (safeEnd - safeStart) * zoneEnd, effectiveStart, maxCueInSeconds);
  return clamp(
    effectiveStart + (effectiveEnd - effectiveStart) * clamp(randomValue, 0, 1),
    0,
    maxCueInSeconds
  );
};

export const planTrackPlayback = (
  track: Pick<Track, "duration">,
  options: {
    playbackPlan?: Pick<
      DJTrackPlaybackPlan,
      "mode" | "segment" | "cueInSeconds" | "cueOutSeconds" | "fadeInSeconds" | "fadeOutSeconds"
    > | null;
    thresholdSeconds?: number;
    clipWindowSeconds?: number;
    edgePaddingSeconds?: number;
    fadeSeconds?: number;
    random?: () => number;
  } = {}
) => {
  const durationSeconds =
    typeof track.duration === "number" && Number.isFinite(track.duration) && track.duration > 0
      ? track.duration
      : null;
  const thresholdSeconds = Math.max(1, options.thresholdSeconds ?? DEFAULT_LONG_TRACK_THRESHOLD_SECONDS);
  const clipWindowSeconds = Math.max(30, options.clipWindowSeconds ?? DEFAULT_LONG_TRACK_CLIP_SECONDS);
  const edgePaddingSeconds = Math.max(0, options.edgePaddingSeconds ?? DEFAULT_LONG_TRACK_EDGE_PADDING_SECONDS);
  const defaultFadeSeconds = Math.max(0, options.fadeSeconds ?? DEFAULT_LONG_TRACK_FADE_SECONDS);
  const playbackPlan = options.playbackPlan ?? null;

  if (
    !playbackPlan ||
    playbackPlan.mode !== "clip" ||
    durationSeconds === null ||
    durationSeconds <= thresholdSeconds
  ) {
    return {
      durationSeconds,
      trimmed: false,
      cueInSeconds: 0,
      cueOutSeconds: durationSeconds ?? undefined,
      fadeInSeconds: 0,
      fadeOutSeconds: 0
    };
  }

  const requestedCueIn =
    typeof playbackPlan.cueInSeconds === "number" && Number.isFinite(playbackPlan.cueInSeconds)
      ? playbackPlan.cueInSeconds
      : null;
  const requestedCueOut =
    typeof playbackPlan.cueOutSeconds === "number" && Number.isFinite(playbackPlan.cueOutSeconds)
      ? playbackPlan.cueOutSeconds
      : null;
  const randomValue = options.random?.() ?? Math.random();
  const cueInSeconds =
    requestedCueIn !== null
      ? clamp(requestedCueIn, 0, Math.max(0, durationSeconds - Math.min(durationSeconds, clipWindowSeconds)))
      : resolveLongTrackWindow(
          durationSeconds,
          Math.min(durationSeconds, clipWindowSeconds),
          edgePaddingSeconds,
          playbackPlan.segment ?? "middle",
          randomValue
        );
  const cueOutSeconds =
    requestedCueOut !== null && requestedCueOut > cueInSeconds
      ? clamp(requestedCueOut, cueInSeconds + 1, durationSeconds)
      : clamp(cueInSeconds + Math.min(durationSeconds, clipWindowSeconds), cueInSeconds + 1, durationSeconds);
  const fadeInSeconds = clamp(
    playbackPlan.fadeInSeconds ?? defaultFadeSeconds,
    0,
    Math.max(0, cueOutSeconds - cueInSeconds)
  );
  const fadeOutSeconds = clamp(
    playbackPlan.fadeOutSeconds ?? defaultFadeSeconds,
    0,
    Math.max(0, cueOutSeconds - cueInSeconds)
  );

  return {
    durationSeconds,
    trimmed: true,
    cueInSeconds,
    cueOutSeconds,
    fadeInSeconds,
    fadeOutSeconds
  };
};

export const buildTrackQueueUri = (
  track: Pick<Track, "id" | "path" | "title" | "artist" | "album" | "albumArtUrl" | "duration">,
  options: {
    playbackPlan?: DJTrackPlaybackPlan | null;
    thresholdSeconds?: number;
    clipWindowSeconds?: number;
    edgePaddingSeconds?: number;
    fadeSeconds?: number;
    random?: () => number;
  } = {}
) => {
  const metadata: string[] = [];
  const song = `${track.artist} - ${track.title}`;
  const plan = planTrackPlayback(track, {
    playbackPlan: options.playbackPlan,
    thresholdSeconds: options.thresholdSeconds,
    clipWindowSeconds: options.clipWindowSeconds,
    edgePaddingSeconds: options.edgePaddingSeconds,
    fadeSeconds: options.fadeSeconds,
    random: options.random
  });
  pushMetadata(metadata, "track_id", track.id);
  pushMetadata(metadata, "title", track.title);
  pushMetadata(metadata, "artist", track.artist);
  pushMetadata(metadata, "album", track.album ?? "");
  pushMetadata(metadata, "song", song);
  pushMetadata(metadata, "url", track.albumArtUrl);
  if (plan.trimmed) {
    pushMetadata(metadata, "liq_cue_in", formatCueValue(plan.cueInSeconds));
    pushMetadata(metadata, "liq_cue_out", formatCueValue(plan.cueOutSeconds ?? plan.cueInSeconds));
    pushMetadata(metadata, "liq_fade_in", formatCueValue(plan.fadeInSeconds));
    pushMetadata(metadata, "liq_fade_out", formatCueValue(plan.fadeOutSeconds));
    pushMetadata(metadata, "rassy_playback_mode", "clip");
  } else if (options.playbackPlan?.mode === "full") {
    pushMetadata(metadata, "rassy_playback_mode", "full");
  }
  return metadata.length > 0 ? `annotate:${metadata.join(",")}:${track.path}` : track.path;
};

export const planSnippetPlayback = (
  snippet: Pick<Snippet, "duration">,
  options: {
    trimThresholdSeconds?: number;
    playWindowSeconds?: number;
    random?: () => number;
  } = {}
) => {
  const trimThresholdSeconds = Math.max(
    1,
    options.trimThresholdSeconds ?? DEFAULT_SNIPPET_TRIM_THRESHOLD_SECONDS
  );
  const playWindowSeconds = Math.max(
    1,
    options.playWindowSeconds ?? DEFAULT_SNIPPET_PLAY_WINDOW_SECONDS
  );
  const durationSeconds =
    typeof snippet.duration === "number" && Number.isFinite(snippet.duration) && snippet.duration > 0
      ? snippet.duration
      : null;

  if (durationSeconds === null || durationSeconds <= trimThresholdSeconds) {
    return {
      durationSeconds,
      trimmed: false,
      cueInSeconds: 0,
      cueOutSeconds: durationSeconds
    };
  }

  const maxCueInSeconds = Math.max(0, durationSeconds - playWindowSeconds);
  const randomValue = Math.min(1, Math.max(0, options.random?.() ?? Math.random()));
  const cueInSeconds = maxCueInSeconds > 0 ? randomValue * maxCueInSeconds : 0;
  const cueOutSeconds = Math.min(durationSeconds, cueInSeconds + playWindowSeconds);

  return {
    durationSeconds,
    trimmed: true,
    cueInSeconds,
    cueOutSeconds
  };
};

export const buildSnippetQueueUri = (
  snippet: Pick<Snippet, "id" | "path" | "label" | "duration">,
  options: {
    trimThresholdSeconds?: number;
    playWindowSeconds?: number;
    random?: () => number;
  } = {}
) => {
  const metadata: string[] = [];
  const plan = planSnippetPlayback(snippet, options);
  const title = snippet.label?.trim() || "Station ID";
  const song = `Mr Rassy - ${title}`;

  pushMetadata(metadata, "snippet_id", snippet.id);
  pushMetadata(metadata, "title", title);
  pushMetadata(metadata, "artist", "Mr Rassy");
  pushMetadata(metadata, "album", "Station ID");
  pushMetadata(metadata, "song", song);

  if (plan.trimmed) {
    pushMetadata(metadata, "liq_cue_in", formatCueValue(plan.cueInSeconds));
    pushMetadata(metadata, "liq_cue_out", formatCueValue(plan.cueOutSeconds ?? plan.cueInSeconds));
  }

  return metadata.length > 0 ? `annotate:${metadata.join(",")}:${snippet.path}` : snippet.path;
};
