import { Prisma, type LibraryTrackInsight as LibraryTrackInsightRow } from "@prisma/client";
import { createHash } from "crypto";
import { z } from "zod";
import type { BoothDossierSnapshot, BoothDossierSessionTrack } from "../booth-dossier";
import { config } from "../config";
import { prisma } from "../db";
import type { DJContext } from "../dj/interface";
import { logger } from "../logger";
import type { Track, TrackInsight } from "./types";

type TrackReference = Pick<
  Track,
  | "id"
  | "title"
  | "artist"
  | "album"
  | "year"
  | "genres"
  | "energy"
  | "duration"
  | "moodTags"
  | "format"
  | "sampleRate"
  | "bitsPerSample"
  | "bitrate"
  | "lossless"
>;

type RequestProfile = {
  normalized: string;
  tokens: string[];
  decades: string[];
  broadLane: boolean;
  wantsDeepCut: boolean;
};

type PromptTrackInsight = Pick<
  TrackInsight,
  | "canonicalKey"
  | "summary"
  | "artistContext"
  | "trackContext"
  | "setHook"
  | "listenFor"
  | "requestTags"
  | "sonicSignatures"
  | "funFacts"
  | "boothMemories"
  | "confidence"
  | "playCount"
  | "refinementCount"
  | "source"
> & {
  trackId?: string;
};

export type TrackTurnIntelligence = {
  whyItFits: string;
  context: string;
  listenFor: string;
  factLine: string;
  requestHooks: string[];
};

export type TrackKnowledgeCard = {
  summary: string;
  historicalAnchor: string;
  trackStory: string;
  setReason: string;
  listenFor: string;
  passionLine: string;
  funFacts: string[];
  requestHooks: string[];
  confidence: number;
  playCount: number;
  refinementCount: number;
  source: PromptTrackInsight["source"] | TrackInsight["source"];
};

type BoothLearningTrack = Pick<
  BoothDossierSessionTrack,
  "trackId" | "title" | "artist" | "whyItFits" | "context" | "listenFor"
> & {
  album?: string;
  year?: number;
};

type TrackInsightAnalysis = {
  summary: string;
  artistContext: string;
  trackContext: string;
  setHook: string;
  listenFor: string;
  requestTags: string[];
  sonicSignatures: string[];
  funFacts: string[];
  confidence: number;
};

const TRACK_TITLE_DECORATION_PATTERN =
  /[\[(][^\])]*(?:remaster(?:ed)?|mono|stereo|edit|mix|version|radio|single|album|deluxe|bonus|clean|explicit)[^\])]*[\])]/gi;
const TRACK_TITLE_TAIL_PATTERN =
  /\s+-\s+(?:\d{4}\s+)?(?:remaster(?:ed)?|mono|stereo|edit|mix|version|radio edit|single version|album version|clean|explicit)\b.*$/gi;
const STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "any",
  "anything",
  "artist",
  "by",
  "for",
  "from",
  "give",
  "hear",
  "keep",
  "lane",
  "like",
  "me",
  "more",
  "play",
  "please",
  "put",
  "same",
  "set",
  "something",
  "spin",
  "take",
  "that",
  "the",
  "this",
  "track",
  "want",
  "with"
]);

const TRACK_INSIGHT_ANALYSIS_SCHEMA = z.object({
  summary: z.string().min(16).max(360),
  artistContext: z.string().min(16).max(420),
  trackContext: z.string().min(16).max(420),
  setHook: z.string().min(12).max(260),
  listenFor: z.string().min(12).max(280),
  requestTags: z.array(z.string().min(2)).max(10).default([]),
  sonicSignatures: z.array(z.string().min(2)).max(8).default([]),
  funFacts: z.array(z.string().min(8)).max(5).default([]),
  confidence: z.number().min(0).max(1).default(0.72)
});

const TRACK_INSIGHT_ANALYSIS_SYSTEM_PROMPT =
  `You are building a durable DJ knowledge card for one record in Ian Rasmussen's library.\n` +
  `This card feeds Mr Rassy, the live DJ voice of Mr Rassy Radio.\n` +
  `Return ONLY strict JSON with keys summary, artistContext, trackContext, setHook, listenFor, requestTags, sonicSignatures, funFacts, confidence.\n` +
  `Write like a crate-digger with real taste, not a generic encyclopedia or streaming app.\n` +
  `This should read like cool DJ knowledge you would actually want to say on air.\n` +
  `Prefer high-confidence music history, band context, scene lineage, catalog placement, production texture, recording detail, and arrangement detail.\n` +
  `If you are not sure about an exact fact, do not fake names, dates, credits, or sessions; pivot into sound, structure, feel, or lineage instead.\n` +
  `summary should explain what makes the record matter and why it belongs in a set, with at least one concrete anchor.\n` +
  `artistContext should give useful band, artist, scene, label, lineup, or album-world context. Avoid empty biography.\n` +
  `trackContext should explain what is distinctive about this cut: groove, arrangement, harmony, vocal attack, production, runtime, or how it sits inside the album.\n` +
  `setHook should tell Mr Rassy when to reach for it in a set and what it changes in the handoff.\n` +
  `listenFor should sound like a passionate DJ pointing at a real musical detail, not a vague mood.\n` +
  `requestTags should be lower-case handles a listener might actually ask for.\n` +
  `sonicSignatures should be short descriptive phrases.\n` +
  `funFacts should be crisp, high-confidence DJ-worthy facts or observations with concrete nouns. Generic statements about vibe, flow, or energy are not fun facts.\n` +
  `Avoid phrases like "lands here", "nice flow", "good vibe", "keeps the room moving", "works because it fits", or "without flattening the hour".\n` +
  `confidence is factual confidence, not enthusiasm.`;

const GENERIC_KNOWLEDGE_PATTERN =
  /\b(lands here|nice flow|good vibe|works because it fits|fits here|keeps the (?:room|hour|energy) moving|without flattening|in the room|kind of record)\b/i;
const HISTORY_DETAIL_PATTERN =
  /\b(19|20)\d{2}\b|\b(album|catalog|label|scene|band|duo|trio|quartet|ensemble|session|recording|studio|release|single|lp|movement|city|era|decade)\b/i;
const SOUND_DETAIL_PATTERN =
  /\b(arrangement|groove|pocket|bass|drum|drums|kick|snare|hi[ -]?hat|percussion|guitar|piano|organ|synth|horn|horns|sax|string|strings|vocal|harmony|chorus|verse|bridge|intro|outro|reverb|echo|mix|dub|hook|riff|melody|rhythm|breakdown|backbeat|low end|falsetto|tempo)\b/i;
const SET_DETAIL_PATTERN =
  /\b(set|sequence|turn|hour|handoff|transition|hinge|landing|queue|request line|after|before|into|toward|threads|answers|lifts|cools|opens)\b/i;
const LISTEN_DETAIL_PATTERN =
  /\b(listen|hear|catch|notice|pay attention|wait for)\b/i;

const inFlightTrackInsightAnalyses = new Set<string>();

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const uniqueStrings = (values: Array<string | null | undefined>, limit = 24) =>
  Array.from(
    new Set(
      values
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value))
    )
  ).slice(0, limit);

