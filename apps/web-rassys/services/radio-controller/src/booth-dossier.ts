import type { DJContext, DJProgrammingInfo, DJTrackPlaybackPlan } from "./dj/interface";
import { buildTrackTurnIntelligence } from "./library/track-intelligence";

export type BoothDossierCard = {
  label: string;
  title: string;
  body: string;
};

export type BoothDossierSection = {
  title: string;
  body: string;
};

export type BoothDossierSessionTrack = {
  trackId?: string;
  title: string;
  artist: string;
  slot: number;
  role?: "now" | "next" | "later";
  whyItFits: string;
  context: string;
  listenFor: string;
  playbackMode?: "full" | "clip";
  playbackReason?: string;
};

export type BoothDossierProgrammingPlayback = {
  trackId?: string;
  title?: string;
  artist?: string;
  mode: "full" | "clip";
  segment?: "opening" | "middle" | "late";
  cueInSeconds?: number;
  cueOutSeconds?: number;
  fadeInSeconds?: number;
  fadeOutSeconds?: number;
  reason?: string;
};

export type BoothDossierProgramming = {
  mode: "standard" | "special";
  label: string;
  description: string;
  specialType?: string;
  playback: BoothDossierProgrammingPlayback[];
};

export type BoothDossierSnapshot = {
  headline: string;
  intro: string;
  tags: string[];
  cards: BoothDossierCard[];
  deepCut: string;
  nextMove: string;
  sections: {
    lineup: BoothDossierSection;
    context: BoothDossierSection;
    listenFor: BoothDossierSection;
  };
  sessionTracks: BoothDossierSessionTrack[];
  programming?: BoothDossierProgramming;
  at?: number;
  source?: "llm" | "fallback";
  signature?: string;
};

export type BoothDossierDraft = Pick<
  BoothDossierSnapshot,
  "headline" | "intro" | "tags" | "cards" | "deepCut" | "nextMove" | "sections" | "sessionTracks"
> & {
  programming?: BoothDossierProgramming;
};

const nonEmptyText = (value?: string | null) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

const asFiniteNumber = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

const buildTrackLabel = (track: {
  title: string;
  artist: string;
  album?: string;
  year?: number;
}) => {
  const albumLine = track.album ? ` off ${track.album}` : "";
  const yearLine = track.year ? ` (${track.year})` : "";
  return `${track.title} by ${track.artist}${albumLine}${yearLine}`;
};

const describeEnergy = (energy?: number) => {
  if (typeof energy !== "number") return "a loose midnight pulse";
  if (energy < 0.3) return "a candlelit drift";
  if (energy < 0.55) return "a slow-burn glide";
  if (energy < 0.75) return "a steady shoulder-roll";
  return "a bright electric charge";
};

const describeEra = (year?: number) => {
  if (!year) return "timeless";
  const decade = Math.floor(year / 10) * 10;
  return `${decade}s`;
};

const describeGenreEdge = (genres?: string[] | null) => {
  if (!Array.isArray(genres) || genres.length === 0) return "";
  return genres.filter(Boolean).slice(0, 2).join(" / ");
};

const joinThought = (parts: Array<string | null | undefined>) =>
  parts
    .filter((part): part is string => Boolean(part?.trim()))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