const normalizeInsightText = (value?: string | null) =>
  (value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const withTerminalPunctuation = (value: string) => (/[.!?]$/.test(value) ? value : `${value}.`);

const sanitizeInsightSentence = (
  value?: string | null,
  fallback?: string | null,
  maxLength = 320
) => {
  const source = (value ?? fallback ?? "").replace(/\s+/g, " ").trim();
  if (!source) return "";
  const limited = source.length > maxLength ? source.slice(0, maxLength).trim() : source;
  return withTerminalPunctuation(limited);
};

const splitInsightSentences = (value?: string | null) =>
  (value ?? "")
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

const joinInsightSentences = (values: Array<string | null | undefined>, limit = 3) =>
  uniqueStrings(values.flatMap((value) => splitInsightSentences(value)), limit).join(" ");

const isSpecificKnowledgeLine = (
  value: string,
  mode: "history" | "track" | "set" | "listen"
) => {
  if (!value) return false;
  if (GENERIC_KNOWLEDGE_PATTERN.test(value)) return false;
  const hasHistory = HISTORY_DETAIL_PATTERN.test(value);
  const hasSound = SOUND_DETAIL_PATTERN.test(value);
  const hasSet = SET_DETAIL_PATTERN.test(value);
  const hasListen = LISTEN_DETAIL_PATTERN.test(value);

  switch (mode) {
    case "history":
      return hasHistory || (hasSound && value.length >= 96);
    case "track":
      return hasSound || (hasHistory && value.length >= 88);
    case "set":
      return hasSet && (hasSound || hasHistory || value.length >= 86);
    case "listen":
      return hasListen && hasSound;
    default:
      return false;
  }
};

const pickSpecificKnowledgeLine = (
  values: Array<string | null | undefined>,
  mode: "history" | "track" | "set" | "listen",
  fallback?: string | null,
  maxLength = 320
) => {
  const candidates = uniqueStrings(values.flatMap((value) => splitInsightSentences(value)), 12)
    .map((value) => sanitizeInsightSentence(value))
    .filter(Boolean);
  const specific = candidates.find((value) => isSpecificKnowledgeLine(value, mode));
  if (specific) return sanitizeInsightSentence(specific, fallback, maxLength);
  return sanitizeInsightSentence(fallback, candidates[0] ?? null, maxLength);
};

const ensureListenLead = (value?: string | null, fallback?: string | null, maxLength = 260) => {
  const sentence = sanitizeInsightSentence(value, fallback, maxLength);
  if (!sentence) return "";
  if (LISTEN_DETAIL_PATTERN.test(sentence)) return sentence;
  const trimmed = sentence.replace(/^[A-Z]/, (match) => match.toLowerCase());
  return withTerminalPunctuation(`Listen for ${trimmed}`);
};

const stripListenLead = (value: string) =>
  value
    .replace(/^(listen|hear|catch|notice|pay attention|wait for)\s+/i, "")
    .replace(/^the\s+/i, "")
    .trim();

const sanitizeInsightPhrases = (
  values: Array<string | null | undefined>,
  fallback: string[] = [],
  limit = 8
) =>
  uniqueStrings(
    [...values, ...fallback]
      .map((value) => value?.replace(/\s+/g, " ").trim())
      .filter((value): value is string => Boolean(value)),
    limit
  );

const sanitizeInsightTags = (values: Array<string | null | undefined>, fallback: string[] = [], limit = 18) =>
  uniqueStrings(
    [...values, ...fallback]
      .map((value) => normalizeInsightText(value))
      .filter((value) => value.length >= 2),
    limit
  );

const sanitizeFunFacts = (values: Array<string | null | undefined>, fallback: string[] = [], limit = 6) =>
  uniqueStrings(
    [...values, ...fallback]
      .map((value) => sanitizeInsightSentence(value))
      .filter(
        (value): value is string =>
          Boolean(value) &&
          (isSpecificKnowledgeLine(value, "history") || isSpecificKnowledgeLine(value, "track"))
      ),
    limit
  );

const isLearnableBoothLine = (value?: string | null) => {
  const sentence = sanitizeInsightSentence(value);
  if (!sentence) return false;
  return (
    isSpecificKnowledgeLine(sentence, "history") ||
    isSpecificKnowledgeLine(sentence, "track") ||
    isSpecificKnowledgeLine(sentence, "set") ||
    isSpecificKnowledgeLine(sentence, "listen")
  );
};

const buildLearnableBoothMemories = (
  values: Array<string | null | undefined>,
  fallback: string[] = [],
  limit = 8
) =>
  uniqueStrings(
    [...fallback, ...values]
      .map((value) => sanitizeInsightSentence(value))
      .filter((value): value is string => Boolean(value) && isLearnableBoothLine(value)),
    limit
  );

const tokenizeInsightText = (value?: string | null) =>
  normalizeInsightText(value)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !STOPWORDS.has(token));

const buildTrackTitleCore = (value?: string | null) =>
  (value ?? "")
    .replace(TRACK_TITLE_DECORATION_PATTERN, " ")
    .replace(TRACK_TITLE_TAIL_PATTERN, " ")
    .replace(/\s+/g, " ")
    .trim();

const extractJsonPayload = (content: string) => {
  const stripped = content.replace(/```json/gi, "```").replace(/```/g, "").trim();
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return stripped.slice(start, end + 1);
  }
  return stripped;
};

const readStructuredMessageText = (value: unknown): string => {
  if (typeof value === "string") {
    return value.trim();
  }
  if (Array.isArray(value)) {
    return value
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object") {
          if (typeof (part as { text?: unknown }).text === "string") {
            return (part as { text: string }).text;
          }
          if (typeof (part as { content?: unknown }).content === "string") {
            return (part as { content: string }).content;
          }
        }
        return "";
      })
      .join("")
      .trim();
  }
  if (value && typeof value === "object") {
    if (typeof (value as { text?: unknown }).text === "string") {
      return (value as { text: string }).text.trim();
    }
    if (typeof (value as { content?: unknown }).content === "string") {
      return (value as { content: string }).content.trim();
    }
  }
  return "";
};

const buildTrackLabel = (track: { title: string; artist: string; album?: string; year?: number }) => {
  const albumLine = track.album ? ` off ${track.album}` : "";
  const yearLine = typeof track.year === "number" ? ` (${track.year})` : "";
  return `${track.title} by ${track.artist}${albumLine}${yearLine}`;
};

const buildDecadeLabel = (track?: { year?: number | null }) =>
  typeof track?.year === "number" && Number.isFinite(track.year)
    ? `${Math.floor(track.year / 10) * 10}s`
    : null;

const buildGenreLabel = (track?: { genres?: string[] | null }) => {
  const genres = (track?.genres ?? []).filter(Boolean);
  if (genres.length === 0) return null;
  if (genres.length === 1) return genres[0]!;
  return `${genres[0]} / ${genres[1]}`;
};

const describeEnergy = (energy?: number | null) => {
  if (typeof energy !== "number") return "an open-ended pulse";
  if (energy < 0.28) return "a still, low-lit drift";
  if (energy < 0.48) return "a slow-burn glide";
  if (energy < 0.68) return "a locked-in pocket";
  if (energy < 0.84) return "a forward-leaning drive";
  return "a bright, fully lit charge";
};

const trackGenreFingerprint = (track?: TrackReference | null) =>
  normalizeInsightText([buildGenreLabel(track ?? undefined), ...(track?.genres ?? [])].filter(Boolean).join(" "));

const hasGenreFingerprint = (track: TrackReference, pattern: RegExp) =>
  pattern.test(trackGenreFingerprint(track));

const getTrackFamily = (track: TrackReference) => {
  if (hasGenreFingerprint(track, /\b(ambient|drone|dub|new age|soundtrack|field recording)\b/)) {
    return "space";
  }
  if (hasGenreFingerprint(track, /\b(house|techno|electronic|dance|club|disco)\b/)) {
    return "pulse";
  }
  if (hasGenreFingerprint(track, /\b(jazz|fusion|free jazz|big band|spiritual jazz)\b/)) {
    return "ensemble";
  }
  if (hasGenreFingerprint(track, /\b(soul|funk|rnb|r b|rhythm and blues|gospel)\b/)) {
    return "pocket";
  }
  if (hasGenreFingerprint(track, /\b(hip hop|hip-hop|rap|trip hop)\b/)) {
    return "rhythm";
  }
  if (hasGenreFingerprint(track, /\b(country|folk|americana|bluegrass|singer songwriter)\b/)) {
    return "story";
  }
  if (hasGenreFingerprint(track, /\b(rock|punk|indie|alternative|garage|new wave|pop|metal)\b/)) {
    return "band";
  }
  return "open";
};

const buildAlbumReference = (track: Pick<TrackReference, "album" | "year">) => {
  if (track.album && typeof track.year === "number") {
    return `${track.album} (${track.year})`;
  }
  return track.album ?? (typeof track.year === "number" ? String(track.year) : null);
};

const buildSummaryLine = (track: TrackReference) => {
  const label = buildTrackLabel(track);
  const family = getTrackFamily(track);

  switch (family) {
    case "ensemble":
      return `${label} works when the set needs collective motion and color instead of blunt force.`;
    case "pulse":
      return `${label} gives the hour momentum with structure; the drive comes from the engine under the track, not empty speed.`;
    case "pocket":
      return `${label} brings body, timing, and human feel first, so the persuasion happens in the rhythm section rather than in big gestures.`;
    case "band":
      return track.duration && track.duration < 180
        ? `${label} hits fast and leaves a sharp silhouette, which makes it useful when the stack needs definition without bloat.`
        : `${label} carries the feel of a band in a room rather than a mood-board tag, and that physicality matters in a sequence.`;
    case "story":
      return `${label} pulls the room inward and lets voice, phrasing, or acoustic grain do the heavy lifting.`;
    case "rhythm":
      return `${label} keeps the pressure in the pocket and the phrasing, which makes it a control move as much as a crowd move.`;
    case "space":
      return `${label} opens space, decay, and atmosphere without letting the air go limp.`;
    default:
      return `${label} earns its place when the turn needs shape, contrast, and enough detail to keep the next move honest.`;
  }
};

const buildArtistContextLine = (track: TrackReference) => {
  const family = getTrackFamily(track);
  const albumRef = buildAlbumReference(track);
  const albumLine = albumRef
    ? `On ${albumRef}, it reads as part of a larger album world instead of a stray file in the crate.`
    : null;

  const familyLine =
    family === "ensemble"
      ? `${track.artist} makes the most sense here as an ensemble proposition: the interest is in how the parts talk to each other, not just one lead line.`
      : family === "pulse"
        ? `With ${track.artist}, the useful clue is usually in the construction: low end, drum programming, and how the groove is released layer by layer.`
        : family === "pocket"
          ? `With ${track.artist}, the draw is usually in the pocket and the human touch inside it, not just a surface-level style label.`
          : family === "band"
            ? `With ${track.artist}, the attraction is often attack and arrangement economy: what the band can say quickly and physically.`
            : family === "story"
              ? `With ${track.artist}, phrasing and vocal or acoustic grain do most of the emotional work, which is why the record can reset the scale of the hour.`
              : family === "rhythm"
                ? `With ${track.artist}, cadence and low-end placement are often the real control points, so the record can steer the hour without overstating itself.`
                : family === "space"
                  ? `With ${track.artist}, the atmosphere is part of the composition, not decoration spread on top.`
                  : `${track.artist} matters here because the records feel authored and directional, not anonymous.`;

  return uniqueStrings([familyLine, albumLine], 2).join(" ");
};

const buildTrackContextLine = (track: TrackReference) => {
  const family = getTrackFamily(track);
  const shortRuntime = typeof track.duration === "number" && track.duration < 180;
  const longRuntime = typeof track.duration === "number" && track.duration >= 11 * 60;
  const highRes =
    Boolean(track.lossless) && ((track.bitsPerSample ?? 0) > 16 || (track.sampleRate ?? 0) > 48000);

  const coreLine =
    family === "ensemble"
      ? shortRuntime
        ? "This one behaves like a quick ensemble burst rather than a patient suite, so the hook is in the shove of the group and the way the voicings keep changing weight."
        : "This one earns its space through moving parts: sections shifting roles, rhythm pushing from underneath, and an arrangement that keeps relocating the center."
      : family === "pulse"
        ? "The record sells itself through the engine underneath it: kick, bass pressure, and the little bits of motion that keep the loop from going flat."
        : family === "pocket"
          ? "The argument is in the pocket: bass, snare, guitar or keys locking together and nudging the song forward without overplaying it."
          : family === "band"
            ? shortRuntime
              ? "It does not waste bars: the hook arrives quickly, the arrangement stays clipped, and the exit leaves a clean runway for the next move."
              : "The record earns its place through how the arrangement opens and tightens rather than through sheer mass."
            : family === "story"
              ? "The cut lives or dies on phrasing and vocal or acoustic grain, which is why it reads as a human choice instead of wallpaper."
              : family === "rhythm"
                ? "The power is in cadence and low-end placement more than big harmonic turns, so the record can change the room without announcing itself with neon."
                : family === "space"
                  ? "The detail is in the air around the sound as much as in the notes themselves: sustain, echo, and how long each element hangs before the next one arrives."
                  : "The record earns its keep by changing the picture through detail and pressure, not just by matching the metadata on the last song.";

  const runtimeLine = longRuntime
    ? "Its runtime makes it act more like a suite than a simple song, so every section has to earn its place."
    : null;
  const formatLine = highRes
    ? "This copy is genuinely high-resolution, so texture and room detail are part of the conversation."
    : null;

  return uniqueStrings([coreLine, runtimeLine, formatLine], 3).join(" ");
};

const buildSetHookLine = (track: TrackReference) => {
  const family = getTrackFamily(track);

  switch (family) {
    case "ensemble":
      return "Reach for it when the set needs lift, conversation between parts, and something that can move without turning blunt.";
    case "pulse":
      return "Reach for it when the hour wants momentum with architecture, not just a louder kick drum.";
    case "pocket":
      return "Reach for it when the stack needs body, patience, and a groove that persuades instead of shouts.";
    case "band":
      return "Reach for it when the turn needs shape, attack, and a record that can define the next move in just a few bars.";
    case "story":
      return "Reach for it when the hour needs the human voice or acoustic grain to reset the emotional scale.";
    case "rhythm":
      return "Reach for it when the pressure needs to come from the pocket and the cadence rather than from a giant arrangement swing.";
    case "space":
      return "Reach for it when the air needs depth and atmosphere without losing the thread of motion underneath.";
    default:
      return `Reach for it when ${describeSetUse(track)}.`;
  }
};

const buildListenForLine = (track: TrackReference) => {
  const family = getTrackFamily(track);
  const shortRuntime = typeof track.duration === "number" && track.duration < 180;
  const longRuntime = typeof track.duration === "number" && track.duration >= 11 * 60;

  if (longRuntime) {
    return "Listen for the long-form architecture: where tension is added, where it is released, and how the piece earns the time it asks for.";
  }

  switch (family) {
    case "ensemble":
      return "Listen for how the lead line, horns or keys, and the rhythm section keep trading weight instead of sitting in fixed roles.";
    case "pulse":
      return "Listen for the engine underneath the track: kick, bass, and the tiny percussion or synth shifts that keep the motion alive.";
    case "pocket":
      return "Listen to what the rhythm section is doing behind the lead, especially the bass turns, ghost notes, and little pushes that make the groove lean forward.";
    case "band":
      return shortRuntime
        ? "Listen for how quickly the arrangement states its case and how neatly the band clears the runway for the next section."
        : "Listen for where the arrangement opens wider than the first impression suggests, especially when the rhythm section changes the floor under the lead.";
    case "story":
      return "Listen for phrasing, breath, and the way tiny changes in delivery make the emotional pressure jump.";
    case "rhythm":
      return "Listen for how the cadence and the low end keep re-framing the center of the track without resorting to big obvious turns.";
    case "space":
      return "Listen for the negative space: tails, echoes, and the way the sound keeps moving even when the surface feels still.";
    default:
      return "Listen for the point where the record suddenly feels larger than the speakers and starts changing the shape of the room.";
  }
};

const describeSetUse = (track: TrackReference) => {
  const energy = track.energy ?? 0.5;
  const duration = track.duration ?? 0;
  const primaryGenre = normalizeInsightText(buildGenreLabel(track));

  if (duration >= 11 * 60) return "the hour can stand a record that rewrites the room instead of just decorating it";
  if (primaryGenre.includes("ambient") || primaryGenre.includes("dub"))
    return "the stack needs atmosphere, depth, and patience instead of a blunt push";
  if (primaryGenre.includes("jazz") || primaryGenre.includes("soul"))
    return "the transition needs touch, warmth, and human detail";
  if (primaryGenre.includes("house") || primaryGenre.includes("techno") || energy >= 0.82)
    return "the set wants momentum without giving up shape";
  if (energy <= 0.34) return "the air needs tension held quietly rather than shouted";
  if (energy >= 0.66) return "the turn needs lift, color, and a decisive next move";
  return "the sequence needs a record that can keep moving and still leave detail behind";
};

const describeListenFor = (track: TrackReference) => {
  const primaryGenre = normalizeInsightText(buildGenreLabel(track));
  const duration = track.duration ?? 0;
  const energy = track.energy ?? 0.5;

  if (duration >= 11 * 60) {
    return "Listen for the long-form architecture: the way tension is added in layers and how the piece earns its runtime instead of merely occupying it.";
  }
  if (primaryGenre.includes("ambient") || primaryGenre.includes("dub")) {
    return "Listen for the space around the sound: tails, echoes, and the way the mix keeps moving even when the surface feels still.";
  }
  if (primaryGenre.includes("jazz")) {
    return "Listen for the conversational detail inside the groove, especially the way the rhythm section keeps reshaping the floor under the lead.";
  }
  if (primaryGenre.includes("soul") || primaryGenre.includes("r b") || primaryGenre.includes("rnb")) {
    return "Listen for how the rhythm and the vocal feel like they are leaning into each other rather than simply sharing the same beat.";
  }
  if (primaryGenre.includes("house") || primaryGenre.includes("techno") || energy >= 0.82) {
    return "Listen for the engine under the track: the kick, the pressure in the bass, and the little bits of motion that keep the record from turning flat.";
  }
  if (energy <= 0.34) {
    return "Listen for how little the record needs in order to hold the room, especially the spacing between phrases and the weight of the reverb tail.";
  }
  return "Listen for the moment the arrangement opens wider than its first impression, especially in the push-pull between the groove and the lead.";
};

const buildFormatFacts = (track: TrackReference) => {
  const facts: string[] = [];
  const highRes =
    Boolean(track.lossless) &&
    ((track.bitsPerSample ?? 0) > 16 || (track.sampleRate ?? 0) > 48000);
  if (highRes) {
    facts.push(
      `This library copy is high-resolution${track.bitsPerSample ? ` ${track.bitsPerSample}-bit` : ""}${
        track.sampleRate ? ` / ${track.sampleRate / 1000}kHz` : ""
      }, so texture matters here.`
    );
  } else if (track.lossless) {
    facts.push("This copy is lossless, which makes the textural detail a real part of the pitch.");
  }

  if (track.duration && track.duration >= 11 * 60) {
    facts.push("It is long enough to behave like a suite, not just a song.");
  } else if (track.duration && track.duration >= 6 * 60) {
    facts.push("Its runtime gives it enough runway to change the shape of the set instead of just touching it.");
  }

  return facts;
};

const buildHeuristicFunFacts = (track: TrackReference) => {
  const facts: string[] = [];
  const decade = buildDecadeLabel(track);
  const genre = buildGenreLabel(track);
  const family = getTrackFamily(track);

  if (typeof track.year === "number" && decade) {
    facts.push(`The year stamp puts it squarely in a ${decade} color palette.`);
  }
  if (track.album) {
    facts.push(`Hearing it against ${track.album} matters because it reads like part of an album world, not a detached single.`);
  }
  if (genre) {
    facts.push(`Its strongest public-facing clue is ${genre}, but that label only gets you part of the way there.`);
  }
  if (family === "ensemble" && typeof track.duration === "number" && track.duration < 180) {
    facts.push("Its runtime makes it land like an ensemble flare rather than a sprawling suite.");
  }
  if (family === "band" && typeof track.duration === "number" && track.duration < 200) {
    facts.push("It gets in and out quickly, which is part of why it can sharpen a set without weighing it down.");
  }
  if (family === "space" && track.lossless) {
    facts.push("This is the kind of record where a lossless copy really changes how the decay and room tone register.");
  }

  return uniqueStrings([...facts, ...buildFormatFacts(track)], 4);
};

const buildSonicSignatures = (track: TrackReference) => {
  const signatures = [
    buildGenreLabel(track),
    describeEnergy(track.energy),
    track.duration && track.duration >= 11 * 60
      ? "long-form structure"
      : track.duration && track.duration >= 6 * 60
        ? "extended runtime"
        : null,
    track.lossless ? "lossless texture" : null,
    buildDecadeLabel(track) ? `${buildDecadeLabel(track)} palette` : null
  ];

  return uniqueStrings(signatures, 6);
};