const normalizeMatchText = (value?: string | null) =>
  (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const buildTrackNeedles = (track?: { title?: string; artist?: string; album?: string } | null) =>
  Array.from(
    new Set(
      [track?.title, track?.artist, track?.album]
        .map((value) => normalizeMatchText(value))
        .filter((value) => value.length >= 3)
    )
  );

const mentionsTrack = (
  text: string,
  track?: { title?: string; artist?: string; album?: string } | null
) => {
  const haystack = normalizeMatchText(text);
  if (!haystack) return false;
  return buildTrackNeedles(track).some((needle) => haystack.includes(needle));
};

const STOCK_DOSSIER_PATTERN =
  /\blands here because\b|\barrangement hinge\b|\bwithout flattening\b|\bpre-chewed\b|\bin the grain\b|\bgood vibe\b|\bnice flow\b|\bkeeps the room moving\b|\bworks because it fits\b|\breal decision\b|\breal choice\b|\btexture and detail\b|\bshape and patience\b/i;
const SPECIFIC_DOSSIER_PATTERN =
  /\b(19|20)\d{2}\b|\b(album|catalog|groove|pocket|bass|drums|vocal|harmony|arrangement|reverb|echo|runtime|suite|mix)\b/i;
const SET_DETAIL_PATTERN =
  /\b(after|before|into|toward|transition|handoff|queue|next|request line|set|hour|threads|answers|opens|lifts|cools)\b/i;
const LISTEN_DETAIL_PATTERN =
  /\b(listen|hear|catch|notice|pay attention|wait for)\b/i;

const hasSpecificWhyItFitsLine = (value: string, context: DJContext) =>
  !STOCK_DOSSIER_PATTERN.test(value) &&
  (SET_DETAIL_PATTERN.test(value) ||
    mentionsTrack(value, context.nowPlaying) ||
    mentionsTrack(value, context.queuePreview[0])) &&
  (SPECIFIC_DOSSIER_PATTERN.test(value) || value.length >= 96);

const hasSpecificContextLine = (value: string) =>
  !STOCK_DOSSIER_PATTERN.test(value) && SPECIFIC_DOSSIER_PATTERN.test(value);

const hasSpecificListenForLine = (value: string) =>
  !STOCK_DOSSIER_PATTERN.test(value) &&
  LISTEN_DETAIL_PATTERN.test(value) &&
  SPECIFIC_DOSSIER_PATTERN.test(value);

const hasSpecificSessionTrackCopy = (track: BoothDossierSessionTrack, context: DJContext) => {
  return (
    hasSpecificWhyItFitsLine(track.whyItFits, context) &&
    hasSpecificContextLine(track.context) &&
    hasSpecificListenForLine(track.listenFor)
  );
};

const toCard = (value: unknown): BoothDossierCard | null => {
  if (!value || typeof value !== "object") return null;
  const card = value as Record<string, unknown>;
  const label = nonEmptyText(typeof card.label === "string" ? card.label : null);
  const title = nonEmptyText(typeof card.title === "string" ? card.title : null);
  const body = nonEmptyText(typeof card.body === "string" ? card.body : null);
  if (!label || !title || !body) return null;
  return { label, title, body };
};

const toSection = (value: unknown): BoothDossierSection | null => {
  if (!value || typeof value !== "object") return null;
  const section = value as Record<string, unknown>;
  const title = nonEmptyText(typeof section.title === "string" ? section.title : null);
  const body = nonEmptyText(typeof section.body === "string" ? section.body : null);
  if (!title || !body) return null;
  return { title, body };
};

const toSessionTrack = (value: unknown): BoothDossierSessionTrack | null => {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const title = nonEmptyText(typeof raw.title === "string" ? raw.title : null);
  const artist = nonEmptyText(typeof raw.artist === "string" ? raw.artist : null);
  const slot = asFiniteNumber(raw.slot);
  const whyItFits = nonEmptyText(typeof raw.whyItFits === "string" ? raw.whyItFits : null);
  const context = nonEmptyText(typeof raw.context === "string" ? raw.context : null);
  const listenFor = nonEmptyText(typeof raw.listenFor === "string" ? raw.listenFor : null);
  if (!title || !artist || !slot || !whyItFits || !context || !listenFor) return null;

  const trackId = nonEmptyText(typeof raw.trackId === "string" ? raw.trackId : null) ?? undefined;
  const role =
    raw.role === "now" || raw.role === "next" || raw.role === "later" ? raw.role : undefined;
  const playbackMode = raw.playbackMode === "full" || raw.playbackMode === "clip" ? raw.playbackMode : undefined;
  const playbackReason =
    nonEmptyText(typeof raw.playbackReason === "string" ? raw.playbackReason : null) ?? undefined;

  return {
    ...(trackId ? { trackId } : {}),
    title,
    artist,
    slot: Math.max(1, Math.min(8, Math.round(slot))),
    ...(role ? { role } : {}),
    whyItFits,
    context,
    listenFor,
    ...(playbackMode ? { playbackMode } : {}),
    ...(playbackReason ? { playbackReason } : {})
  };
};

const toProgrammingPlayback = (value: unknown): BoothDossierProgrammingPlayback | null => {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const mode = raw.mode === "full" || raw.mode === "clip" ? raw.mode : null;
  if (!mode) return null;

  const trackId = nonEmptyText(typeof raw.trackId === "string" ? raw.trackId : null) ?? undefined;
  const title = nonEmptyText(typeof raw.title === "string" ? raw.title : null) ?? undefined;
  const artist = nonEmptyText(typeof raw.artist === "string" ? raw.artist : null) ?? undefined;
  const segment =
    raw.segment === "opening" || raw.segment === "middle" || raw.segment === "late"
      ? raw.segment
      : undefined;
  const reason = nonEmptyText(typeof raw.reason === "string" ? raw.reason : null) ?? undefined;

  return {
    ...(trackId ? { trackId } : {}),
    ...(title ? { title } : {}),
    ...(artist ? { artist } : {}),
    mode,
    ...(segment ? { segment } : {}),
    ...(typeof asFiniteNumber(raw.cueInSeconds) === "number" ? { cueInSeconds: asFiniteNumber(raw.cueInSeconds) } : {}),
    ...(typeof asFiniteNumber(raw.cueOutSeconds) === "number" ? { cueOutSeconds: asFiniteNumber(raw.cueOutSeconds) } : {}),
    ...(typeof asFiniteNumber(raw.fadeInSeconds) === "number" ? { fadeInSeconds: asFiniteNumber(raw.fadeInSeconds) } : {}),
    ...(typeof asFiniteNumber(raw.fadeOutSeconds) === "number" ? { fadeOutSeconds: asFiniteNumber(raw.fadeOutSeconds) } : {}),
    ...(reason ? { reason } : {})
  };
};

const toProgramming = (value: unknown): BoothDossierProgramming | null => {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const mode = raw.mode === "standard" || raw.mode === "special" ? raw.mode : null;
  const label = nonEmptyText(typeof raw.label === "string" ? raw.label : null);
  const description = nonEmptyText(typeof raw.description === "string" ? raw.description : null);
  if (!mode || !label || !description) return null;

  return {
    mode,
    label,
    description,
    ...(nonEmptyText(typeof raw.specialType === "string" ? raw.specialType : null)
      ? { specialType: nonEmptyText(typeof raw.specialType === "string" ? raw.specialType : null)! }
      : {}),
    playback: Array.isArray(raw.playback)
      ? raw.playback
          .map((entry) => toProgrammingPlayback(entry))
          .filter((entry): entry is BoothDossierProgrammingPlayback => Boolean(entry))
      : []
  };
};

const buildDerivedSections = (cards: BoothDossierCard[], deepCut: string, nextMove: string) => ({
  lineup: {
    title: cards[2]?.title ?? cards[0]?.title ?? "Why this turn matters",
    body: cards[2]?.body ?? deepCut
  },
  context: {
    title: cards[1]?.title ?? "Inside the record",
    body: cards[1]?.body ?? deepCut
  },
  listenFor: {
    title: cards[0]?.title ?? "What to catch in the arrangement",
    body: nextMove
  }
});

export const toBoothDossierSnapshot = (value: unknown): BoothDossierSnapshot | null => {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const headline = nonEmptyText(typeof raw.headline === "string" ? raw.headline : null);
  const intro = nonEmptyText(typeof raw.intro === "string" ? raw.intro : null);
  const deepCut = nonEmptyText(typeof raw.deepCut === "string" ? raw.deepCut : null);
  const nextMove = nonEmptyText(typeof raw.nextMove === "string" ? raw.nextMove : null);
  if (!headline || !intro || !deepCut || !nextMove) return null;

  const tags = Array.isArray(raw.tags)
    ? raw.tags
        .filter((tag): tag is string => typeof tag === "string")
        .map((tag) => tag.trim())
        .filter(Boolean)
        .slice(0, 8)
    : [];
  const cards = Array.isArray(raw.cards)
    ? raw.cards.map((card) => toCard(card)).filter(Boolean).slice(0, 4)
    : [];
  const resolvedCards =
    cards.length > 0
      ? (cards as BoothDossierCard[])
      : [
          { label: "Lineup", title: "Why this turn matters", body: deepCut },
          { label: "Context", title: "Inside the record", body: deepCut },
          { label: "Listen for", title: "What to catch", body: nextMove }
        ];

  const rawSections = raw.sections && typeof raw.sections === "object" ? (raw.sections as Record<string, unknown>) : {};
  const sections = {
    lineup: toSection(rawSections.lineup) ?? buildDerivedSections(resolvedCards, deepCut, nextMove).lineup,
    context: toSection(rawSections.context) ?? buildDerivedSections(resolvedCards, deepCut, nextMove).context,
    listenFor: toSection(rawSections.listenFor) ?? buildDerivedSections(resolvedCards, deepCut, nextMove).listenFor
  };
  const sessionTracks = Array.isArray(raw.sessionTracks)
    ? raw.sessionTracks.map((track) => toSessionTrack(track)).filter(Boolean)
    : [];
  const programming = toProgramming(raw.programming);
  const at = asFiniteNumber(raw.at);
  const source = raw.source === "llm" || raw.source === "fallback" ? raw.source : undefined;
  const signature = nonEmptyText(typeof raw.signature === "string" ? raw.signature : null) ?? undefined;

  return {
    headline,
    intro,
    tags,
    cards: resolvedCards,
    deepCut,
    nextMove,
    sections,
    sessionTracks: sessionTracks as BoothDossierSessionTrack[],
    ...(programming ? { programming } : {}),
    ...(typeof at === "number" ? { at } : {}),
    ...(source ? { source } : {}),
    ...(signature ? { signature } : {})
  };
};

export const buildBoothSignature = (
  context: DJContext,
  input: {
    djScript?: string | null;
    djReason?: string | null;
    programming?: DJProgrammingInfo | null;
    playbackPlans?: DJTrackPlaybackPlan[];
  }
) =>
  JSON.stringify({
    mood: context.mood,
    now: context.nowPlaying?.id ?? context.nowPlaying?.title ?? "",
    next: context.queuePreview[0]?.id ?? context.queuePreview[0]?.title ?? "",
    request: context.requests[0] ?? "",
    djReason: input.djReason ?? "",
    djScript: input.djScript ?? "",
    programming: input.programming?.label ?? context.programming?.label ?? "",
    playback: (input.playbackPlans ?? [])
      .map((plan) => `${plan.trackId}:${plan.mode}:${plan.segment ?? "full"}`)
      .join("|")
  });

export const isBoothDossierGrounded = (context: DJContext, dossier: BoothDossierDraft) => {
  const now = context.nowPlaying;
  const next = context.queuePreview[0];
  const fullText = [
    dossier.headline,
    dossier.intro,
    dossier.tags.join(" "),
    ...dossier.cards.flatMap((card) => [card.label, card.title, card.body]),
    dossier.deepCut,
    dossier.nextMove,
    dossier.sections.lineup.title,
    dossier.sections.lineup.body,
    dossier.sections.context.title,
    dossier.sections.context.body,
    dossier.sections.listenFor.title,
    dossier.sections.listenFor.body,
    ...dossier.sessionTracks.flatMap((track) => [
      track.title,
      track.artist,
      track.whyItFits,
      track.context,
      track.listenFor,
      track.playbackReason ?? ""
    ])
  ].join(" ");

  if ((now?.title || now?.artist || now?.album) && !mentionsTrack(fullText, now)) {
    return false;
  }

  if (!next?.title && !next?.artist && !next?.album) {
    return (
      !STOCK_DOSSIER_PATTERN.test(fullText) &&
      SPECIFIC_DOSSIER_PATTERN.test(fullText) &&
      hasSpecificWhyItFitsLine(dossier.sections.lineup.body, context) &&
      hasSpecificContextLine(dossier.sections.context.body) &&
      hasSpecificListenForLine(dossier.sections.listenFor.body) &&
      dossier.sessionTracks.every((track) => hasSpecificSessionTrackCopy(track, context))
    );
  }

  const nextMoveFocus = [
    dossier.nextMove,
    dossier.sections.listenFor.body,
    dossier.sections.lineup.body,
    dossier.deepCut
  ].join(" ");
  if (STOCK_DOSSIER_PATTERN.test(fullText) || !SPECIFIC_DOSSIER_PATTERN.test(fullText)) {
    return false;
  }
  if (
    !hasSpecificWhyItFitsLine(dossier.sections.lineup.body, context) ||
    !hasSpecificContextLine(dossier.sections.context.body) ||
    !hasSpecificListenForLine(dossier.sections.listenFor.body)
  ) {
    return false;
  }
  if (!dossier.sessionTracks.every((track) => hasSpecificSessionTrackCopy(track, context))) {
    return false;
  }
  return mentionsTrack(nextMoveFocus, next) || mentionsTrack(fullText, next);
};

const buildProgrammingSnapshot = (
  programming?: DJProgrammingInfo | null,
  playbackPlans?: DJTrackPlaybackPlan[]
): BoothDossierProgramming | undefined => {
  const enrichedPlayback = (playbackPlans ?? []).map((plan) => ({
    ...(plan.trackId ? { trackId: plan.trackId } : {}),
    ...(plan.title ? { title: plan.title } : {}),
    ...(plan.artist ? { artist: plan.artist } : {}),
    mode: plan.mode,
    ...(plan.segment ? { segment: plan.segment } : {}),
    ...(typeof plan.cueInSeconds === "number" ? { cueInSeconds: plan.cueInSeconds } : {}),
    ...(typeof plan.cueOutSeconds === "number" ? { cueOutSeconds: plan.cueOutSeconds } : {}),
    ...(typeof plan.fadeInSeconds === "number" ? { fadeInSeconds: plan.fadeInSeconds } : {}),
    ...(typeof plan.fadeOutSeconds === "number" ? { fadeOutSeconds: plan.fadeOutSeconds } : {}),
    ...(plan.reason ? { reason: plan.reason } : {})
  }));

  if (!programming && enrichedPlayback.length === 0) return undefined;

  return {
    mode: programming?.mode ?? "standard",
    label: programming?.label ?? "Open set",
    description:
      programming?.description ?? "Mr Rassy is shaping the next turn from the records already on the deck.",
    ...(programming?.specialType ? { specialType: programming.specialType } : {}),
    playback: enrichedPlayback
  };
};

const findPlaybackPlan = (
  playbackPlans: DJTrackPlaybackPlan[],
  track?: { id?: string; title?: string; artist?: string } | null
) =>
  playbackPlans.find((plan) =>
    track?.id
      ? plan.trackId === track.id
      : plan.title?.toLowerCase() === track?.title?.toLowerCase() &&
        plan.artist?.toLowerCase() === track?.artist?.toLowerCase()
  );

const buildSessionTracks = (
  context: DJContext,
  input: {
    djReason?: string | null;
    programming?: DJProgrammingInfo | null;
    playbackPlans?: DJTrackPlaybackPlan[];
  }
) => {
  const playbackPlans = input.playbackPlans ?? [];
  const candidates: Array<{
    id: string;
    title: string;
    artist: string;
    album?: string;
    year?: number;
    genres?: string[];
    energy: number;
    moodTags: string[];
    role: "now" | "next" | "later";
  }> = [];

  if (context.nowPlaying?.title && context.nowPlaying.artist) {
    candidates.push({
      id: context.nowPlaying.id ?? `${context.nowPlaying.artist}::${context.nowPlaying.title}`,
      title: context.nowPlaying.title,
      artist: context.nowPlaying.artist,
      album: context.nowPlaying.album,
      year: context.nowPlaying.year,
      genres: context.nowPlaying.genres,
      energy: typeof context.nowPlaying.energy === "number" ? context.nowPlaying.energy : 0.5,
      moodTags: [],
      role: "now"
    });
  }

  context.queuePreview.slice(0, 2).forEach((track, index) => {
    candidates.push({
      id: track.id ?? `${track.artist}::${track.title}`,
      title: track.title,
      artist: track.artist,
      album: track.album,
      year: track.year,
      genres: track.genres,
      energy: typeof track.energy === "number" ? track.energy : 0.5,
      moodTags: [],
      role: index === 0 ? "next" : "later"
    });
  });

  return candidates.map((track, index) => {
    const previousTrack = index > 0 ? candidates[index - 1] : undefined;
    const upcomingTrack = candidates[index + 1];
    const playback = findPlaybackPlan(playbackPlans, track);
    const turn = buildTrackTurnIntelligence(track, {
      previousTrack,
      nextTrack: upcomingTrack,
      context
    });
    const leadReason =
      index === 0 &&
      input.djReason &&
      hasSpecificWhyItFitsLine(input.djReason, context)
        ? input.djReason
        : null;
    const whyItFits = joinThought([
      leadReason,
      turn.whyItFits,
      input.programming?.mode === "special"
        ? `Inside ${input.programming.label}, it still earns its place as an authored move.`
        : null
    ]);
    const contextLine =
      normalizeMatchText(turn.factLine) && normalizeMatchText(turn.factLine) !== normalizeMatchText(turn.context)
        ? joinThought([turn.factLine, turn.context])
        : turn.context;
    const listenFor =
      playback?.mode === "clip"
        ? joinThought([
            `This one is airing as a clipped passage, so listen for the section Mr Rassy chose to stand in for the whole piece.`,
            playback.reason ? `The choice was deliberate: ${playback.reason}.` : null,
            upcomingTrack
              ? `${upcomingTrack.title} is waiting on the far side of that seam.`
              : null
          ])
        : turn.listenFor;

    return {
      ...(track?.id ? { trackId: track.id } : {}),
      title: track?.title ?? "Open room",
      artist: track?.artist ?? "Unknown Artist",
      slot: index + 1,
      role: track?.role,
      whyItFits,
      context: contextLine,
      listenFor,
      ...(playback?.mode ? { playbackMode: playback.mode } : {}),
      ...(playback?.reason ? { playbackReason: playback.reason } : {})
    } satisfies BoothDossierSessionTrack;
  });
};

export const buildFallbackBoothDossier = (
  context: DJContext,
  input: {
    djScript?: string | null;
    djReason?: string | null;
    programming?: DJProgrammingInfo | null;
    playbackPlans?: DJTrackPlaybackPlan[];
  }
): BoothDossierSnapshot => {
  const now = context.nowPlaying;
  const next = context.queuePreview[0];
  const later = context.queuePreview[1];
  const nowTitle = nonEmptyText(now?.title);
  const nowArtist = nonEmptyText(now?.artist) ?? "Unknown Artist";
  const nowAlbum = nonEmptyText(now?.album);
  const nextTitle = nonEmptyText(next?.title);
  const laterTitle = nonEmptyText(later?.title);
  const genreEdge = describeGenreEdge(now?.genres);
  const era = describeEra(now?.year);
  const energy = describeEnergy(now?.energy);
  const topLiked = context.feedbackTopLiked[0];
  const requestLead = context.requests[0];
  const programming = buildProgrammingSnapshot(input.programming ?? context.programming, input.playbackPlans);
  const sessionTracks = buildSessionTracks(context, input);
  const leadSession = sessionTracks[0];
  const leadPlayback = findPlaybackPlan(input.playbackPlans ?? [], now ?? next ?? null);
  const tags = Array.from(
    new Set(
      [
        context.mood,
        context.dayPart,
        context.emotionalWeather,
        genreEdge || null,
        programming?.mode === "special" ? programming.label : null,
        programming?.specialType ?? null,
        now?.year ? `${describeEra(now.year)} pull` : null,
        next?.artist ? `next: ${next.artist}` : null,
        topLiked?.artist ? `crowd: ${topLiked.artist}` : null
      ].filter(Boolean) as string[]
    )
  ).slice(0, 7);

  const sections = {
    lineup: {
      title:
        programming?.mode === "special"
          ? programming.label
          : nextTitle && nowTitle
            ? `${nowTitle} into ${nextTitle}`
            : "Why this record is up now",
      body:
        leadSession?.whyItFits ??
        input.djReason ??
        "Mr Rassy is still feeling for the seam that will hold the next turn together."
    },
    context: {
      title: nowAlbum ? `${nowAlbum}${now?.year ? ` · ${now.year}` : ""}` : `${nowArtist} context`,
      body:
        leadSession?.context ??
        (nowTitle
          ? joinThought([
              `${nowTitle} comes through with ${energy}${genreEdge ? ` and ${genreEdge.toLowerCase()} written into the arrangement` : ""}, giving the sequence ${era} character and real internal detail instead of a quick disposable hit.`,
              topLiked
                ? `The crowd response around ${topLiked.title} by ${topLiked.artist} says listeners are staying with records that reward close listening, not just a blunt hit.`
                : null
            ])
          : "The shelf logic is already starting to show through, even before the deeper note lands.")
    },
    listenFor: {
      title: leadPlayback?.mode === "clip" ? "Listen for the excerpt seam" : "What to catch in the arrangement",
      body:
        leadPlayback?.mode === "clip"
          ? joinThought([
              `Mr Rassy is airing a shaped excerpt instead of the full side-long piece, so catch the moment he decided could carry the whole record.`,
              leadPlayback.reason ? `${leadPlayback.reason}.` : null,
              nextTitle
                ? `${nextTitle} is lined up to pick up that thread instead of breaking it.`
                : null
            ])
          : leadSession?.listenFor ??
            (nextTitle
              ? joinThought([
                  `Listen for how ${nextTitle} answers the color and pressure of the current record instead of simply matching its tempo.`,
                  genreEdge
                    ? `The real hook is in how the ${genreEdge.toLowerCase()} language stays vivid even as the transition opens up.`
                    : `The real hook is in the way the track suddenly feels wider than the speakers.`
                ])
              : "Listen for the place where the record opens wider than its first impression.")
    }
  };

  return {
    headline: nowTitle
      ? nextTitle
        ? `${nowTitle} is the thesis, and ${nextTitle} is the answer waiting on deck.`
        : `${nowTitle} is setting the turn in motion.`
      : "Mr Rassy is listening for the seam in the signal.",
    intro: nowTitle
      ? joinThought([
          leadSession?.whyItFits ??
            `${buildTrackLabel({
              title: nowTitle,
              artist: nowArtist,
              album: nowAlbum ?? undefined,
              year: now?.year
            })} is coming through with ${energy}, a ${context.mood} lean, and a touch of ${context.emotionalWeather}.`,
          nextTitle ? `${nextTitle} is already changing how the current record reads.` : null
        ])
      : "The dial is still sketching the shape of the next move.",
    tags,
    cards: [
      {
        label: "Lineup",
        title: sections.lineup.title,
        body: sections.lineup.body
      },
      {
        label: "Context",
        title: sections.context.title,
        body: sections.context.body
      },
      {
        label: "Listen for",
        title: sections.listenFor.title,
        body: sections.listenFor.body
      }
    ],
    deepCut: leadSession?.context ??
      (topLiked
      ? `${topLiked.title} by ${topLiked.artist} is drawing the strongest nods, which says the listeners are staying with records that reveal arrangement and pocket instead of just brute force.`
      : requestLead
        ? `${requestLead} is hanging over the dial, so the turn is listening to the crowd without letting the request line steer the whole hour.`
        : input.djScript ??
          "The live notebook is still warming up, but the sequence already has enough shape to feel deliberate."),
    nextMove: next
      ? `${buildTrackLabel({
          title: next.title,
          artist: next.artist,
          album: next.album,
          year: next.year
        })}${laterTitle ? `, then ${laterTitle}` : ""}`
      : "The next move is still taking shape.",
    sections,
    sessionTracks,
    ...(programming ? { programming } : {})
  };
};