const buildRequestTags = (track: TrackReference) => {
  const decade = buildDecadeLabel(track);
  const tags = [
    track.artist,
    buildTrackTitleCore(track.title),
    track.album,
    buildGenreLabel(track),
    ...(track.genres ?? []),
    ...(track.moodTags ?? []),
    decade,
    track.lossless ? "lossless" : null,
    Boolean(track.lossless) &&
    ((track.bitsPerSample ?? 0) > 16 || (track.sampleRate ?? 0) > 48000)
      ? "high-res"
      : null,
    track.duration && track.duration >= 11 * 60 ? "long-form" : null,
    track.duration && track.duration >= 6 * 60 ? "extended" : null
  ];

  return uniqueStrings(
    tags.flatMap((value) => {
      const normalized = normalizeInsightText(value);
      if (!normalized) return [];
      return uniqueStrings([normalized, ...normalized.split(" ")], 6);
    }),
    18
  );
};

export const buildTrackCanonicalKey = (track: Pick<TrackReference, "title" | "artist" | "album" | "year">) => {
  const payload = [
    normalizeInsightText(track.artist),
    normalizeInsightText(buildTrackTitleCore(track.title)),
    normalizeInsightText(track.album),
    typeof track.year === "number" ? String(track.year) : ""
  ].join("::");
  return createHash("sha1").update(payload).digest("hex").slice(0, 24);
};

export const buildTrackInsightScaffold = (track: TrackReference): TrackInsight => {
  const summary = buildSummaryLine(track);
  const artistContext = buildArtistContextLine(track);
  const trackContext = buildTrackContextLine(track);
  const setHook = buildSetHookLine(track);
  const listenFor = buildListenForLine(track);
  const requestTags = buildRequestTags(track);
  const sonicSignatures = buildSonicSignatures(track);
  const funFacts = buildHeuristicFunFacts(track);
  const boothMemories: string[] = [];
  const embeddingText = [
    buildTrackLabel(track),
    summary,
    artistContext,
    trackContext,
    setHook,
    listenFor,
    ...funFacts,
    ...sonicSignatures
  ]
    .filter(Boolean)
    .join(" ");

  return {
    canonicalKey: buildTrackCanonicalKey(track),
    ...(track.id ? { trackId: track.id } : {}),
    title: track.title,
    artist: track.artist,
    ...(track.album ? { album: track.album } : {}),
    ...(typeof track.year === "number" ? { year: track.year } : {}),
    summary,
    artistContext,
    trackContext,
    setHook,
    listenFor,
    requestTags,
    sonicSignatures,
    funFacts,
    boothMemories,
    embeddingText,
    confidence: 0.38,
    playCount: 0,
    refinementCount: 0,
    source: "heuristic"
  };
};

export const buildTrackKnowledgeCard = (
  track: TrackReference,
  insight?: TrackInsight | PromptTrackInsight | null
): TrackKnowledgeCard => {
  const fallback = buildTrackInsightScaffold(track);
  const resolved = insight ?? fallback;
  const summary = pickSpecificKnowledgeLine(
    [resolved.summary, resolved.trackContext, resolved.artistContext],
    "track",
    fallback.summary,
    320
  );
  const historicalAnchor = pickSpecificKnowledgeLine(
    [resolved.artistContext, ...resolved.funFacts, resolved.summary, resolved.trackContext],
    "history",
    fallback.artistContext,
    300
  );
  const trackStory = pickSpecificKnowledgeLine(
    [resolved.trackContext, resolved.listenFor, ...resolved.funFacts, resolved.summary],
    "track",
    fallback.trackContext,
    320
  );
  const setReason = pickSpecificKnowledgeLine(
    [resolved.setHook, resolved.summary, resolved.trackContext],
    "set",
    fallback.setHook,
    240
  );
  const listenFor = ensureListenLead(
    pickSpecificKnowledgeLine(
      [resolved.listenFor, resolved.trackContext, ...resolved.funFacts],
      "listen",
      fallback.listenFor,
      260
    ),
    fallback.listenFor,
    260
  );
  const passionLine = pickSpecificKnowledgeLine(
    [stripListenLead(listenFor), resolved.trackContext, resolved.summary, ...resolved.funFacts],
    "track",
    fallback.trackContext,
    240
  );

  return {
    summary,
    historicalAnchor,
    trackStory,
    setReason,
    listenFor,
    passionLine,
    funFacts: sanitizeFunFacts(resolved.funFacts, fallback.funFacts, 6),
    requestHooks: sanitizeInsightTags(resolved.requestTags, fallback.requestTags, 12),
    confidence: resolved.confidence,
    playCount: resolved.playCount ?? 0,
    refinementCount: resolved.refinementCount ?? 0,
    source: resolved.source
  };
};

const parseEmbedding = (value: Prisma.JsonValue | null) => {
  if (!Array.isArray(value)) return null;
  const vector = value.filter((item): item is number => typeof item === "number" && Number.isFinite(item));
  return vector.length > 0 ? vector : null;
};

const rowToInsight = (row: LibraryTrackInsightRow): TrackInsight => ({
  canonicalKey: row.canonicalKey,
  ...(row.trackId ? { trackId: row.trackId } : {}),
  title: row.title,
  artist: row.artist,
  ...(row.album ? { album: row.album } : {}),
  ...(typeof row.year === "number" ? { year: row.year } : {}),
  summary: row.summary,
  artistContext: row.artistContext,
  trackContext: row.trackContext,
  setHook: row.setHook,
  listenFor: row.listenFor,
  requestTags: row.requestTags,
  sonicSignatures: row.sonicSignatures,
  funFacts: row.funFacts,
  boothMemories: row.boothMemories,
  embeddingText: row.embeddingText,
  confidence: row.confidence,
  playCount: row.playCount,
  refinementCount: row.refinementCount,
  ...(row.lastPlayedAt ? { lastPlayedAt: row.lastPlayedAt.toISOString() } : {}),
  ...(row.lastAnalyzedAt ? { lastAnalyzedAt: row.lastAnalyzedAt.toISOString() } : {}),
  source:
    row.source === "booth" || row.source === "hybrid"
      ? row.source
      : "heuristic"
});

const mergeInsight = (scaffold: TrackInsight, existing?: LibraryTrackInsightRow | null): TrackInsight => {
  if (!existing) return scaffold;
  const row = rowToInsight(existing);
  const merged: TrackInsight = {
    ...scaffold,
    ...row,
    requestTags: uniqueStrings([...row.requestTags, ...scaffold.requestTags], 18),
    sonicSignatures: uniqueStrings([...row.sonicSignatures, ...scaffold.sonicSignatures], 8),
    funFacts: uniqueStrings([...row.funFacts, ...scaffold.funFacts], 6),
    boothMemories: uniqueStrings(row.boothMemories, 8),
    embeddingText: row.embeddingText || scaffold.embeddingText,
    confidence: Math.max(row.confidence, scaffold.confidence),
    playCount: Math.max(row.playCount, scaffold.playCount),
    refinementCount: Math.max(row.refinementCount, scaffold.refinementCount),
    source: row.source
  };

  return merged;
};

const buildInsightUpdate = (
  track: TrackReference,
  scaffold: TrackInsight,
  existing?: LibraryTrackInsightRow | null
) => {
  const preserved = existing ? rowToInsight(existing) : null;
  const keepAuthored = Boolean(existing) && ((existing?.refinementCount ?? 0) > 0 || existing?.source !== "heuristic");

  const mergedInsight = {
    ...scaffold,
    ...(preserved
      ? {
          summary: keepAuthored ? preserved.summary : scaffold.summary,
          artistContext: keepAuthored ? preserved.artistContext : scaffold.artistContext,
          trackContext: keepAuthored ? preserved.trackContext : scaffold.trackContext,
          setHook: keepAuthored ? preserved.setHook : scaffold.setHook,
          listenFor: keepAuthored ? preserved.listenFor : scaffold.listenFor,
          requestTags: uniqueStrings([...preserved.requestTags, ...scaffold.requestTags], 18),
          sonicSignatures: uniqueStrings([...preserved.sonicSignatures, ...scaffold.sonicSignatures], 8),
          funFacts: uniqueStrings([...preserved.funFacts, ...scaffold.funFacts], 6),
          boothMemories: uniqueStrings(preserved.boothMemories, 8),
          confidence: Math.max(preserved.confidence, scaffold.confidence),
          playCount: preserved.playCount,
          refinementCount: preserved.refinementCount,
          source: preserved.source
        }
      : {})
  } satisfies TrackInsight;

  const payload = {
    trackId: track.id,
    title: track.title,
    artist: track.artist,
    album: track.album ?? null,
    year: typeof track.year === "number" ? track.year : null,
    summary: mergedInsight.summary,
    artistContext: mergedInsight.artistContext,
    trackContext: mergedInsight.trackContext,
    setHook: mergedInsight.setHook,
    listenFor: mergedInsight.listenFor,
    requestTags: mergedInsight.requestTags,
    sonicSignatures: mergedInsight.sonicSignatures,
    funFacts: mergedInsight.funFacts,
    boothMemories: mergedInsight.boothMemories,
    embeddingText: mergedInsight.embeddingText,
    confidence: mergedInsight.confidence,
    source: mergedInsight.source,
    playCount: mergedInsight.playCount,
    refinementCount: mergedInsight.refinementCount,
    lastPlayedAt: existing?.lastPlayedAt ?? null,
    lastAnalyzedAt: existing?.lastAnalyzedAt ?? null
  };

  return {
    canonicalKey: scaffold.canonicalKey,
    payload
  };
};

const shouldRefreshTrackAnalysis = (existing?: LibraryTrackInsightRow | null) => {
  if (!config.CHESHIRE_BASE_URL) return false;
  if (!existing) return true;
  const hoursSinceLastAnalysis = existing.lastAnalyzedAt
    ? (Date.now() - existing.lastAnalyzedAt.getTime()) / (60 * 60 * 1000)
    : Number.POSITIVE_INFINITY;

  if (hoursSinceLastAnalysis < config.RADIO_TRACK_ANALYSIS_COOLDOWN_HOURS) {
    return false;
  }
  if (existing.source === "heuristic") return true;
  if (existing.confidence < 0.76) return true;
  if (existing.refinementCount < 2) return true;
  if (existing.playCount >= 3) return true;
  return false;
};

const buildTrackInsightAnalysisPrompt = (track: TrackReference, insight: TrackInsight) =>
  JSON.stringify({
    station: {
      name: "Mr Rassy Radio",
      host: "Mr Rassy",
      creator: "Ian Rasmussen"
    },
    track: {
      title: track.title,
      artist: track.artist,
      album: track.album,
      year: track.year,
      genres: track.genres?.slice(0, 3),
      duration: track.duration,
      energy: track.energy,
      format: track.format,
      sampleRate: track.sampleRate,
      bitsPerSample: track.bitsPerSample,
      bitrate: track.bitrate,
      lossless: track.lossless
    },
    currentKnowledge: {
      summary: insight.summary,
      artistContext: insight.artistContext,
      trackContext: insight.trackContext,
      setHook: insight.setHook,
      listenFor: insight.listenFor,
      requestTags: insight.requestTags.slice(0, 8),
      sonicSignatures: insight.sonicSignatures.slice(0, 6),
      funFacts: insight.funFacts.slice(0, 4),
      boothMemories: insight.boothMemories.slice(0, 3),
      playCount: insight.playCount,
      refinementCount: insight.refinementCount,
      confidence: insight.confidence,
      source: insight.source
    },
    guidance: [
      "Favor real music knowledge over empty DJ adjectives.",
      "If a historical detail is uncertain, say less and pivot to sound, arrangement, or lineage.",
      "Make this useful for booth notes, request-line answers, and track writeups."
    ]
  });

const requestTrackInsightAnalysis = async (
  track: TrackReference,
  insight: TrackInsight
): Promise<TrackInsightAnalysis | null> => {
  if (!config.CHESHIRE_BASE_URL) return null;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), config.RADIO_TRACK_ANALYSIS_TIMEOUT_MS);
  try {
    const response = await fetch(`${config.CHESHIRE_BASE_URL.replace(/\/$/, "")}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-cheshire-client": "radio-controller",
        "x-cheshire-purpose": "track-intelligence-analysis",
        "x-cheshire-lane": "analysis",
        "x-cheshire-priority": "low",
        "x-cheshire-queue-wait-ms": "2500",
        "x-cheshire-timeout-ms": String(Math.max(1000, config.RADIO_TRACK_ANALYSIS_TIMEOUT_MS - 750)),
        ...(config.CHESHIRE_API_KEY ? { Authorization: `Bearer ${config.CHESHIRE_API_KEY}` } : {})
      },
      body: JSON.stringify({
        model: config.CHESHIRE_MODEL,
        temperature: 0.26,
        max_tokens: 520,
        response_format: {
          type: "json_object"
        },
        messages: [
          {
            role: "system",
            content: TRACK_INSIGHT_ANALYSIS_SYSTEM_PROMPT
          },
          {
            role: "user",
            content: buildTrackInsightAnalysisPrompt(track, insight)
          }
        ]
      }),
      signal: controller.signal
    });
    if (!response.ok) {
      return null;
    }
    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: unknown } }>;
    };
    const content = readStructuredMessageText(payload.choices?.[0]?.message?.content);
    if (!content) {
      return null;
    }
    const parsedPayload = JSON.parse(extractJsonPayload(content)) as Record<string, unknown>;
    const parsed = TRACK_INSIGHT_ANALYSIS_SCHEMA.safeParse(parsedPayload);
    if (!parsed.success) {
      logger.warn(
        {
          trackId: track.id,
          title: track.title,
          issues: parsed.error.issues.slice(0, 5)
        },
        "Track-intelligence analysis schema validation failed"
      );
      return null;
    }
    return {
      summary: pickSpecificKnowledgeLine(
        [parsed.data.summary, parsed.data.trackContext, parsed.data.setHook],
        "track",
        insight.summary,
        320
      ),
      artistContext: pickSpecificKnowledgeLine(
        [parsed.data.artistContext, ...parsed.data.funFacts, parsed.data.summary],
        "history",
        insight.artistContext,
        360
      ),
      trackContext: pickSpecificKnowledgeLine(
        [parsed.data.trackContext, parsed.data.listenFor, ...parsed.data.funFacts, parsed.data.summary],
        "track",
        insight.trackContext,
        360
      ),
      setHook: pickSpecificKnowledgeLine(
        [parsed.data.setHook, parsed.data.summary, parsed.data.trackContext],
        "set",
        insight.setHook,
        220
      ),
      listenFor: ensureListenLead(
        pickSpecificKnowledgeLine(
          [parsed.data.listenFor, parsed.data.trackContext, ...parsed.data.funFacts],
          "listen",
          insight.listenFor,
          260
        ),
        insight.listenFor,
        260
      ),
      requestTags: sanitizeInsightTags(parsed.data.requestTags, insight.requestTags, 18),
      sonicSignatures: sanitizeInsightPhrases(parsed.data.sonicSignatures, insight.sonicSignatures, 8),
      funFacts: sanitizeFunFacts(parsed.data.funFacts, insight.funFacts, 6),
      confidence: clamp(parsed.data.confidence, 0.52, 0.98)
    };
  } catch (error) {
    logger.warn({ error, trackId: track.id, title: track.title }, "Failed to deepen track insight");
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
};

const buildAnalyzedInsightUpdate = (
  track: TrackReference,
  scaffold: TrackInsight,
  analysis: TrackInsightAnalysis,
  existing?: LibraryTrackInsightRow | null
) => {
  const preserved = existing ? rowToInsight(existing) : scaffold;
  const summary = sanitizeInsightSentence(analysis.summary, preserved.summary || scaffold.summary, 320);
  const artistContext = sanitizeInsightSentence(
    analysis.artistContext,
    preserved.artistContext || scaffold.artistContext,
    360
  );
  const trackContext = sanitizeInsightSentence(
    analysis.trackContext,
    preserved.trackContext || scaffold.trackContext,
    360
  );
  const setHook = sanitizeInsightSentence(analysis.setHook, preserved.setHook || scaffold.setHook, 220);
  const listenFor = sanitizeInsightSentence(
    analysis.listenFor,
    preserved.listenFor || scaffold.listenFor,
    260
  );
  const requestTags = sanitizeInsightTags(
    [...analysis.requestTags, ...preserved.requestTags],
    scaffold.requestTags,
    18
  );
  const sonicSignatures = sanitizeInsightPhrases(
    [...analysis.sonicSignatures, ...preserved.sonicSignatures],
    scaffold.sonicSignatures,
    8
  );
  const funFacts = sanitizeFunFacts([...analysis.funFacts, ...preserved.funFacts], scaffold.funFacts, 6);
  const boothMemories = uniqueStrings(preserved.boothMemories, 8);
  const embeddingText = uniqueStrings(
    [
      buildTrackLabel(track),
      summary,
      artistContext,
      trackContext,
      setHook,
      listenFor,
      ...funFacts,
      ...sonicSignatures,
      ...boothMemories.slice(0, 2)
    ],
    12
  ).join(" ");
  const confidence = clamp(
    Math.max(existing?.confidence ?? scaffold.confidence, analysis.confidence, 0.58),
    0.38,
    0.98
  );
  const payload = {
    trackId: track.id,
    title: track.title,
    artist: track.artist,
    album: track.album ?? null,
    year: typeof track.year === "number" ? track.year : null,
    summary,
    artistContext,
    trackContext,
    setHook,
    listenFor,
    requestTags,
    sonicSignatures,
    funFacts,
    boothMemories,
    embeddingText,
    confidence,
    source: "hybrid" as const,
    playCount: existing?.playCount ?? scaffold.playCount,
    refinementCount: (existing?.refinementCount ?? scaffold.refinementCount) + 1,
    lastPlayedAt: existing?.lastPlayedAt ?? null,
    lastAnalyzedAt: new Date()
  };

  return {
    canonicalKey: scaffold.canonicalKey,
    payload
  };
};

const mapWithConcurrency = async <T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>
) => {
  if (items.length === 0) return;
  const active = new Set<Promise<void>>();
  for (const item of items) {
    const task = worker(item).finally(() => {
      active.delete(task);
    });
    active.add(task);
    if (active.size >= concurrency) {
      await Promise.race(active);
    }
  }
  await Promise.all(active);
};

const fetchEmbeddings = async (input: string[]) => {
  if (!config.CHESHIRE_BASE_URL || input.length === 0) return null;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4_500);
  try {
    const response = await fetch(`${config.CHESHIRE_BASE_URL.replace(/\/$/, "")}/v1/embeddings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-cheshire-client": "radio-controller",
        "x-cheshire-purpose": "track-intelligence-embedding",
        "x-cheshire-lane": "embeddings",
        "x-cheshire-priority": "low",
        "x-cheshire-queue-wait-ms": "2500",
        "x-cheshire-timeout-ms": "4000",
        ...(config.CHESHIRE_API_KEY ? { Authorization: `Bearer ${config.CHESHIRE_API_KEY}` } : {})
      },
      body: JSON.stringify({
        model: config.RADIO_EMBED_MODEL,
        input
      }),
      signal: controller.signal
    });
    if (!response.ok) {
      return null;
    }
    const payload = (await response.json()) as {
      data?: Array<{ embedding?: number[] }>;
      embedding?: number[];
    };
    if (Array.isArray(payload.data) && payload.data.length > 0) {
      return payload.data
        .map((entry) =>
          Array.isArray(entry?.embedding)
            ? entry.embedding.filter((item): item is number => typeof item === "number" && Number.isFinite(item))
            : []
        )
        .filter((entry) => entry.length > 0);
    }
    if (Array.isArray(payload.embedding)) {
      const vector = payload.embedding.filter(
        (item): item is number => typeof item === "number" && Number.isFinite(item)
      );
      return vector.length > 0 ? [vector] : null;
    }
    return null;
  } catch (error) {
    logger.warn({ error }, "Failed to refresh track-intelligence embeddings");
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
};

const buildRerankDocument = (track: TrackReference, insight: PromptTrackInsight) =>
  uniqueStrings(
    [
      track.title,
      track.artist,
      track.album,
      track.year ? String(track.year) : "",
      ...(track.genres ?? []),
      ...(track.moodTags ?? []),
      insight.summary,
      insight.artistContext,
      insight.trackContext,
      insight.setHook,
      insight.listenFor,
      ...(insight.requestTags ?? []),
      ...(insight.sonicSignatures ?? []),
      ...(insight.funFacts ?? [])
    ],
    18
  ).join("\n");

const fetchRerankScores = async (
  query: string,
  documents: Array<{ trackId: string; text: string }>
) => {
  if (!config.RADIO_RERANK_ENABLED || !config.CHESHIRE_BASE_URL || documents.length === 0) {
    return null;
  }
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 9_000);
  try {
    const response = await fetch(`${config.CHESHIRE_BASE_URL.replace(/\/$/, "")}/v1/rerank`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-cheshire-client": "radio-controller",
        "x-cheshire-purpose": "track-intelligence-rerank",
        "x-cheshire-lane": "embeddings",
        "x-cheshire-priority": "normal",
        "x-cheshire-queue-wait-ms": "4500",
        "x-cheshire-timeout-ms": "8500",
        ...(config.CHESHIRE_API_KEY ? { Authorization: `Bearer ${config.CHESHIRE_API_KEY}` } : {})
      },
      body: JSON.stringify({
        model: config.RADIO_RERANK_MODEL,
        query,
        documents: documents.map((document) => document.text),
        top_n: documents.length
      }),
      signal: controller.signal
    });
    if (!response.ok) {
      logger.warn({ status: response.status }, "Track-intelligence rerank request failed");
      return null;
    }
    const payload = (await response.json()) as {
      results?: Array<{
        index?: number;
        relevance_score?: number;
        score?: number;
      }>;
    };
    const scores = new Map<string, number>();
    for (const result of payload.results ?? []) {
      const index = typeof result.index === "number" ? result.index : -1;
      const document = documents[index];
      const score =
        typeof result.relevance_score === "number"
          ? result.relevance_score
          : typeof result.score === "number"
            ? result.score
            : null;
      if (!document || score === null || !Number.isFinite(score)) continue;
      scores.set(document.trackId, clamp(score, -1, 1));
    }
    return scores.size > 0 ? scores : null;
  } catch (error) {
    logger.warn({ error }, "Failed to rerank track-intelligence candidates");
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
};

const cosineSimilarity = (left: number[], right: number[]) => {
  const size = Math.min(left.length, right.length);
  if (size === 0) return 0;
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < size; index += 1) {
    const leftValue = left[index] ?? 0;
    const rightValue = right[index] ?? 0;
    dot += leftValue * rightValue;
    leftNorm += leftValue * leftValue;
    rightNorm += rightValue * rightValue;
  }
  if (leftNorm <= 0 || rightNorm <= 0) return 0;
  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
};

const buildRequestProfile = (message: string): RequestProfile => {
  const normalized = normalizeInsightText(message);
  const tokens = tokenizeInsightText(message);
  const decades = Array.from(
    new Set(
      [
        ...normalized.matchAll(/\b(19|20)\d0s\b/g),
        ...normalized.matchAll(/\b([3-9]0)s\b/g)
      ].map((match) => {
        const token = match[0]!.trim();
        return /^\d0s$/.test(token) ? `19${token}` : token;
      })
    )
  );

  return {
    normalized,
    tokens,
    decades,
    broadLane:
      /\b(anything|feel|feeling|lane|mood|more like|pocket|same decade|same artist|set|something|take it)\b/.test(
        normalized
      ),
    wantsDeepCut: /\b(album cut|deep cut|side door|sleeper)\b/.test(normalized)
  };
};

const scoreTrackMetadataMatch = (track: TrackReference, profile: RequestProfile) => {
  if (!profile.normalized || profile.tokens.length === 0) return 0;
  const title = normalizeInsightText(buildTrackTitleCore(track.title));
  const artist = normalizeInsightText(track.artist);
  const album = normalizeInsightText(track.album);
  const genre = normalizeInsightText(buildGenreLabel(track));
  const combo = `${artist} ${title} ${album}`.trim();
  let score = 0;

  if (profile.normalized.includes(`${artist} ${title}`) || profile.normalized.includes(`${title} ${artist}`)) {
    score += 18;
  }
  if (title && (profile.normalized.includes(title) || title.includes(profile.normalized))) score += 12;
  if (artist && (profile.normalized.includes(artist) || artist.includes(profile.normalized))) score += 8;
  if (album && (profile.normalized.includes(album) || album.includes(profile.normalized))) score += 5;
  if (combo.includes(profile.normalized)) score += 6;
  if (genre && profile.normalized.includes(genre)) score += 4;
  if (buildDecadeLabel(track) && profile.decades.includes(normalizeInsightText(buildDecadeLabel(track)))) {
    score += 4;
  }
  if (profile.wantsDeepCut && track.album) {
    score += 1.4;
  }

  for (const token of profile.tokens) {
    if (title.includes(token)) score += 1.7;
    if (artist.includes(token)) score += 1.3;
    if (album.includes(token)) score += 0.8;
    if (genre.includes(token)) score += 1.1;
    if ((track.moodTags ?? []).some((tag) => normalizeInsightText(tag).includes(token))) score += 0.9;
  }

  return score;
};

const scoreInsightMatch = (
  insight: PromptTrackInsight | TrackInsight,
  profile: RequestProfile,
  queryEmbedding: number[] | null,
  trackEmbedding: number[] | null
) => {
  let score = 0;
  const knowledgeText = normalizeInsightText(
    [
      insight.summary,
      insight.artistContext,
      insight.trackContext,
      insight.setHook,
      insight.listenFor,
      ...insight.boothMemories.slice(0, 3)
    ].join(" ")
  );

  for (const token of profile.tokens) {
    if (insight.requestTags.some((tag) => tag.includes(token))) score += 1.3;
    if (insight.sonicSignatures.some((tag) => normalizeInsightText(tag).includes(token))) score += 1.05;
    if (knowledgeText.includes(token)) score += 0.5;
  }

  if (profile.wantsDeepCut && insight.requestTags.some((tag) => tag.includes("album"))) {
    score += 2;
  }

  if (queryEmbedding && trackEmbedding) {
    const similarity = cosineSimilarity(queryEmbedding, trackEmbedding);
    if (similarity > 0.16) {
      score += similarity * 7.5;
    }
  }

  score += Math.min(1.8, insight.refinementCount * 0.2);
  score += Math.min(1.4, insight.playCount * 0.03);
  return score;
};

export const buildTrackTurnIntelligence = (
  track: TrackReference,
  options: {
    insight?: TrackInsight | null;
    previousTrack?: TrackReference | null;
    nextTrack?: TrackReference | null;
    context?: Pick<DJContext, "mood" | "dayPart" | "programming"> | null;
  } = {}
): TrackTurnIntelligence => {
  const insight = options.insight ?? buildTrackInsightScaffold(track);
  const knowledge = buildTrackKnowledgeCard(track, insight);
  const previousTrack = options.previousTrack ?? null;
  const nextTrack = options.nextTrack ?? null;
  const sharedGenre = uniqueStrings([buildGenreLabel(track), buildGenreLabel(previousTrack ?? undefined)], 2)
    .filter(Boolean)
    .map((value) => value.toLowerCase());
  const previousLabel =
    previousTrack?.title && previousTrack.artist ? buildTrackLabel(previousTrack) : null;
  const nextLabel = nextTrack?.title && nextTrack.artist ? buildTrackLabel(nextTrack) : null;
  const energyDelta =
    typeof track.energy === "number" && typeof previousTrack?.energy === "number"
      ? track.energy - previousTrack.energy
      : 0;

  const transitionLine = previousLabel
    ? energyDelta > 0.12
      ? `${buildTrackLabel(track)} lifts the pressure after ${previousLabel} without snapping the thread.`
      : energyDelta < -0.12
        ? `${buildTrackLabel(track)} cools the temperature after ${previousLabel} and lets the turn breathe.`
        : sharedGenre.length > 0
          ? `${buildTrackLabel(track)} stays related to ${previousLabel} through ${sharedGenre[0]}, but changes the pocket enough to matter.`
          : `${buildTrackLabel(track)} answers ${previousLabel} with a different angle instead of a copycat move.`
    : knowledge.setReason;

  const whyItFits = uniqueStrings(
    [
      transitionLine,
      knowledge.setReason !== transitionLine ? knowledge.setReason : null,
      nextLabel ? `It leaves ${nextLabel} a clean lane instead of boxing the handoff in.` : null,
      options.context?.programming?.mode === "special" && options.context.programming.label
        ? `Inside ${options.context.programming.label}, it still feels like a real choice rather than a decorative one.`
        : null
    ],
    3
  ).join(" ");

  const context = uniqueStrings(
    [
      knowledge.summary,
      knowledge.historicalAnchor,
      knowledge.trackStory
    ],
    3
  ).join(" ");

  const listenFor = uniqueStrings(
    [
      knowledge.listenFor,
      nextLabel ? `Notice how it hands the weight to ${nextLabel} instead of crowding the next move.` : null
    ],
    2
  ).join(" ");

  const factLine =
    pickSpecificKnowledgeLine(
      [
        knowledge.funFacts[0],
        knowledge.historicalAnchor,
        buildAlbumReference(track) ? `${buildAlbumReference(track)} is the cleanest frame around the record.` : null
      ],
      "history",
      knowledge.summary,
      220
    ) || knowledge.summary;

  return {
    whyItFits,
    context,
    listenFor,
    factLine,
    requestHooks: knowledge.requestHooks
  };
};

export const getTrackInsightMap = async (tracks: TrackReference[]): Promise<Map<string, PromptTrackInsight>> => {
  const validTracks = tracks.filter((track) => Boolean(track?.title) && Boolean(track?.artist));
  if (validTracks.length === 0) return new Map();

  const canonicalKeyByMapKey = new Map<string, string>();
  for (const track of validTracks) {
    canonicalKeyByMapKey.set(track.id, buildTrackCanonicalKey(track));
  }

  const rows = await prisma.libraryTrackInsight.findMany({
    where: {
      canonicalKey: {
        in: Array.from(new Set(canonicalKeyByMapKey.values()))
      }
    }
  });
  const rowByKey = new Map(rows.map((row) => [row.canonicalKey, row] as const));

  return new Map(
    validTracks.map((track) => {
      const scaffold = buildTrackInsightScaffold(track);
      const merged = mergeInsight(scaffold, rowByKey.get(scaffold.canonicalKey));
      return [
        track.id,
        {
          canonicalKey: merged.canonicalKey,
          ...(merged.trackId ? { trackId: merged.trackId } : {}),
          summary: merged.summary,
          artistContext: merged.artistContext,
          trackContext: merged.trackContext,
          setHook: merged.setHook,
          listenFor: merged.listenFor,
          requestTags: merged.requestTags,
          sonicSignatures: merged.sonicSignatures,
          funFacts: merged.funFacts,
          boothMemories: merged.boothMemories,
          confidence: merged.confidence,
          playCount: merged.playCount,
          refinementCount: merged.refinementCount,
          source: merged.source
        } satisfies PromptTrackInsight
      ];
    })
  );
};

export const syncTrackInsights = async (
  tracks: TrackReference[],
  options: { embed?: boolean; analyze?: boolean; analysisLimit?: number; limit?: number } = {}
) => {
  const workingTracks = tracks
    .filter((track) => Boolean(track?.title) && Boolean(track?.artist))
    .slice(0, typeof options.limit === "number" ? options.limit : tracks.length);

  if (workingTracks.length === 0) return;

  const scaffolds = workingTracks.map((track) => ({
    track,
    scaffold: buildTrackInsightScaffold(track)
  }));

  for (let index = 0; index < scaffolds.length; index += 80) {
    const chunk = scaffolds.slice(index, index + 80);
    const existingRows = await prisma.libraryTrackInsight.findMany({
      where: {
        canonicalKey: {
          in: chunk.map((item) => item.scaffold.canonicalKey)
        }
      }
    });
    const existingByKey = new Map(existingRows.map((row) => [row.canonicalKey, row] as const));

    const creates = chunk
      .filter((item) => !existingByKey.has(item.scaffold.canonicalKey))
      .map((item) => ({
        canonicalKey: item.scaffold.canonicalKey,
        trackId: item.track.id,
        title: item.track.title,
        artist: item.track.artist,
        album: item.track.album ?? null,
        year: typeof item.track.year === "number" ? item.track.year : null,
        summary: item.scaffold.summary,
        artistContext: item.scaffold.artistContext,
        trackContext: item.scaffold.trackContext,
        setHook: item.scaffold.setHook,
        listenFor: item.scaffold.listenFor,
        requestTags: item.scaffold.requestTags,
        sonicSignatures: item.scaffold.sonicSignatures,
        funFacts: item.scaffold.funFacts,
        boothMemories: item.scaffold.boothMemories,
        embeddingText: item.scaffold.embeddingText,
        confidence: item.scaffold.confidence,
        source: item.scaffold.source
      }));

    if (creates.length > 0) {
      await prisma.libraryTrackInsight.createMany({
        data: creates,
        skipDuplicates: true
      });
    }

    await mapWithConcurrency(
      chunk.filter((item) => existingByKey.has(item.scaffold.canonicalKey)),
      8,
      async (item) => {
        const next = buildInsightUpdate(item.track, item.scaffold, existingByKey.get(item.scaffold.canonicalKey));
        await prisma.libraryTrackInsight.update({
          where: { canonicalKey: next.canonicalKey },
          data: next.payload
        });
      }
    );

    if (options.analyze) {
      const analysisCandidates = chunk
        .map((item) => ({
          ...item,
          existing: existingByKey.get(item.scaffold.canonicalKey) ?? null
        }))
        .filter((item) => shouldRefreshTrackAnalysis(item.existing))
        .slice(0, typeof options.analysisLimit === "number" ? options.analysisLimit : 2);

      await mapWithConcurrency(analysisCandidates, 2, async ({ track, scaffold, existing }) => {
        if (inFlightTrackInsightAnalyses.has(scaffold.canonicalKey)) return;
        inFlightTrackInsightAnalyses.add(scaffold.canonicalKey);
        try {
          const latest = await prisma.libraryTrackInsight.findUnique({
            where: { canonicalKey: scaffold.canonicalKey }
          });
          const currentInsight = mergeInsight(scaffold, latest ?? existing);
          const analysis = await requestTrackInsightAnalysis(track, currentInsight);
          if (!analysis) return;
          const next = buildAnalyzedInsightUpdate(track, scaffold, analysis, latest ?? existing);
          await prisma.libraryTrackInsight.upsert({
            where: { canonicalKey: next.canonicalKey },
            update: next.payload,
            create: {
              canonicalKey: next.canonicalKey,
              ...next.payload
            }
          });
        } finally {
          inFlightTrackInsightAnalyses.delete(scaffold.canonicalKey);
        }
      });
    }

    if (!options.embed) {
      continue;
    }

    const refreshedRows = await prisma.libraryTrackInsight.findMany({
      where: {
        canonicalKey: {
          in: chunk.map((item) => item.scaffold.canonicalKey)
        }
      }
    });
    const embeddings = await fetchEmbeddings(refreshedRows.map((row) => row.embeddingText));
    if (!embeddings || embeddings.length === 0) {
      continue;
    }

    const embeddingUpdates = refreshedRows.slice(0, embeddings.length).map((row, rowIndex) => ({
      row,
      embedding: embeddings[rowIndex]
    }));
    await mapWithConcurrency(embeddingUpdates, 6, async ({ row, embedding }) => {
      if (!embedding || embedding.length === 0) return;
      await prisma.libraryTrackInsight.update({
        where: { canonicalKey: row.canonicalKey },
        data: {
          embeddingModel: config.RADIO_EMBED_MODEL,
          embedding: embedding as Prisma.InputJsonValue
        }
      });
    });
  }
};

export const learnTrackInsightsFromBoothDossier = async (
  payload: BoothDossierSnapshot,
  options: {
    resolveTrack?: (track: BoothLearningTrack) => TrackReference | null | undefined;
  } = {}
) => {
  const sessionTracks = payload.sessionTracks
    .filter((track) => Boolean(track.title) && Boolean(track.artist))
    .map((track) => track as BoothLearningTrack);
  if (sessionTracks.length === 0) return;

  const resolvedTracks = sessionTracks.map((sessionTrack, index) => {
    const resolved = options.resolveTrack?.(sessionTrack);
    const baseTrack: TrackReference =
      resolved ??
      ({
        id:
          sessionTrack.trackId ??
          buildTrackCanonicalKey({
            title: sessionTrack.title,
            artist: sessionTrack.artist,
            album: sessionTrack.album,
            year: sessionTrack.year
          }),
        title: sessionTrack.title,
        artist: sessionTrack.artist,
        album: sessionTrack.album,
        year: sessionTrack.year,
        energy: 0.5,
        genres: [],
        moodTags: []
      } satisfies TrackReference);

    return {
      index,
      sessionTrack,
      baseTrack,
      scaffold: buildTrackInsightScaffold(baseTrack)
    };
  });

  const rows = await prisma.libraryTrackInsight.findMany({
    where: {
      canonicalKey: {
        in: resolvedTracks.map((item) => item.scaffold.canonicalKey)
      }
    }
  });
  const rowByKey = new Map(rows.map((row) => [row.canonicalKey, row] as const));

  await mapWithConcurrency(resolvedTracks, 4, async ({ index, sessionTrack, baseTrack, scaffold }) => {
    const existing = rowByKey.get(scaffold.canonicalKey);
    const previous = existing ? rowToInsight(existing) : scaffold;
    const leadTrack = index === 0;
    const sharedLineup = leadTrack ? [payload.sections.lineup.body, payload.nextMove, payload.headline] : [payload.nextMove];
    const sharedContext = leadTrack ? [payload.sections.context.body, payload.deepCut, payload.intro] : [];
    const sharedListen = leadTrack ? [payload.sections.listenFor.body] : [];
    const learnableSignalCount = [
      isSpecificKnowledgeLine(sessionTrack.whyItFits, "set"),
      isSpecificKnowledgeLine(sessionTrack.context, "history") ||
        isSpecificKnowledgeLine(sessionTrack.context, "track"),
      isSpecificKnowledgeLine(sessionTrack.listenFor, "listen")
    ].filter(Boolean).length;
    const learnableBoothMemories = buildLearnableBoothMemories(
      [
        `${payload.headline}: ${sessionTrack.whyItFits}`,
        sessionTrack.context,
        sessionTrack.listenFor,
        leadTrack ? payload.sections.context.body : null,
        leadTrack ? payload.sections.listenFor.body : null
      ],
      previous.boothMemories,
      8
    );

    if ((!existing && learnableSignalCount < 2 && learnableBoothMemories.length < 2) || (existing && learnableSignalCount === 0 && learnableBoothMemories.length === 0)) {
      return;
    }

    const summary = pickSpecificKnowledgeLine(
      [sessionTrack.context, ...sharedContext, previous.summary, scaffold.summary],
      "track",
      previous.summary || scaffold.summary,
      300
    );
    const setHook = pickSpecificKnowledgeLine(
      [sessionTrack.whyItFits, ...sharedLineup, previous.setHook, scaffold.setHook],
      "set",
      previous.setHook || scaffold.setHook,
      240
    );
    const listenFor = ensureListenLead(
      joinInsightSentences([sessionTrack.listenFor, ...sharedListen, previous.listenFor, scaffold.listenFor], 2),
      previous.listenFor || scaffold.listenFor,
      260
    );
    const trackContext = joinInsightSentences(
      [
        pickSpecificKnowledgeLine(
          [sessionTrack.context, ...sharedContext, previous.trackContext, scaffold.trackContext],
          "track",
          previous.trackContext || scaffold.trackContext,
          320
        ),
        pickSpecificKnowledgeLine(
          [previous.artistContext, scaffold.artistContext],
          "history",
          scaffold.artistContext,
          260
        )
      ],
      3
    );
    const boothMemories = learnableBoothMemories;
    const requestTags = uniqueStrings(
      [...previous.requestTags, ...scaffold.requestTags, ...payload.tags.map((tag) => normalizeInsightText(tag))],
      18
    );
    const funFacts = uniqueStrings([...previous.funFacts, ...scaffold.funFacts], 6);
    const sonicSignatures = uniqueStrings([...previous.sonicSignatures, ...scaffold.sonicSignatures], 8);
    const source =
      previous.source === "booth" || previous.source === "hybrid" ? previous.source : "hybrid";
    const confidence = clamp(Math.max(previous.confidence, 0.72), 0.38, 0.96);
    const refinementCount = previous.refinementCount + 1;
    const embeddingText = uniqueStrings(
      [
        buildTrackLabel(baseTrack),
        summary,
        previous.artistContext || scaffold.artistContext,
        trackContext,
        setHook,
        listenFor,
        ...funFacts,
        ...boothMemories.slice(0, 3)
      ],
      10
    ).join(" ");

    await prisma.libraryTrackInsight.upsert({
      where: { canonicalKey: scaffold.canonicalKey },
      update: {
        trackId: baseTrack.id,
        title: baseTrack.title,
        artist: baseTrack.artist,
        album: baseTrack.album ?? null,
        year: typeof baseTrack.year === "number" ? baseTrack.year : null,
        summary,
        artistContext: previous.artistContext || scaffold.artistContext,
        trackContext,
        setHook,
        listenFor,
        requestTags,
        sonicSignatures,
        funFacts,
        boothMemories,
        embeddingText,
        confidence,
        source,
        refinementCount,
        lastAnalyzedAt: new Date()
      },
      create: {
        canonicalKey: scaffold.canonicalKey,
        trackId: baseTrack.id,
        title: baseTrack.title,
        artist: baseTrack.artist,
        album: baseTrack.album ?? null,
        year: typeof baseTrack.year === "number" ? baseTrack.year : null,
        summary,
        artistContext: scaffold.artistContext,
        trackContext,
        setHook,
        listenFor,
        requestTags,
        sonicSignatures,
        funFacts,
        boothMemories,
        embeddingText,
        confidence,
        source: "booth",
        refinementCount: 1,
        lastAnalyzedAt: new Date()
      }
    });
  });

  void syncTrackInsights(
    resolvedTracks.map((item) => item.baseTrack),
    {
      embed: true,
      analyze: true,
      analysisLimit: 2,
      limit: 4
    }
  );
};

export const recordTrackPlayInsight = async (track: TrackReference) => {
  try {
    const scaffold = buildTrackInsightScaffold(track);
    await prisma.libraryTrackInsight.upsert({
      where: { canonicalKey: scaffold.canonicalKey },
      update: {
        trackId: track.id,
        title: track.title,
        artist: track.artist,
        album: track.album ?? null,
        year: typeof track.year === "number" ? track.year : null,
        playCount: {
          increment: 1
        },
        lastPlayedAt: new Date()
      },
      create: {
        canonicalKey: scaffold.canonicalKey,
        trackId: track.id,
        title: track.title,
        artist: track.artist,
        album: track.album ?? null,
        year: typeof track.year === "number" ? track.year : null,
        summary: scaffold.summary,
        artistContext: scaffold.artistContext,
        trackContext: scaffold.trackContext,
        setHook: scaffold.setHook,
        listenFor: scaffold.listenFor,
        requestTags: scaffold.requestTags,
        sonicSignatures: scaffold.sonicSignatures,
        funFacts: scaffold.funFacts,
        boothMemories: scaffold.boothMemories,
        embeddingText: scaffold.embeddingText,
        confidence: scaffold.confidence,
        source: scaffold.source,
        playCount: 1,
        lastPlayedAt: new Date()
      }
    });
    void syncTrackInsights([track], {
      embed: true,
      analyze: true,
      analysisLimit: 1,
      limit: 1
    });
  } catch (error) {
    logger.warn({ error, trackId: track.id, title: track.title }, "Failed to record track insight play");
  }
};

export const rankTracksForRequestLine = async (
  message: string,
  tracks: TrackReference[],
  limit = 5
) => {
  const profile = buildRequestProfile(message);
  if (!profile.normalized || profile.tokens.length === 0) {
    return [];
  }

  const scoredMetadata = tracks
    .map((track) => ({
      track,
      score: scoreTrackMetadataMatch(track, profile)
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score);

  const shortlist = scoredMetadata.slice(0, Math.max(18, limit * 4)).map((entry) => entry.track);
  if (shortlist.length === 0) {
    return [];
  }

  const insights = await getTrackInsightMap(shortlist);
  const rerankScores = await fetchRerankScores(
    profile.normalized,
    shortlist.map((track) => ({
      trackId: track.id,
      text: buildRerankDocument(track, insights.get(track.id) ?? buildTrackInsightScaffold(track))
    }))
  );
  const vectorsByTrackId = new Map<string, number[] | null>();
  const rows = await prisma.libraryTrackInsight.findMany({
    where: {
      canonicalKey: {
        in: shortlist.map((track) => buildTrackCanonicalKey(track))
      }
    }
  });
  for (const row of rows) {
    const matchingTrack = shortlist.find((track) => buildTrackCanonicalKey(track) === row.canonicalKey);
    if (matchingTrack?.id) {
      vectorsByTrackId.set(matchingTrack.id, parseEmbedding(row.embedding));
    }
  }

  let queryEmbedding: number[] | null = null;
  if (profile.broadLane || profile.wantsDeepCut) {
    const embeddings = await fetchEmbeddings([profile.normalized]);
    queryEmbedding = embeddings?.[0] ?? null;
  }

  const ranked = scoredMetadata
    .slice(0, Math.max(18, limit * 4))
    .map((entry) => {
      const insight = insights.get(entry.track.id) ?? buildTrackInsightScaffold(entry.track);
      const vector = vectorsByTrackId.get(entry.track.id) ?? null;
      const rerankBoost = (rerankScores?.get(entry.track.id) ?? 0) * 5.5;
      return {
        track: entry.track,
        score: entry.score + scoreInsightMatch(insight, profile, queryEmbedding, vector) + rerankBoost
      };
    })
    .filter((entry) => entry.score >= (profile.broadLane ? 2.4 : 4))
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map((entry) => entry.track);

  if (ranked.length > 0) {
    void syncTrackInsights(ranked, {
      embed: true,
      analyze: true,
      analysisLimit: Math.min(2, ranked.length),
      limit: Math.min(6, ranked.length)
    });
  }

  return ranked;
};
