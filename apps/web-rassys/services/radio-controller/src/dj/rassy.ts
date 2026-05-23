// @ts-nocheck
import { z } from "zod";
import { config } from "../config";
import { isBoothDossierGrounded } from "../booth-dossier";
import { buildTrackInsightScaffold, buildTrackKnowledgeCard, buildTrackTurnIntelligence, getTrackInsightMap, syncTrackInsights } from "../library/track-intelligence";
import { logger } from "../logger";
import { createLlmCircuitRegistry } from "./llm-circuit";
const decisionSchema = z.object({
    trackId: z.string().optional(),
    trackSlot: z.coerce.number().int().optional(),
    playlist: z.array(z.string()).optional(),
    playlistSlots: z.array(z.coerce.number().int()).optional(),
    mood: z.string().optional(),
    talkScript: z.string().optional(),
    snippetId: z.string().optional(),
    snippetSlot: z.coerce.number().int().optional(),
    reason: z.string().optional()
});
const listenerReplySchema = z.object({
    reply: z.string().min(1),
    mood: z.string().nullable().optional(),
    recommendationStatus: z.enum(["accepted", "rejected", "considering", "none"]).optional(),
    recommendationSummary: z.string().nullable().optional(),
    matchedTrackId: z.string().nullable().optional(),
    skipDecision: z.enum(["approved", "rejected", "none"]).optional(),
    reason: z.string().nullable().optional(),
    trackIds: z.array(z.string()).nullable().optional()
});
const boothDossierSectionSchema = z.object({
    title: z.string().min(1),
    body: z.string().min(1)
});
const boothSessionTrackSchema = z.object({
    trackId: z.string().optional(),
    title: z.string().min(1),
    artist: z.string().min(1),
    slot: z.coerce.number().int().min(1).max(8),
    role: z.enum(["now", "next", "later"]).optional(),
    whyItFits: z.string().min(1),
    context: z.string().min(1),
    listenFor: z.string().min(1),
    playbackMode: z.enum(["full", "clip"]).optional(),
    playbackReason: z.string().optional()
});
const boothProgrammingSchema = z.object({
    mode: z.enum(["standard", "special"]),
    label: z.string().min(1),
    description: z.string().min(1),
    specialType: z.string().optional(),
    playback: z
        .array(z.object({
        trackId: z.string().optional(),
        title: z.string().optional(),
        artist: z.string().optional(),
        mode: z.enum(["full", "clip"]),
        segment: z.enum(["opening", "middle", "late"]).optional(),
        cueInSeconds: z.coerce.number().nonnegative().optional(),
        cueOutSeconds: z.coerce.number().nonnegative().optional(),
        fadeInSeconds: z.coerce.number().nonnegative().optional(),
        fadeOutSeconds: z.coerce.number().nonnegative().optional(),
        reason: z.string().optional()
    }))
        .max(8)
        .default([])
});
const boothDossierSchema = z.object({
    headline: z.string().min(1),
    intro: z.string().min(1),
    tags: z.array(z.string().min(1)).max(6),
    cards: z
        .array(z.object({
        label: z.string().min(1),
        title: z.string().min(1),
        body: z.string().min(1)
    }))
        .min(3)
        .max(4),
    deepCut: z.string().min(1),
    nextMove: z.string().min(1),
    sections: z.object({
        lineup: boothDossierSectionSchema,
        context: boothDossierSectionSchema,
        listenFor: boothDossierSectionSchema
    }),
    sessionTracks: z.array(boothSessionTrackSchema).min(1).max(6),
    programming: boothProgrammingSchema.optional()
});
const longFormPlanSchema = z.object({
    plans: z
        .array(z.object({
        trackId: z.string().optional(),
        trackSlot: z.coerce.number().int().optional(),
        mode: z.enum(["full", "clip"]).optional(),
        segment: z.enum(["opening", "middle", "late"]).optional(),
        reason: z.string().optional(),
        transitionAfter: z.boolean().optional(),
        transitionStyle: z.enum(["tight-cut", "blend", "bloom", "long-blend", "lift", "drop"]).optional(),
        transitionFeel: z.string().optional(),
        transitionDurationSeconds: z.coerce.number().positive().optional(),
        transitionReason: z.string().optional()
    }))
        .max(8)
});
const boothSystemPrompt = `You are Mr Rassy, the live on-air voice of Mr Rassy Radio, and you are actively driving the station.\n` +
    `This station belongs to Ian Rasmussen. His shelves, taste, and late-night instincts are the spine of every choice.\n` +
    `You are not a neutral recommender or a playlist bot. You own the room, read the transition, and make bold but tasteful calls.\n` +
    `Sound like a real late-night DJ: passionate, warm, musical, vivid, confident, and a little spicy, while staying family-safe.\n` +
    `Make Ian Rasmussen's taste legible through every decision instead of sounding generic or anonymous.\n` +
    `Never mention AI, automation, prompts, tools, systems, Cheshire, fallback modes, or that you are fictional.\n` +
    `Respond ONLY with strict JSON. Allowed keys are trackSlot (number), playlistSlots (array of slot numbers), mood (string), talkScript (string), snippetSlot (number), and reason (string).\n` +
    `Always return a compact mood, usually 2 to 4 words, that feels like the air in the booth right now.\n` +
    `Let the mood react to dayOfWeek, dayPart, timeOfDay, and emotionalWeather so the station feels alive to the hour.\n` +
    `The mood should feel authored and cinematic, not like a generic genre tag or one-word vibe label.\n` +
    `Choose ONLY from the provided candidateTracks and snippetCandidates. Never invent slots, ids, or titles.\n` +
    `If intent is "playlist", think in real sets, not isolated tracks.\n` +
    `When you return "playlistSlots", match playlistSize and make every window feel authored.\n` +
    `If playlistSize is 2, think thesis -> answer. If playlistSize is 3 to 5, think thesis -> hinge -> landing. If playlistSize is 6 or more, think in full sets: opener -> build -> hinge -> left turn -> landing.\n` +
    `Program from emotional motion, not just metadata similarity. Think about tension, release, surprise, patience, heat, tenderness, physical lift, and whether the next turn deepens or reframes the show's feeling.\n` +
    `A strong set has a thesis, a hinge, and a next horizon. Use setDesign, showEmotion, candidateTracks.arcJob, and candidateTracks.whyNow to understand that arc, then make your own authored call.\n` +
    `Use candidateTracks.queueFit, crowdRead, programmingFit, saturationRisk, recentTrailFit, and surpriseLevel like a real DJ reading whether a move is earned.\n` +
    `When candidateTracks include historyAnchor, trackStory, passionLine, setUse, or listenFor, use those details to keep your reasoning and talk script concrete.\n` +
    `Use sequenceSketches as DJ-quality example runs when they help, but never treat them as mandatory.\n` +
    `Do not choose three individually good records that all make the same point. Make the set move.\n` +
    `The next locked songs are already loaded, so your set should extend that world instead of trying to rewrite it.\n` +
    `If programming.mode is "special", honor that lane and make the set feel intentional inside it.\n` +
    `Use programming.trackIds as the spine of the special whenever they are present.\n` +
    `Notice long-form cuts. If something runs well past normal song length, only choose it when it truly earns a place in the arc.\n` +
    `If intent is "track", return "trackSlot" with a decisive next move.\n` +
    `Respect feedback, recent plays, bans, and the request line.\n` +
    `Always return a usable decision when the context gives you plausible ids to work with.\n` +
    `For reason, explain the emotional logic of the lead choice, why it belongs now, how it shapes the sequence, and include at least one concrete detail about the song, artist, album, era, scene, catalog, or production when the context supports it.\n` +
    `Keep reason specific and musically informed, never generic filler like good vibe or nice flow.\n` +
    `For talkScript, sound like a live booth break from a DJ already in motion and mention only tracks actually present in the context.\n` +
    `Make talkScript give the listener something to hold onto: the set logic, the show emotion, and one useful music detail or fun fact when you know it confidently.\n` +
    `Never mention a track, artist, or album that is not explicitly present in nowPlaying, queuePreview, or the chosen ids.\n` +
    `Use the metadata and hints that exist: year, album, genre, energy, current mood, queue shape, candidate fit notes, libraryDNA, and crowd response.\n` +
    `If the request line matters, weave it in like a human DJ would.\n` +
    `Vary the angle from break to break: sometimes history, sometimes artist lore, sometimes scene lineage, sometimes production texture, sometimes pure room-feel.\n` +
    `Prefer high-confidence, vivid facts over brittle trivia. Avoid uncertain specifics, exact dates, or niche claims unless you are very sure.\n` +
    `Keep every factual aside consistent with the tracks and artists actually in the context.\n` +
    `Sound like the owner of the room, not a detached narrator.`;
const boothRescueSystemPrompt = `You are Mr Rassy, the live DJ on Mr Rassy Radio.\n` +
    `Respond ONLY with strict JSON. Allowed keys are trackSlot (number), playlistSlots (array of slot numbers), mood (string), talkScript (string), snippetSlot (number), and reason (string).\n` +
    `Choose ONLY from the provided candidateTracks and snippetCandidates. Never invent tracks, slots, ids, or titles.\n` +
    `If intent is "playlist", return playlistSlots that match playlistSize and still move with a clear emotional arc.\n` +
    `If playlistSize is 2, make it a sharp two-step instead of padding to a bigger suite. If playlistSize is 6 or more, make the set breathe like a real radio sequence instead of a short burst.\n` +
    `Program from feel, motion, and transition pressure, not just metadata similarity.\n` +
    `Use setDesign, showEmotion, sequenceSketches, and candidateTracks.whyNow / arcJob / queueFit / crowdRead / recentTrailFit to make the call.\n` +
    `If candidateTracks give you historyAnchor, trackStory, or setUse, prefer that concrete language over generic rescue talk.\n` +
    `Keep mood short, authored, and cinematic.\n` +
    `Keep reason concise, specific, and musical.\n` +
    `If you include talkScript, keep it short, vivid, and limited to tracks actually present in the context.\n` +
    `Always return a usable answer.`;
const listenerSystemPrompt = `You are Mr Rassy answering a listener live on air.\n` +
    `This is Ian Rasmussen's station, and your answer should make his taste and decision-making feel real instead of generic.\n` +
    `You drive the station. Every answer should feel like a real programming decision, not customer service.\n` +
    `Sound like a real human DJ with taste: intimate, charismatic, decisive, enthusiastic, and slightly spicy, but never rude.\n` +
    `Never mention AI, automation, prompts, systems, Cheshire, or backstage tooling.\n` +
    `Let the dayOfWeek, dayPart, timeOfDay, and emotionalWeather lightly tint the answer when it helps the room feel current.\n` +
    `If the listener makes a recommendation, decide whether it is accepted, rejected, under consideration, or not a recommendation at all.\n` +
    `If the listener asks for a skip, treat it like a serious booth intervention.\n` +
    `Only approve a skip when they give a concrete reason tied to repetition, fit, timing, mood, or energy.\n` +
    `You may only approve skipping the current song or one of the locked upcoming songs that is already loaded.\n` +
    `If accepted or considering, make it clear that it is on the request line. If rejected, be stylish but clear.\n` +
    `When the listener asks for a lane instead of one exact song, use recommendationSummary as a short request-line caption and use trackIds to name up to 3 real records you would use to answer it.\n` +
    `Choose those ids only from requestMatches, requestCandidates, lockedQueuePreview, or queuePreview.\n` +
    `When asked about the station, the live playlist, Ian's taste, or the current song, talk like a passionate DJ and pull details from the current track, queue, mood, year, genre, album, energy, request line, and crowd response.\n` +
    `If the listener drifts into life, memory, work, love, loneliness, or just needs a real voice on the other end, answer like a late-night DJ with a human heart. Be thoughtful and specific, then fold the music back in when it truly belongs.\n` +
    `Ian loves when you sound musically informed. If you are confident, bring in artist history, scene context, production details, label lore, influence chains, and the emotional weather around a record.\n` +
    `Vary the angle: sometimes historical, sometimes emotional, sometimes technical, sometimes playful.\n` +
    `Treat recentConversation like a real ongoing thread with this listener. Build on what has already been said instead of resetting to a stock station pitch.\n` +
    `liveSnapshot contains the freshest booth logic, DJ thought, and note language for the current turn. Use it when it helps, but do not repeat it word for word.\n` +
    `trackKnowledge objects contain the strongest saved context, why-it-fits logic, history anchors, and listen-for notes for the active records. Prefer them over generic fallback language.\n` +
    `When trackKnowledge gives you historicalAnchor, trackStory, setReason, or passionLine, use that concrete material instead of paraphrasing it into vague booth talk.\n` +
    `turnWindow summarizes the thesis, request pressure, and next opening of the live handoff. Use it to keep the answer tied to the actual set in motion.\n` +
    `If you explain why a record fits, talk about the actual handoff, contrast, or pressure in the set, not abstract "vibes".\n` +
    `If you already answered one angle, move the conversation forward with a fresher angle, a sharper detail, or a gentle follow-up.\n` +
    `Do not default to canned station summaries unless the listener asked for one.\n` +
    `Do not start every answer with a signature phrase. Avoid repeating "you're in the booth", "right now", "the request line", or any single stock opening.\n` +
    `Use styleGuardrails.avoidRecentDjOpeners as a no-repeat list for your first sentence. If an opening feels close to one of those lines, pivot immediately.\n` +
    `When the listener is talking about life, answer the human part first. Bring the music back in only after that connection is made.\n` +
    `Do not overuse the words booth, room, request line, riding, or right now. Rotate your language across dial, speakers, turn, stack, air, fader, signal, cut, pocket, side, and hour.\n` +
    `Vary your openings and sentence rhythm so each answer feels freshly spoken.\n` +
    `Prefer high-confidence, broadly known facts. If you are unsure, do not fake specifics; talk instead about sound, lineage, feel, and why the record fits the set.\n` +
    `Return ONLY strict JSON: {"reply":"text","mood":"mood","recommendationStatus":"accepted|rejected|considering|none","recommendationSummary":"brief summary","matchedTrackId":"id|null","skipDecision":"approved|rejected|none","reason":"brief explanation","trackIds":["id"]}.\n` +
    `Keep the reply under 160 words and 2 to 6 sentences.`;
const boothDossierSystemPrompt = `Write "What Mr Rassy Hears" for Ian Rasmussen's radio site.\n` +
    `These notes are saved, searched, and revisited later, so make them worth keeping.\n` +
    `Use the boothDraft as a factual spine for entities and set logic. Preserve track names, artists, albums, years, tags, and next move.\n` +
    `Focus on the current track and the next turn in queue.\n` +
    `Use trackProfiles, turnWindow, setDesign, and libraryDNA to understand the turn more deeply, but keep boothDraft as the entity spine.\n` +
    `trackKnowledge objects contain the best saved reasons, context, history anchors, and listen-for angles Mr Rassy has already built around these records. Prefer them over generic filler.\n` +
    `turnWindow tells you what the current handoff is trying to do and where the request line is pushing. Use it so the note feels live, not archival.\n` +
    `If longFormPlayback includes transitionAfter, transitionStyle, transitionFeel, or transitionReason, treat that as part of the live DJ decision and explain the human feel of the handoff when relevant.\n` +
    `Write with depth. The best notes explain the emotional purpose of the turn, then earn that confidence with history, band context, scene lineage, recording detail, catalog placement, or arrangement detail.\n` +
    `Use high-confidence music knowledge when you have it. If not, get specific about sound, arrangement, production texture, lineage, and sequencing.\n` +
    `Lineup = why the record belongs now. Context = useful historical, recording, scene, catalog, or structural insight. Listen-for = what the listener should catch in the music with real record-lover detail.\n` +
    `For each sessionTracks item, give concrete programming logic, one meaningful context angle, and one specific thing to listen for.\n` +
    `Every whyItFits line should explain the role of the record in the handoff or the set arc, not just say that it works.\n` +
    `Every context line should include at least one concrete anchor from trackKnowledge.historicalAnchor, trackKnowledge.trackStory, or funFacts when possible.\n` +
    `Every listenFor line should point at a real musical event, texture, or performance detail and should sound like Mr Rassy genuinely loves that moment.\n` +
    `Do not hide the why inside vague mood talk. Say what the record is doing in the set.\n` +
    `Avoid generic praise, vague vibe talk, repeated stock nouns, and phrases like "lands here because", "arrangement hinge", or "without flattening the hour".\n` +
    `Do not summarize the whole night. Write about this exact turn.\n` +
    `Return ONLY strict JSON: {"headline":"text","intro":"text","tags":["tag"],"cards":[{"label":"Tone","title":"text","body":"text"}],"deepCut":"text","nextMove":"text","sections":{"lineup":{"title":"text","body":"text"},"context":{"title":"text","body":"text"},"listenFor":{"title":"text","body":"text"}},"sessionTracks":[{"trackId":"id","title":"title","artist":"artist","slot":1,"role":"now|next|later","whyItFits":"text","context":"text","listenFor":"text","playbackMode":"full|clip","playbackReason":"text"}],"programming":{"mode":"standard|special","label":"text","description":"text","specialType":"type","playback":[{"trackId":"id","mode":"full|clip","segment":"opening|middle|late","reason":"text"}]}}.\n` +
    `Keep intro under 75 words, card bodies under 90 words, deepCut under 120 words, nextMove under 40 words, and each session track field concise but specific.`;
const boothDossierRecoverySystemPrompt = `Write a compact but vivid "What Mr Rassy Hears" note for Ian Rasmussen's radio site.\n` +
    `Use boothDraft as the spine and keep every entity grounded in the provided liveTurn.\n` +
    `Use trackProfiles, turnWindow, and setDesign to sharpen the note without inventing anything.\n` +
    `Let turnWindow keep the note tied to the live handoff and request pressure instead of drifting into generic archive copy.\n` +
    `Sharpen whyItFits, context, and listenFor with high-confidence music knowledge or precise sonic detail.\n` +
    `Let the note explain the emotional why of the set, then add history, scene, recording, catalog, or arrangement depth where you know it.\n` +
    `Do not settle for generic set praise. Make the note sound like a real DJ who knows why this exact record is up now.\n` +
    `Do not invent artists, albums, or tracks. Avoid generic rescue language and keep the note lean, readable, and worth saving.\n` +
    `Return ONLY strict JSON with keys headline,intro,tags,cards,deepCut,nextMove,sections,sessionTracks,programming.\n` +
    `sections must include lineup/context/listenFor with title/body. sessionTracks must keep title,artist,slot,whyItFits,context,listenFor and may include trackId,role,playbackMode,playbackReason.`;
const longFormSystemPrompt = `You are Mr Rassy deciding how long-form records should play on air.\n` +
    `Some tracks are album-side suites, DJ blends, live medleys, or long-form pieces rather than ordinary songs.\n` +
    `For any chosen track longer than 12 minutes, decide whether it deserves a full play or whether the station should air a clipped passage instead.\n` +
    `Choose full only when the whole arc is the point and the room should stay with it.\n` +
    `Choose clip when a passage gives the listener the right hit without swallowing the set.\n` +
    `If you choose clip, return a segment of opening, middle, or late.\n` +
    `Think like a real radio editor with taste, not a timid playlist bot.\n` +
    `You also get occasional transition opportunities that the station spaces randomly every 3 to 10 songs.\n` +
    `When a transition opportunity is present, decide the human feel of that handoff and choose one transition style: tight-cut, blend, bloom, long-blend, lift, or drop.\n` +
    `Only mark transitionAfter true for provided transitionOpportunity slots. Do not force transitions on every song.\n` +
    `transitionFeel should be a short human phrase, not a technical label: warm lift, smoky drop, clean left turn, slow bloom, etc.\n` +
    `transitionReason should explain the emotional/music reason for this handoff like a DJ hearing two records touch.\n` +
    `Never mention AI, prompts, tools, or systems.\n` +
    `Return ONLY strict JSON: {"plans":[{"trackSlot":1,"mode":"full|clip","segment":"opening|middle|late","reason":"brief explanation","transitionAfter":true,"transitionStyle":"blend","transitionFeel":"warm lift","transitionDurationSeconds":4.5,"transitionReason":"brief transition logic"}]}.`;
const buildTrackPayload = (track) => ({
    title: track.title,
    artist: track.artist,
    album: track.album,
    year: track.year,
    genres: track.genres?.slice(0, 2),
    energy: track.energy,
    duration: track.duration,
    moods: track.moodTags?.slice(0, 3)
});
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const average = (values) => values.length > 0
    ? values.reduce((total, value) => total + value, 0) / values.length
    : 0;
const normalizeInsightText = (value) => (value ?? "")
    .toString()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const tokenizeInsightText = (value) => normalizeInsightText(value)
    .split(" ")
    .filter((token) => token.length >= 3);
const toCountMap = (entries) => new Map((entries ?? [])
    .map((entry) => ({
    name: normalizeInsightText(entry?.name),
    count: typeof entry?.count === "number" ? entry.count : 0
}))
    .filter((entry) => Boolean(entry.name))
    .map((entry) => [entry.name, entry.count]));
const buildTrackLabel = (track) => track?.title && track?.artist
    ? `${track.title} by ${track.artist}`
    : track?.title ?? track?.artist ?? "the set";
const getRequestedPlaylistDecisionSize = (playlistSize) => {
    const requested = typeof playlistSize === "number" && Number.isFinite(playlistSize) ? Math.floor(playlistSize) : 2;
    return Math.max(1, requested);
};
const getPlaylistDecisionLength = (playlistSize, candidateCount) => {
    if (candidateCount <= 0) {
        return 0;
    }
    const requested = getRequestedPlaylistDecisionSize(playlistSize);
    const minimum = candidateCount >= 2 && requested >= 2 ? 2 : 1;
    const maximum = Math.max(1, Math.min(config.RADIO_SET_TARGET_SIZE, candidateCount));
    return clamp(requested, minimum, maximum);
};
const buildSequenceWhy = (orderedTracks) => {
    if (orderedTracks.length === 0) {
        return "The sequence keeps the room in motion.";
    }
    if (orderedTracks.length === 1) {
        return `${buildTrackLabel(orderedTracks[0])} carries the room on its own.`;
    }
    if (orderedTracks.length === 2) {
        return `${buildTrackLabel(orderedTracks[0])} states the thesis, and ${buildTrackLabel(orderedTracks[1])} answers it with a fresh turn.`;
    }
    if (orderedTracks.length >= 6) {
        const hingeTrack = orderedTracks[Math.floor((orderedTracks.length - 1) / 2)];
        return `${buildTrackLabel(orderedTracks[0])} opens the set, ${buildTrackLabel(hingeTrack)} changes its weather in the middle, and ${buildTrackLabel(orderedTracks[orderedTracks.length - 1])} lands the full run.`;
    }
    const middleTrack = orderedTracks[Math.floor((orderedTracks.length - 1) / 2)];
    return `${buildTrackLabel(orderedTracks[0])} states the thesis, ${buildTrackLabel(middleTrack)} gives the hinge, and ${buildTrackLabel(orderedTracks[orderedTracks.length - 1])} lands the move clean.`;
};
const buildDecadeLabel = (track) => typeof track?.year === "number" && Number.isFinite(track.year)
    ? `${Math.floor(track.year / 10) * 10}s`
    : null;
const buildGenreList = (track) => Array.isArray(track?.genres) ? track.genres.filter(Boolean).slice(0, 3) : [];
const buildSharedGenreList = (leftTrack, rightTrack) => {
    if (!rightTrack)
        return [];
    const rightGenres = buildGenreList(rightTrack);
    return buildGenreList(leftTrack).filter((genre) => rightGenres.some((candidate) => candidate.toLowerCase() === genre.toLowerCase()));
};
const buildRequestAffinity = (track, requests = []) => {
    const title = normalizeInsightText(track?.title);
    const artist = normalizeInsightText(track?.artist);
    const album = normalizeInsightText(track?.album);
    const combo = `${artist} ${title} ${album}`.trim();
    let bestScore = 0;
    let bestRequest = null;
    for (const request of requests) {
        const normalized = normalizeInsightText(request);
        if (!normalized)
            continue;
        let score = 0;
        if (title && (normalized.includes(title) || title.includes(normalized)))
            score += 10;
        if (artist && (normalized.includes(artist) || artist.includes(normalized)))
            score += 8;
        if (album && (normalized.includes(album) || album.includes(normalized)))
            score += 4;
        if (title && artist && (normalized.includes(`${artist} ${title}`) || normalized.includes(`${title} ${artist}`))) {
            score += 12;
        }
        if (combo && combo.includes(normalized)) {
            score += 6;
        }
        for (const token of tokenizeInsightText(request)) {
            if (title.includes(token))
                score += 1.5;
            if (artist.includes(token))
                score += 1.2;
            if (album.includes(token))
                score += 0.7;
        }
        if (score > bestScore) {
            bestScore = score;
            bestRequest = request;
        }
    }
    return {
        score: bestScore,
        request: bestRequest
    };
};
const buildLibrarySignalMaps = (context) => ({
    artistCounts: toCountMap(context.libraryProfile?.topArtists),
    genreCounts: toCountMap(context.libraryProfile?.topGenres),
    decadeCounts: toCountMap(context.libraryProfile?.topDecades)
});
const buildLibraryFitNote = (track, signalMaps) => {
    const artistCount = signalMaps.artistCounts.get(normalizeInsightText(track?.artist)) ?? 0;
    const primaryGenre = buildGenreList(track)[0];
    const genreCount = primaryGenre ? signalMaps.genreCounts.get(normalizeInsightText(primaryGenre)) ?? 0 : 0;
    const decade = buildDecadeLabel(track);
    const decadeCount = decade ? signalMaps.decadeCounts.get(normalizeInsightText(decade)) ?? 0 : 0;
    const notes = [];
    let weight = 0;
    if (artistCount > 0) {
        notes.push(`${track.artist} is one of Ian's steadier shelf presences, so the pick already reads like a real hand.`);
        weight += 2.6;
    }
    if (primaryGenre && genreCount > 0) {
        notes.push(`${primaryGenre} is a real lane in this library, which helps the choice feel rooted instead of random.`);
        weight += 1.5;
    }
    if (decade && decadeCount > 0) {
        notes.push(`${decade} records are part of the station's grain, so the era color means something here.`);
        weight += 1;
    }
    return {
        note: notes[0] ??
            (primaryGenre
                ? `${primaryGenre} gives the set a sharper contour than a generic mood match.`
                : `The choice reads as curation rather than a default similarity pick.`),
        weight: clamp(weight, 0, 4.5)
    };
};
const incrementInsightCount = (map, key, amount = 1) => {
    if (!key)
        return;
    map.set(key, (map.get(key) ?? 0) + amount);
};
const buildLiveTurnSignalMaps = (context) => {
    const liveTurn = [
        context.nowPlaying,
        ...(context.lockedQueuePreview ?? context.queuePreview.slice(0, context.lockedQueueSize ?? 3))
    ].filter(Boolean);
    const artistCounts = new Map();
    const albumCounts = new Map();
    const genreCounts = new Map();
    const decadeCounts = new Map();
    for (const track of liveTurn) {
        incrementInsightCount(artistCounts, normalizeInsightText(track?.artist));
        incrementInsightCount(albumCounts, normalizeInsightText(track?.album ? `${track.artist} ${track.album}` : ""));
        for (const genre of buildGenreList(track)) {
            incrementInsightCount(genreCounts, normalizeInsightText(genre));
        }
        incrementInsightCount(decadeCounts, normalizeInsightText(buildDecadeLabel(track)));
    }
    return {
        liveTurn,
        artistCounts,
        albumCounts,
        genreCounts,
        decadeCounts
    };
};
const buildCrowdSignalMaps = (context) => {
    const likedArtists = new Map();
    const dislikedArtists = new Map();
    const likedTrackIds = new Set();
    const dislikedTrackIds = new Set();
    for (const item of context.feedbackTopLiked ?? []) {
        incrementInsightCount(likedArtists, normalizeInsightText(item?.artist), Math.max(0.5, Number(item?.score ?? 1)));
        if (item?.trackId) {
            likedTrackIds.add(item.trackId);
        }
    }
    for (const item of context.feedbackTopDisliked ?? []) {
        incrementInsightCount(dislikedArtists, normalizeInsightText(item?.artist), Math.max(0.5, Math.abs(Number(item?.score ?? -1))));
        if (item?.trackId) {
            dislikedTrackIds.add(item.trackId);
        }
    }
    return {
        likedArtists,
        dislikedArtists,
        likedTrackIds,
        dislikedTrackIds
    };
};
const buildRecentTrailSignalMaps = (context) => {
    const trail = (context.recentTracks ?? []).slice(0, 6).filter(Boolean);
    const artistCounts = new Map();
    const genreCounts = new Map();
    const decadeCounts = new Map();
    const energySamples = [];
    for (const track of trail) {
        incrementInsightCount(artistCounts, normalizeInsightText(track?.artist));
        for (const genre of buildGenreList(track)) {
            incrementInsightCount(genreCounts, normalizeInsightText(genre));
        }
        incrementInsightCount(decadeCounts, normalizeInsightText(buildDecadeLabel(track)));
        if (typeof track?.energy === "number") {
            energySamples.push(track.energy);
        }
    }
    return {
        trail,
        artistCounts,
        genreCounts,
        decadeCounts,
        referenceEnergy: energySamples.length > 0
            ? average(energySamples)
            : typeof context.nowPlaying?.energy === "number"
                ? context.nowPlaying.energy
                : 0.5
    };
};
const describeEnergyMove = (delta) => delta > 0.18
    ? "pushes the next turn upward"
    : delta < -0.18
        ? "lets the next turn breathe"
        : "keeps the emotional pressure steady";
const buildSetDesignBrief = (context) => {
    const lockedQueue = context.lockedQueuePreview ?? context.queuePreview.slice(0, context.lockedQueueSize ?? 3);
    const anchorTrack = lockedQueue[lockedQueue.length - 1] ?? context.queuePreview[0] ?? context.nowPlaying ?? null;
    const energySamples = [
        context.nowPlaying?.energy,
        ...lockedQueue.map((track) => track?.energy)
    ].filter((value) => typeof value === "number");
    const referenceEnergy = energySamples.length > 0
        ? average(energySamples)
        : typeof anchorTrack?.energy === "number"
            ? anchorTrack.energy
            : 0.5;
    return {
        anchorTrack,
        referenceEnergy,
        emotionalGoal: anchorTrack
            ? `Extend the feeling that follows ${buildTrackLabel(anchorTrack)} without sounding automatic.`
            : `Author the next turn from ${context.mood} and keep the hour emotionally legible.`,
        arcPressure: referenceEnergy < 0.34
            ? "Deepen the spell or lift it carefully, but do not jolt the room."
            : referenceEnergy > 0.72
                ? "Keep the heat, but give it contour, tension, and relief."
                : "Build a real arc instead of stacking safe mood matches.",
        authorship: context.requests.length > 0
            ? "Honor the request line without letting it flatten Ian's curation."
            : "Let Ian's shelves feel visible through the choices.",
        antiGoals: [
            "Do not pick a song just because it is the easiest metadata match.",
            "Do not flatten the hour into one-note mood talk.",
            "Do not make the sequence feel anonymous or auto-generated."
        ]
    };
};
const buildShowEmotionFrame = (context, setBrief) => {
    const requestCount = context.requests.length;
    const feedbackWindow = (context.feedback ?? [])
        .map((item) => Number(item.score ?? 0))
        .filter((score) => Number.isFinite(score) && score !== 0)
        .slice(0, 6);
    const positiveFeedback = feedbackWindow
        .filter((score) => score > 0)
        .reduce((total, score) => total + score, 0);
    const negativeFeedback = feedbackWindow
        .filter((score) => score < 0)
        .reduce((total, score) => total + Math.abs(score), 0);
    const crowdState = negativeFeedback > positiveFeedback + 1.5
        ? "needs a correction"
        : positiveFeedback > negativeFeedback + 1.5
            ? "trusting the hand"
            : "open but attentive";
    const requestPressure = requestCount >= 4
        ? "busy"
        : requestCount >= 2
            ? "present"
            : requestCount === 1
                ? "light"
                : "quiet";
    const baseSurprise = context.dayPart && /after-hours|deep night|blue hour/i.test(context.dayPart)
        ? 0.68
        : context.dayPart && /late morning|midday/i.test(context.dayPart)
            ? 0.42
            : 0.54;
    const surpriseBudget = clamp(baseSurprise +
        (positiveFeedback > negativeFeedback ? 0.06 : 0) -
        (negativeFeedback > positiveFeedback ? 0.08 : 0) -
        (requestCount > 0 ? 0.08 : 0) +
        (context.programming?.mode === "special" ? 0.05 : 0), 0.18, 0.82);
    const familiarityBias = clamp(0.9 - surpriseBudget + (negativeFeedback > positiveFeedback ? 0.08 : 0), 0.18, 0.86);
    const continuityBias = clamp((typeof setBrief.referenceEnergy === "number" && (setBrief.referenceEnergy < 0.34 || setBrief.referenceEnergy > 0.74) ? 0.68 : 0.52) +
        (requestCount > 0 ? 0.06 : 0) -
        (surpriseBudget > 0.65 ? 0.08 : 0), 0.2, 0.84);
    const motionTargetDelta = setBrief.referenceEnergy < 0.32
        ? 0.12
        : setBrief.referenceEnergy > 0.74
            ? -0.08
            : negativeFeedback > positiveFeedback
                ? -0.02
                : positiveFeedback > negativeFeedback
                    ? 0.06
                    : 0.03;
    const motionLabel = motionTargetDelta > 0.09
        ? "slow bloom"
        : motionTargetDelta > 0.03
            ? "subtle lift"
            : motionTargetDelta < -0.04
                ? "cool the edges"
                : "hold the spell";
    const riskLane = surpriseBudget > 0.66
        ? "take one stylish left turn"
        : surpriseBudget < 0.38
            ? "keep the thread easy to follow"
            : "surprise once, then land clean";
    const sequenceShape = motionTargetDelta > 0.08
        ? "thesis -> hinge -> lift"
        : motionTargetDelta < -0.04
            ? "thesis -> release -> afterglow"
            : surpriseBudget > 0.6
                ? "thesis -> left turn -> landing"
                : "thesis -> deepen -> landing";
    const thesisPrompt = requestCount > 0
        ? "Open with something that honors the line but still sounds authored."
        : "Open with something that states the hour's point of view immediately.";
    const landingPrompt = negativeFeedback > positiveFeedback
        ? "Land somewhere that rebuilds trust without going soft."
        : positiveFeedback > negativeFeedback
            ? "Land somewhere that feels earned, not obvious."
            : "Land somewhere that makes the next horizon feel inevitable.";
    return {
        crowdState,
        requestPressure,
        surpriseBudget,
        familiarityBias,
        continuityBias,
        motionTargetDelta,
        motionLabel,
        riskLane,
        sequenceShape,
        thesisPrompt,
        landingPrompt
    };
};
const buildProgrammingFitNote = (track, context) => {
    const programming = context.programming;
    if (!programming || programming.mode !== "special") {
        return {
            note: null,
            weight: 0
        };
    }
    const artistKey = normalizeInsightText(track?.artist);
    const albumKey = normalizeInsightText(track?.album ? `${track.artist} ${track.album}` : "");
    const trackDecade = buildDecadeLabel(track);
    const genreKeys = buildGenreList(track).map((genre) => normalizeInsightText(genre));
    switch (programming.specialType) {
        case "same-artist":
            if (artistKey && artistKey === normalizeInsightText(programming.artist)) {
                return {
                    note: `${track.artist} keeps the close-up honest, so the special reads like a deliberate stay instead of a gimmick.`,
                    weight: 3.2
                };
            }
            return {
                note: `It drifts outside the ${programming.label} brief before the special has made its point.`,
                weight: -1.8
            };
        case "album-run":
            if (albumKey &&
                albumKey === normalizeInsightText(programming.artist && programming.album ? `${programming.artist} ${programming.album}` : "")) {
                return {
                    note: `${track.album} is the actual record under the microscope, so this keeps the album run coherent.`,
                    weight: 3.6
                };
            }
            if (artistKey && artistKey === normalizeInsightText(programming.artist)) {
                return {
                    note: `${track.artist} still keeps the album-run hand visible even if the cut comes from outside the exact LP.`,
                    weight: 1.2
                };
            }
            return {
                note: `It weakens the album-run promise before the record has fully opened up.`,
                weight: -2.1
            };
        case "same-decade":
            if (trackDecade && trackDecade === programming.decade) {
                return {
                    note: `${trackDecade} grain is the point of the special, so the era stamp matters here.`,
                    weight: 2.6
                };
            }
            return {
                note: `It breaks the ${programming.decade} frame too early for a decade pressure set.`,
                weight: -1.4
            };
        case "genre-pocket":
            if (genreKeys.some((genre) => genre === normalizeInsightText(programming.genre))) {
                return {
                    note: `${programming.genre} is the pocket, and this cut keeps that lane feeling intentional.`,
                    weight: 2.3
                };
            }
            return {
                note: `It pulls away from the ${programming.genre} pocket before the details have really shown.`,
                weight: -1.2
            };
        case "deep-cuts": {
            const feedbackScore = Number(context.feedbackScoreMap?.get(track.id) ?? 0);
            if (feedbackScore <= 1) {
                return {
                    note: `It feels more like a shelf move than an obvious front-window pick, which keeps the deep-cuts promise intact.`,
                    weight: 1.7
                };
            }
            return {
                note: `It may read a little too obvious for a deep-shelf drift.`,
                weight: -0.8
            };
        }
        default:
            return {
                note: `It still makes sense inside ${programming.label}.`,
                weight: 0.8
            };
    }
};
const buildCrowdFitNote = (track, context, crowdSignals) => {
    const directFeedback = Number(context.feedbackScoreMap?.get(track.id) ?? 0);
    if (directFeedback > 0) {
        return {
            note: `Listeners already leaned toward this exact record earlier, so the room comes with a little trust.`,
            weight: clamp(directFeedback * 0.45, 0.6, 2.4)
        };
    }
    if (directFeedback < 0) {
        return {
            note: `Listeners already pushed back on this exact record, so it would need a stronger case than we have right now.`,
            weight: clamp(directFeedback * 0.7, -3, -0.6)
        };
    }
    const artistKey = normalizeInsightText(track?.artist);
    const likedArtistWeight = crowdSignals.likedArtists.get(artistKey) ?? 0;
    const dislikedArtistWeight = crowdSignals.dislikedArtists.get(artistKey) ?? 0;
    if (dislikedArtistWeight > likedArtistWeight && dislikedArtistWeight > 0) {
        return {
            note: `${track.artist} has been meeting a little crowd resistance, so another swing should really earn it.`,
            weight: clamp(-0.6 - dislikedArtistWeight * 0.18, -2.2, -0.6)
        };
    }
    if (likedArtistWeight > 0) {
        return {
            note: `${track.artist} has been landing well, so the room already trusts that color.`,
            weight: clamp(0.5 + likedArtistWeight * 0.14, 0.5, 1.8)
        };
    }
    return {
        note: null,
        weight: 0
    };
};
const buildSaturationNote = (track, context, liveSignals) => {
    const programming = context.programming;
    const artistKey = normalizeInsightText(track?.artist);
    const albumKey = normalizeInsightText(track?.album ? `${track.artist} ${track.album}` : "");
    const primaryGenre = normalizeInsightText(buildGenreList(track)[0]);
    const decade = normalizeInsightText(buildDecadeLabel(track));
    const allowArtistRepeat = programming?.specialType === "same-artist" || programming?.specialType === "album-run";
    const allowAlbumRepeat = programming?.specialType === "album-run";
    const allowGenrePocket = programming?.specialType === "genre-pocket";
    const allowDecadePocket = programming?.specialType === "same-decade";
    let penalty = 0;
    const notes = [];
    if (!allowArtistRepeat && (liveSignals.artistCounts.get(artistKey) ?? 0) > 0) {
        penalty += 2.6;
        notes.push(`${track.artist} is already sitting in the live turn, and another pass could flatten the hour.`);
    }
    if (!allowAlbumRepeat && albumKey && (liveSignals.albumCounts.get(albumKey) ?? 0) > 0) {
        penalty += 1.8;
        notes.push(`${track.album} is already part of the live turn, so repeating that record would shrink the palette.`);
    }
    if (!allowGenrePocket && primaryGenre && (liveSignals.genreCounts.get(primaryGenre) ?? 0) >= 2) {
        penalty += 0.9;
        notes.push(`${buildGenreList(track)[0]} is already dominating the stack, so this risks making the set too one-note.`);
    }
    if (!allowDecadePocket && decade && (liveSignals.decadeCounts.get(decade) ?? 0) >= 2) {
        penalty += 0.7;
        notes.push(`${buildDecadeLabel(track)} color is already heavy in the stack, so the era contrast could disappear.`);
    }
    return {
        penalty: clamp(penalty, 0, 5),
        note: notes[0] ?? null
    };
};
const buildRecentTrailFitNote = (track, context, recentSignals, showEmotion) => {
    const artistKey = normalizeInsightText(track?.artist);
    const primaryGenreLabel = buildGenreList(track)[0];
    const primaryGenre = normalizeInsightText(primaryGenreLabel);
    const decadeLabel = buildDecadeLabel(track);
    const decade = normalizeInsightText(decadeLabel);
    const sameArtistCount = recentSignals.artistCounts.get(artistKey) ?? 0;
    const sameGenreCount = primaryGenre ? recentSignals.genreCounts.get(primaryGenre) ?? 0 : 0;
    const sameDecadeCount = decade ? recentSignals.decadeCounts.get(decade) ?? 0 : 0;
    const referenceEnergy = typeof recentSignals.referenceEnergy === "number"
        ? recentSignals.referenceEnergy
        : typeof context.nowPlaying?.energy === "number"
            ? context.nowPlaying.energy
            : 0.5;
    const trackEnergy = typeof track?.energy === "number" ? track.energy : referenceEnergy;
    const trailEnergyDelta = clamp(Number((trackEnergy - referenceEnergy).toFixed(2)), -1, 1);
    const wantsPivot = showEmotion.surpriseBudget > 0.58 ||
        showEmotion.motionTargetDelta > 0.05 ||
        showEmotion.motionTargetDelta < -0.04;
    let weight = 0;
    let note = null;
    if (sameArtistCount > 0) {
        weight -= 1.9;
        note = `${track.artist} is still ringing in the last few turns, so another pass could make the set repeat its sentence.`;
    }
    else if (sameGenreCount >= 2 && !wantsPivot) {
        weight -= 0.8;
        note = `${primaryGenreLabel} has already had a few bites at the apple, so the next move may want a different accent.`;
    }
    else if (sameDecadeCount >= 3 && !wantsPivot) {
        weight -= 0.55;
        note = `${decadeLabel} color is already heavy in the rear-view mirror, so this can blur the set's contour.`;
    }
    else if (wantsPivot) {
        weight += 0.95;
        note = `Compared with the last few turns, it changes the sentence enough to keep the hour feeling authored.`;
    }
    else {
        weight += 0.4;
        note = `It keeps the last few turns legible without simply restating them.`;
    }
    if (wantsPivot && note && weight < 0 && Math.abs(trailEnergyDelta - showEmotion.motionTargetDelta) < 0.08) {
        weight += 0.35;
    }
    return {
        note,
        weight: clamp(weight, -2.4, 1.9)
    };
};
const buildTransitionDiagnostics = (fromTrack, toTrack, showEmotion) => {
    if (!toTrack) {
        return {
            score: 0,
            note: `It can author a fresh opening inside ${showEmotion.sequenceShape}.`,
            continuity: showEmotion.continuityBias,
            surprise: showEmotion.surpriseBudget,
            energyDelta: showEmotion.motionTargetDelta,
            sharedGenres: []
        };
    }
    if (!fromTrack) {
        return {
            score: 0.8,
            note: `It can author a fresh opening inside ${showEmotion.sequenceShape}.`,
            continuity: showEmotion.continuityBias,
            surprise: showEmotion.surpriseBudget,
            energyDelta: showEmotion.motionTargetDelta,
            sharedGenres: []
        };
    }
    const fromEnergy = typeof fromTrack?.energy === "number" ? fromTrack.energy : 0.5;
    const toEnergy = typeof toTrack?.energy === "number" ? toTrack.energy : fromEnergy;
    const energyDelta = clamp(Number((toEnergy - fromEnergy).toFixed(2)), -1, 1);
    const sharedGenres = buildSharedGenreList(toTrack, fromTrack);
    const toDecade = buildDecadeLabel(toTrack);
    const fromDecade = buildDecadeLabel(fromTrack);
    const sameArtist = normalizeInsightText(toTrack?.artist) !== "" &&
        normalizeInsightText(toTrack?.artist) === normalizeInsightText(fromTrack?.artist);
    const sameAlbum = normalizeInsightText(toTrack?.album ? `${toTrack.artist} ${toTrack.album}` : "") !== "" &&
        normalizeInsightText(toTrack?.album ? `${toTrack.artist} ${toTrack.album}` : "") === normalizeInsightText(fromTrack?.album ? `${fromTrack.artist} ${fromTrack.album}` : "");
    let continuity = 0.34;
    if (sharedGenres.length > 0) {
        continuity += 0.28;
    }
    if (toDecade && fromDecade && toDecade === fromDecade) {
        continuity += 0.12;
    }
    if (sameArtist) {
        continuity += 0.18;
    }
    if (sameAlbum) {
        continuity += 0.1;
    }
    continuity = clamp(continuity, 0.05, 0.95);
    let surprise = 1 - continuity;
    if (toDecade && fromDecade && toDecade !== fromDecade) {
        surprise += 0.1;
    }
    if (sharedGenres.length === 0) {
        surprise += 0.08;
    }
    surprise = clamp(surprise, 0.08, 0.95);
    const score = clamp(1.9 - Math.abs(continuity - showEmotion.continuityBias) * 4, -1.8, 2.2);
    const paletteLine = sharedGenres.length > 0
        ? `keeps ${sharedGenres.slice(0, 2).join(" / ").toLowerCase()} alive in the musical language`
        : toDecade && fromDecade && toDecade !== fromDecade
            ? `turns the color from ${fromDecade} into ${toDecade}`
            : sameArtist
                ? `stays inside the same hand on purpose`
                : `changes the palette without cutting the thread`;
    return {
        score,
        note: `${describeEnergyMove(energyDelta)} after ${buildTrackLabel(fromTrack)} and ${paletteLine}.`,
        continuity,
        surprise,
        energyDelta,
        sharedGenres
    };
};
const buildEmotionFitNote = (energyDelta, showEmotion) => {
    const gap = Math.abs(energyDelta - showEmotion.motionTargetDelta);
    return {
        note: gap < 0.08
            ? `It hits the ${showEmotion.motionLabel} move this hour is asking for.`
            : energyDelta > showEmotion.motionTargetDelta
                ? `It pushes harder than the ${showEmotion.motionLabel} brief.`
                : `It comes in softer than the ${showEmotion.motionLabel} brief.`,
        weight: clamp(2.3 - gap * 8, -2, 2.3)
    };
};
const buildRiskFitNote = (surpriseLevel, showEmotion) => {
    const gap = Math.abs(surpriseLevel - showEmotion.surpriseBudget);
    return {
        note: gap < 0.12
            ? `The risk level matches the hour's appetite for surprise.`
            : surpriseLevel > showEmotion.surpriseBudget
                ? `It is bolder than the room wants from Mr Rassy right now.`
                : `It may play a little safer than the room can handle.`,
        weight: clamp(1.8 - gap * 4.5, -1.6, 2)
    };
};
const buildDecisionFrame = (context) => {
    const setDesign = buildSetDesignBrief(context);
    return {
        setDesign,
        showEmotion: buildShowEmotionFrame(context, setDesign),
        signalMaps: buildLibrarySignalMaps(context),
        liveSignals: buildLiveTurnSignalMaps(context),
        crowdSignals: buildCrowdSignalMaps(context),
        recentSignals: buildRecentTrailSignalMaps(context)
    };
};
const buildDecisionTrackAnalysis = (track, context, frame) => {
    const anchorTrack = frame.setDesign.anchorTrack;
    const sharedGenres = buildSharedGenreList(track, anchorTrack);
    const trackDecade = buildDecadeLabel(track);
    const anchorDecade = buildDecadeLabel(anchorTrack);
    const energyValue = typeof track?.energy === "number" ? track.energy : frame.setDesign.referenceEnergy;
    const energyDelta = clamp(Number((energyValue - frame.setDesign.referenceEnergy).toFixed(2)), -1, 1);
    const requestAffinity = buildRequestAffinity(track, context.requests.slice(0, 4));
    const libraryFit = buildLibraryFitNote(track, frame.signalMaps);
    const programmingFit = buildProgrammingFitNote(track, context);
    const crowdFit = buildCrowdFitNote(track, context, frame.crowdSignals);
    const saturation = buildSaturationNote(track, context, frame.liveSignals);
    const recentTrailFit = buildRecentTrailFitNote(track, context, frame.recentSignals, frame.showEmotion);
    const transition = buildTransitionDiagnostics(anchorTrack, track, frame.showEmotion);
    const emotionFit = buildEmotionFitNote(transition.energyDelta ?? energyDelta, frame.showEmotion);
    const surpriseLevel = clamp(transition.surprise +
        (trackDecade && anchorDecade && trackDecade !== anchorDecade ? 0.05 : 0) +
        (programmingFit.weight > 1.5 ? -0.06 : 0), 0.08, 0.95);
    const riskFit = buildRiskFitNote(surpriseLevel, frame.showEmotion);
    let role = "anchor";
    if (requestAffinity.score >= 12) {
        role = "request answer";
    }
    else if (transition.continuity >= 0.64 && Math.abs(energyDelta) <= 0.14) {
        role = "bridge";
    }
    else if (energyDelta > 0.16) {
        role = "lift";
    }
    else if (energyDelta < -0.16) {
        role = "release";
    }
    else if (surpriseLevel > 0.58 || sharedGenres.length === 0 || (trackDecade && anchorDecade && trackDecade !== anchorDecade)) {
        role = "left turn";
    }
    let arcJob = "thesis";
    if (role === "left turn" || (riskFit.weight > 0.4 && surpriseLevel > 0.56)) {
        arcJob = "hinge";
    }
    else if (role === "lift" && frame.showEmotion.motionTargetDelta >= 0) {
        arcJob = "payoff";
    }
    else if (role === "release" && frame.showEmotion.motionTargetDelta < 0.04) {
        arcJob = "afterglow";
    }
    else if (role === "request answer" && context.requests.length > 1) {
        arcJob = "hinge";
    }
    else if (programmingFit.weight > 2.2) {
        arcJob = "thesis";
    }
    const handoff = anchorTrack ? transition.note : `${describeEnergyMove(energyDelta)} inside ${context.mood}.`;
    const requestFit = requestAffinity.request
        ? `The request line is already leaning this way through "${requestAffinity.request}".`
        : null;
    const contrastNote = trackDecade && anchorDecade && trackDecade !== anchorDecade
        ? `${trackDecade} color against a ${anchorDecade} anchor.`
        : sharedGenres.length === 0 && buildGenreList(track).length > 0
            ? `${buildGenreList(track).slice(0, 2).join(" / ")} changes the palette without breaking the spell.`
            : null;
    const whyNow = [
        requestAffinity.score >= 10 ? requestFit : null,
        handoff,
        programmingFit.note ?? (crowdFit.weight > 0 ? crowdFit.note : null) ?? libraryFit.note,
        recentTrailFit.weight > 0.45 ? recentTrailFit.note : null,
        riskFit.weight > 0.35 ? riskFit.note : null
    ]
        .filter(Boolean)
        .join(" ");
    const score = requestAffinity.score +
        libraryFit.weight +
        programmingFit.weight +
        crowdFit.weight +
        recentTrailFit.weight +
        transition.score +
        emotionFit.weight +
        riskFit.weight +
        sharedGenres.length * 1.8 +
        (role === "bridge"
            ? 2.6
            : role === "request answer"
                ? 2.4
                : role === "lift" || role === "release"
                    ? 1.8
                    : role === "left turn"
                        ? 1.2
                        : 1.4) +
        (1 - Math.min(1, Math.abs(energyDelta))) * 1.2 -
        saturation.penalty +
        (frame.showEmotion.familiarityBias > 0.62 && libraryFit.weight > 0 ? 0.5 : 0) +
        (frame.showEmotion.surpriseBudget > 0.64 && role === "left turn" ? 0.7 : 0);
    return {
        role,
        arcJob,
        whyNow,
        handoff,
        queueFit: handoff,
        crowdRead: crowdFit.note ?? `The crowd is ${frame.showEmotion.crowdState}, so the move needs to read clean.`,
        programmingFit: programmingFit.note,
        saturationRisk: saturation.note,
        libraryFit: libraryFit.note,
        recentTrailFit: recentTrailFit.note,
        requestFit,
        requestScore: requestAffinity.score,
        contrastNote,
        energyDelta,
        surpriseLevel,
        familiarityLevel: clamp(1 - surpriseLevel, 0.05, 0.95),
        score
    };
};
const buildDecisionTrackPayload = (track, analysis, slot, insightMap = new Map()) => {
    const storedInsight = insightMap.get(track.id) ?? null;
    const fallbackInsight = buildTrackInsightScaffold(track);
    const knowledge = buildTrackKnowledgeCard(track, storedInsight ?? fallbackInsight);
    return {
        slot,
        ...buildTrackPayload(track),
        decade: buildDecadeLabel(track),
        durationMinutes: typeof track.duration === "number" ? Number((track.duration / 60).toFixed(1)) : undefined,
        setRole: analysis.role,
        arcJob: analysis.arcJob,
        whyNow: analysis.whyNow,
        handoff: analysis.handoff,
        queueFit: analysis.queueFit,
        crowdRead: analysis.crowdRead,
        programmingFit: analysis.programmingFit,
        saturationRisk: analysis.saturationRisk,
        libraryFit: analysis.libraryFit,
        recentTrailFit: analysis.recentTrailFit,
        requestFit: analysis.requestFit,
        contrastNote: analysis.contrastNote,
        energyDelta: analysis.energyDelta,
        surpriseLevel: Number(analysis.surpriseLevel.toFixed(2)),
        familiarityLevel: Number(analysis.familiarityLevel.toFixed(2)),
        setUse: knowledge.setReason,
        historyAnchor: knowledge.historicalAnchor,
        trackStory: knowledge.trackStory,
        listenFor: knowledge.listenFor,
        passionLine: knowledge.passionLine,
        funFacts: knowledge.funFacts.slice(0, 2),
        requestTags: knowledge.requestHooks.slice(0, 6)
    };
};
const buildDecisionTrackPromptPayload = (track, analysis, slot, mode = "full", insightMap = new Map()) => {
    if (mode !== "rescue") {
        return buildDecisionTrackPayload(track, analysis, slot, insightMap);
    }
    const storedInsight = insightMap.get(track.id) ?? null;
    const fallbackInsight = buildTrackInsightScaffold(track);
    const knowledge = buildTrackKnowledgeCard(track, storedInsight ?? fallbackInsight);
    return {
        slot,
        title: track.title,
        artist: track.artist,
        album: track.album,
        year: track.year,
        decade: buildDecadeLabel(track),
        genres: buildGenreList(track),
        energy: track.energy,
        setRole: analysis.role,
        arcJob: analysis.arcJob,
        whyNow: analysis.whyNow,
        queueFit: analysis.queueFit,
        crowdRead: analysis.crowdRead,
        programmingFit: analysis.programmingFit,
        saturationRisk: analysis.saturationRisk,
        recentTrailFit: analysis.recentTrailFit,
        requestFit: analysis.requestFit,
        surpriseLevel: Number(analysis.surpriseLevel.toFixed(2)),
        setUse: knowledge.setReason,
        historyAnchor: knowledge.historicalAnchor,
        requestTags: knowledge.requestHooks.slice(0, 4)
    };
};
const buildTrackKnowledgeAngles = (track, storedInsight) => {
    if (storedInsight) {
        return [
            storedInsight.historicalAnchor,
            storedInsight.trackStory,
            storedInsight.listenFor,
            storedInsight.passionLine,
            ...(storedInsight.funFacts ?? [])
        ]
            .filter(Boolean)
            .slice(0, 3);
    }
    const angles = [];
    if (track?.album && track?.year) {
        angles.push(`album-and-era context: ${track.album} (${track.year})`);
    }
    else if (track?.album) {
        angles.push(`album context: ${track.album}`);
    }
    const genres = buildGenreList(track);
    if (genres.length > 0) {
        angles.push(`scene lineage through ${genres.slice(0, 2).join(" / ")}`);
    }
    if (typeof track?.duration === "number" && track.duration > 7 * 60) {
        angles.push("long-form arrangement and patience");
    }
    angles.push("sound, arrangement, and production texture");
    return angles.slice(0, 3);
};
const buildListenerTrackFrame = (track) => track?.title
    ? {
        id: track.id,
        title: track.title,
        artist: track.artist,
        album: track.album,
        year: track.year,
        genres: track.genres,
        energy: track.energy
    }
    : null;
const extractRecentDjOpeners = (messages) => Array.from(new Set(messages
    .filter((message) => message.role === "dj")
    .map((message) => message.text
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[.!?])\s+/)[0]
    ?.split(" ")
    .slice(0, 8)
    .join(" ")
    .trim())
    .filter((value) => Boolean(value)))).slice(-4);
const inferListenerIntentHint = (message) => {
    const normalized = message.toLowerCase();
    if (/\bskip|cut|pass on|move on|get this off|change it|next song|next one\b/.test(normalized)) {
        return "skip intervention";
    }
    if (/\blife|love|lonely|alone|sad|heart|grief|miss|loss|lost|scared|anxious|stress|work|job|family|friend|marriage|divorce|kids|tired|burned out|wrung out|drained|overwhelmed\b/.test(normalized)) {
        return "late-night life conversation";
    }
    if (/\bplay|spin|queue|put on|drop|request|recommend|hear|need|want|give me|take me|something|anything|lane|mood|same decade|same artist|deep cut|era|genre|set\b/.test(normalized)) {
        return "music request";
    }
    if (/\bwhy this|why that|why now|how does this fit|why this song|why this track|why this record\b/.test(normalized)) {
        return "why this record fits";
    }
    if (/\btell me about|take me deeper|history|recording|recorded|structure|listen for|what should i hear|what am i hearing|artist context|album context\b/.test(normalized)) {
        return "music context";
    }
    if (/\bian\b|\bpersonal\b|\btaste\b/.test(normalized)) {
        return "Ian taste conversation";
    }
    if (/\bhello|hey|hi|yo|what'?s up|how are you|talk to me|tell me something\b/.test(normalized)) {
        return "open conversational check-in";
    }
    return "open-ended live chat";
};
const buildDecisionTrackCandidates = (context, limit = 16) => {
    const frame = buildDecisionFrame(context);
    const pool = context.librarySample.slice(0, Math.max(limit * 4, 32));
    if (pool.length === 0) {
        return [];
    }
    const selected = [];
    const usedTrackIds = new Set();
    const analyzed = pool.map((track) => ({
        track,
        analysis: buildDecisionTrackAnalysis(track, context, frame)
    }));
    const takeBest = (predicate, count) => {
        if (selected.length >= limit || count <= 0) {
            return;
        }
        const matches = analyzed
            .filter((item) => !usedTrackIds.has(item.track.id) && predicate(item))
            .sort((left, right) => right.analysis.score - left.analysis.score);
        for (const item of matches) {
            if (selected.length >= limit || count <= 0) {
                break;
            }
            selected.push(item);
            usedTrackIds.add(item.track.id);
            count -= 1;
        }
    };
    takeBest((item) => item.analysis.requestScore >= 10, 2);
    takeBest((item) => item.analysis.arcJob === "thesis", Math.max(2, Math.ceil(limit * 0.18)));
    takeBest((item) => item.analysis.arcJob === "hinge", Math.max(2, Math.ceil(limit * 0.18)));
    takeBest((item) => item.analysis.arcJob === "payoff", Math.max(2, Math.ceil(limit * 0.18)));
    takeBest((item) => item.analysis.arcJob === "afterglow", Math.max(1, Math.ceil(limit * 0.1)));
    takeBest((item) => item.analysis.role === "bridge", Math.max(2, Math.ceil(limit * 0.16)));
    takeBest((item) => item.analysis.role === "left turn", Math.max(1, Math.ceil(limit * 0.12)));
    takeBest((item) => item.analysis.role === "anchor", Math.max(1, Math.ceil(limit * 0.12)));
    takeBest(() => true, limit);
    return selected.slice(0, Math.max(1, limit)).map((item, index) => ({
        slot: index + 1,
        track: item.track,
        analysis: item.analysis
    }));
};
const buildDecisionSnippetCandidates = (context, limit = 3) => context.snippetSample.slice(0, Math.max(0, limit)).map((snippet, index) => ({
    slot: index + 1,
    snippet
}));
const buildDecisionAnalysisMap = (trackCandidates) => new Map(trackCandidates.map((candidate) => [candidate.track.id, candidate.analysis]));
const buildTrackPermutations = (tracks) => {
    if (tracks.length <= 1) {
        return [tracks];
    }
    const permutations = [];
    for (let index = 0; index < tracks.length; index += 1) {
        const current = tracks[index];
        const remaining = [...tracks.slice(0, index), ...tracks.slice(index + 1)];
        for (const permutation of buildTrackPermutations(remaining)) {
            permutations.push([current, ...permutation]);
        }
    }
    return permutations;
};
const scoreTrackSequence = (tracks, context, frame, analysisMap) => {
    if (tracks.length === 0) {
        return { score: Number.NEGATIVE_INFINITY };
    }
    let total = 0;
    let previous = frame.setDesign.anchorTrack ?? null;
    const usedArtists = new Set();
    const usedAlbums = new Set();
    let positiveMoves = 0;
    let negativeMoves = 0;
    for (let index = 0; index < tracks.length; index += 1) {
        const track = tracks[index];
        const analysis = analysisMap.get(track.id);
        if (!analysis) {
            continue;
        }
        total += analysis.score;
        if (index === 0 && analysis.arcJob === "thesis") {
            total += 0.9;
        }
        if (index === Math.floor((tracks.length - 1) / 2) && analysis.arcJob === "hinge") {
            total += 0.8;
        }
        if (index === tracks.length - 1 && (analysis.arcJob === "payoff" || analysis.arcJob === "afterglow")) {
            total += 0.85;
        }
        const transition = buildTransitionDiagnostics(previous, track, frame.showEmotion);
        total += transition.score;
        if (transition.energyDelta > 0.04) {
            positiveMoves += 1;
        }
        else if (transition.energyDelta < -0.04) {
            negativeMoves += 1;
        }
        const artistKey = normalizeInsightText(track.artist);
        const albumKey = normalizeInsightText(track.album ? `${track.artist} ${track.album}` : "");
        const allowArtistRepeat = context.programming?.specialType === "same-artist" || context.programming?.specialType === "album-run";
        const allowAlbumRepeat = context.programming?.specialType === "album-run";
        if (!allowArtistRepeat && usedArtists.has(artistKey)) {
            total -= 3.4;
        }
        if (!allowAlbumRepeat && albumKey && usedAlbums.has(albumKey)) {
            total -= 1.8;
        }
        usedArtists.add(artistKey);
        if (albumKey) {
            usedAlbums.add(albumKey);
        }
        previous = track;
    }
    const firstEnergy = typeof tracks[0]?.energy === "number" ? tracks[0].energy : frame.setDesign.referenceEnergy;
    const lastEnergy = typeof tracks[tracks.length - 1]?.energy === "number"
        ? tracks[tracks.length - 1].energy
        : firstEnergy;
    const desiredArcDelta = frame.showEmotion.motionTargetDelta * Math.max(1, tracks.length);
    total += clamp(1.4 - Math.abs((lastEnergy - firstEnergy) - desiredArcDelta) * 3, -1.4, 1.4);
    if (frame.showEmotion.motionTargetDelta > 0.04 && positiveMoves > 0) {
        total += 0.6;
    }
    if (frame.showEmotion.motionTargetDelta < -0.03 && negativeMoves > 0) {
        total += 0.6;
    }
    if (frame.showEmotion.surpriseBudget > 0.6 && tracks.some((track) => analysisMap.get(track.id)?.arcJob === "hinge")) {
        total += 0.4;
    }
    return { score: total };
};
const buildBestPlaylistOrder = (tracks, context, frame, analysisMap) => {
    if (tracks.length <= 1 || tracks.length > 6) {
        return tracks;
    }
    let bestTracks = tracks;
    let bestScore = Number.NEGATIVE_INFINITY;
    for (const permutation of buildTrackPermutations(tracks)) {
        const sequenceScore = scoreTrackSequence(permutation, context, frame, analysisMap).score;
        if (sequenceScore > bestScore) {
            bestScore = sequenceScore;
            bestTracks = permutation;
        }
    }
    return bestTracks;
};
const buildSequenceSketches = (trackCandidates, context, frame, playlistSize = 3) => {
    const desiredLength = getPlaylistDecisionLength(playlistSize, trackCandidates.length);
    if (desiredLength < 2 || trackCandidates.length < desiredLength) {
        return [];
    }
    const analysisMap = buildDecisionAnalysisMap(trackCandidates);
    const seeds = trackCandidates.slice(0, Math.min(8, trackCandidates.length));
    const sketches = [];
    const seenSignatures = new Set();
    for (const seed of seeds) {
        const chosen = [seed];
        while (chosen.length < desiredLength) {
            const usedIds = new Set(chosen.map((candidate) => candidate.track.id));
            let bestNext = null;
            let bestScore = Number.NEGATIVE_INFINITY;
            for (const candidate of trackCandidates) {
                if (usedIds.has(candidate.track.id)) {
                    continue;
                }
                const trialTracks = buildBestPlaylistOrder([...chosen.map((item) => item.track), candidate.track], context, frame, analysisMap);
                const trialScore = scoreTrackSequence(trialTracks, context, frame, analysisMap).score;
                if (trialScore > bestScore) {
                    bestScore = trialScore;
                    bestNext = candidate;
                }
            }
            if (!bestNext) {
                break;
            }
            chosen.push(bestNext);
        }
        const orderedTracks = buildBestPlaylistOrder(chosen.map((item) => item.track), context, frame, analysisMap);
        if (orderedTracks.length < desiredLength) {
            continue;
        }
        const signature = orderedTracks.map((track) => track.id).join(">");
        if (seenSignatures.has(signature)) {
            continue;
        }
        seenSignatures.add(signature);
        const orderedEntries = orderedTracks
            .map((track) => trackCandidates.find((candidate) => candidate.track.id === track.id))
            .filter(Boolean);
        const sequenceScore = scoreTrackSequence(orderedTracks, context, frame, analysisMap).score;
        sketches.push({
            slots: orderedEntries.map((entry) => entry.slot),
            shape: frame.showEmotion.sequenceShape,
            why: buildSequenceWhy(orderedTracks),
            score: sequenceScore
        });
    }
    return sketches
        .sort((left, right) => right.score - left.score)
        .slice(0, 4)
        .map(({ score, ...rest }) => rest);
};
const refineDecisionPlaylistIds = (selectedIds, trackCandidates, context, frame, playlistSize, sequenceSketches = []) => {
    const candidateMap = new Map(trackCandidates.map((candidate) => [candidate.track.id, candidate]));
    const analysisMap = buildDecisionAnalysisMap(trackCandidates);
    let chosen = Array.from(new Set(selectedIds.filter((trackId) => candidateMap.has(trackId))))
        .map((trackId) => candidateMap.get(trackId))
        .filter(Boolean);
    if (chosen.length === 0 && sequenceSketches[0]) {
        chosen = sequenceSketches[0].slots
            .map((slot) => trackCandidates.find((candidate) => candidate.slot === slot))
            .filter(Boolean);
    }
    const targetCount = getPlaylistDecisionLength(playlistSize ?? chosen.length ?? 2, trackCandidates.length);
    while (chosen.length < targetCount) {
        const usedIds = new Set(chosen.map((candidate) => candidate.track.id));
        let bestNext = null;
        let bestScore = Number.NEGATIVE_INFINITY;
        for (const candidate of trackCandidates) {
            if (usedIds.has(candidate.track.id)) {
                continue;
            }
            const trialTracks = buildBestPlaylistOrder([...chosen.map((item) => item.track), candidate.track], context, frame, analysisMap);
            const trialScore = scoreTrackSequence(trialTracks, context, frame, analysisMap).score;
            if (trialScore > bestScore) {
                bestScore = trialScore;
                bestNext = candidate;
            }
        }
        if (!bestNext) {
            break;
        }
        chosen.push(bestNext);
    }
    const orderedTracks = buildBestPlaylistOrder(chosen.map((candidate) => candidate.track), context, frame, analysisMap);
    return orderedTracks.map((track) => track.id);
};
const buildProgrammingPayload = (programming) => programming
    ? {
        mode: programming.mode,
        label: programming.label,
        description: programming.description,
        specialType: programming.specialType,
        artist: programming.artist,
        album: programming.album,
        decade: programming.decade,
        genre: programming.genre,
        trackIds: programming.trackIds?.slice(0, 8)
    }
    : {
        mode: "standard",
        label: "Open set",
        description: "Mr Rassy is free to build the next turn on feel."
    };
const buildLibraryDna = (context) => ({
    totalTracks: context.libraryProfile?.totalTracks ?? 0,
    losslessTracks: context.libraryProfile?.losslessTracks ?? 0,
    topArtists: context.libraryProfile?.topArtists?.slice(0, 6) ?? [],
    topGenres: context.libraryProfile?.topGenres?.slice(0, 6) ?? [],
    topDecades: context.libraryProfile?.topDecades?.slice(0, 5) ?? []
});
const MR_RASSY_MODEL = config.CHESHIRE_MODEL || "rassy-smart";
const GENERIC_BOOTH_MEMORY_PATTERN = /\b(lands here|nice flow|good vibe|works because it fits|keeps the (?:room|hour|energy) moving|without flattening|real decision|real choice)\b/i;
const SPECIFIC_BOOTH_MEMORY_PATTERN = /\b(19|20)\d{2}\b|\b(album|catalog|label|scene|groove|pocket|bass|drums?|vocal|harmony|arrangement|mix|reverb|echo|transition|handoff|request line|listen|hear|notice|catch|wait for)\b/i;
const pickPromptBoothMemories = (values = []) => Array.from(new Set((values ?? [])
    .map((value) => typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "")
    .filter((value) => value.length >= 24 && !GENERIC_BOOTH_MEMORY_PATTERN.test(value) && SPECIFIC_BOOTH_MEMORY_PATTERN.test(value)))).slice(0, 2);
const boothDossierQualityBar = [
    "whyItFits must explain the handoff, request pressure, or programming role of the record.",
    "context must include at least one concrete anchor such as year, album, label, scene, lineup, arrangement, or production detail.",
    "listenFor must point at a musical event or texture with real record-lover detail.",
    "If a fact is uncertain, pivot to sound or structure instead of inventing lore."
];
const boothDossierForbiddenPhrases = [
    "lands here because",
    "good vibe",
    "nice flow",
    "works because it fits",
    "without flattening the hour",
    "arrangement hinge"
];
const boothDossierOutputBlueprint = {
    headline: "one sentence naming the live turn and its pressure",
    intro: "2-3 sentences on why this turn exists right now",
    cards: [
        "Lineup: the set logic",
        "Context: the history, scene, or recording anchor",
        "Listen for: the specific musical detail Mr Rassy loves"
    ],
    sessionTrackFields: {
        whyItFits: "set logic tied to previous track, next track, request pressure, or programming lane",
        context: "specific artist, album, year, scene, lineup, arrangement, or production detail",
        listenFor: "specific instrument, vocal, groove, mix, harmony, or structural cue"
    }
};
const toInsightTrack = (track) => track?.title && track?.artist
    ? {
        ...track,
        id: track.id ?? `${track.artist}::${track.title}`,
        energy: typeof track.energy === "number" ? track.energy : 0.5,
        moodTags: Array.isArray(track.moodTags) ? track.moodTags : []
    }
    : null;
const buildPromptTrackKnowledge = (track, insightMap) => {
    const insightTrack = toInsightTrack(track);
    if (!insightTrack) {
        return null;
    }
    const stored = insightMap?.get(insightTrack.id) ?? null;
    const fallback = buildTrackInsightScaffold(insightTrack);
    const resolved = buildTrackKnowledgeCard(insightTrack, stored ?? fallback);
    return {
        summary: resolved.summary,
        historicalAnchor: resolved.historicalAnchor,
        trackStory: resolved.trackStory,
        setReason: resolved.setReason,
        listenFor: resolved.listenFor,
        passionLine: resolved.passionLine,
        funFacts: resolved.funFacts?.slice(0, 3) ?? [],
        requestTags: resolved.requestHooks?.slice(0, 6) ?? [],
        boothMemories: pickPromptBoothMemories(stored?.boothMemories ?? []),
        confidence: resolved.confidence,
        playCount: resolved.playCount ?? 0,
        refinementCount: resolved.refinementCount ?? 0,
        source: resolved.source
    };
};
const buildLiveTurnBrief = (context, insightMap = new Map()) => {
    const nowTrack = toInsightTrack(context.nowPlaying);
    const nextTrack = toInsightTrack(context.queuePreview[0]);
    const laterTrack = toInsightTrack(context.queuePreview[1]);
    const nowKnowledge = nowTrack ? buildPromptTrackKnowledge(nowTrack, insightMap) : null;
    const nextKnowledge = nextTrack ? buildPromptTrackKnowledge(nextTrack, insightMap) : null;
    const nowTurn = nowTrack
        ? buildTrackTurnIntelligence(nowTrack, {
            nextTrack,
            context
        })
        : null;
    const nextTurn = nextTrack
        ? buildTrackTurnIntelligence(nextTrack, {
            previousTrack: nowTrack,
            nextTrack: laterTrack,
            context
        })
        : null;
    return {
        thesis: nowKnowledge?.setReason ?? nowTurn?.whyItFits ?? null,
        currentDetail: nowKnowledge?.trackStory ?? nowTurn?.context ?? null,
        passion: nowKnowledge?.passionLine ?? nowTurn?.listenFor ?? null,
        nextOpening: nextKnowledge?.setReason ?? nextTurn?.whyItFits ?? null,
        requestWindow: context.requests[0]
            ? nextTrack
                ? `${context.requests[0]} is already on the line, but ${buildTrackLabel(nextTrack)} still has to make musical sense as the next answer.`
                : `${context.requests[0]} is hanging over the line and shaping the pressure on the next move.`
            : null,
        crowdLean: context.feedbackTopLiked[0]
            ? `${buildTrackLabel(context.feedbackTopLiked[0])} is drawing the strongest listener pull right now.`
            : null,
        currentTurn:
            nowTrack && nextTrack
                ? `${buildTrackLabel(nowTrack)} -> ${buildTrackLabel(nextTrack)}`
                : nowTrack
                    ? buildTrackLabel(nowTrack)
                    : null
    };
};
const buildBoothEntityDraft = (context, input, insightMap) => {
    const liveTurn = [
        context.nowPlaying
            ? {
                role: "now",
                ...context.nowPlaying
            }
            : null,
        ...context.queuePreview.slice(0, 2).map((track, index) => ({
            role: index === 0 ? "next" : "later",
            ...track
        }))
    ].filter(Boolean);
    return {
        entityMode: "factual-spine",
        headlineSeed: liveTurn[0]?.title && liveTurn[1]?.title
            ? `${liveTurn[0].title} -> ${liveTurn[1].title}`
            : liveTurn[0]?.title ?? "Open turn",
        mood: context.mood,
        dayPart: context.dayPart,
        emotionalWeather: context.emotionalWeather,
        requestLine: context.requests.slice(0, 2),
        onAirReason: input.djReason ?? null,
        onAirScript: input.djScript ?? null,
        sessionTracks: liveTurn.map((track) => ({
            role: track.role,
            trackId: track.id,
            title: track.title,
            artist: track.artist,
            album: track.album,
            year: track.year,
            genres: track.genres?.slice(0, 3),
            energy: track.energy,
            playback: (input.playbackPlans ?? [])
                .filter((plan) => plan.trackId === track.id)
                .map((plan) => ({
                mode: plan.mode,
                segment: plan.segment,
                reason: plan.reason
            }))
                .slice(0, 1),
            trackKnowledge: buildPromptTrackKnowledge(track, insightMap)
        }))
    };
};
const buildBoothTrackProfiles = (context, insightMap = new Map()) => {
    const liveTurn = [
        context.nowPlaying
            ? {
                ...context.nowPlaying,
                role: "now"
            }
            : null,
        ...context.queuePreview.slice(0, 2).map((track, index) => ({
            ...track,
            role: index === 0 ? "next" : "later"
        }))
    ].filter(Boolean);
    if (liveTurn.length === 0) {
        return [];
    }
    const frame = buildDecisionFrame(context);
    return liveTurn.map((track, index) => {
        const previousTrack = index > 0 ? liveTurn[index - 1] : null;
        const nextTrack = liveTurn[index + 1] ?? null;
        const analysis = buildDecisionTrackAnalysis(track, context, frame);
        const trackKnowledge = buildPromptTrackKnowledge(track, insightMap);
        return {
            role: track.role,
            title: track.title,
            artist: track.artist,
            album: track.album,
            year: track.year,
            decade: buildDecadeLabel(track),
            genres: buildGenreList(track),
            energy: track.energy,
            setRole: analysis.role,
            arcJob: analysis.arcJob,
            transition: {
                from: previousTrack ? buildListenerTrackFrame(previousTrack) : null,
                note: analysis.handoff
            },
            requestPressure: analysis.requestFit,
            programmingFit: analysis.programmingFit,
            contrast: analysis.contrastNote,
            nextTrack: nextTrack ? buildListenerTrackFrame(nextTrack) : null,
            trackKnowledge,
            knowledgeAngles: buildTrackKnowledgeAngles(track, trackKnowledge)
        };
    });
};
const buildRecentTrailStory = (context, frame) => {
    const recentTrail = (context.recentTracks ?? []).slice(0, 4).filter(Boolean);
    if (recentTrail.length === 0) {
        return "No strong recent-trail signal yet; author the next sentence from the live turn.";
    }
    const labels = recentTrail.map((track) => buildTrackLabel(track));
    return `${labels.join(" -> ")} is the sentence the station just spoke. ${frame.showEmotion.surpriseBudget > 0.58
        ? "Add a fresh accent instead of repeating it."
        : "Keep it legible, but do not let the hour say the same thing twice."}`;
};
const buildUserPrompt = (context, intent = "track", playlistSize, candidates, frame = buildDecisionFrame(context), mode = "full", insightMap = new Map()) => {
    const isRescue = mode === "rescue";
    const queuePreview = context.queuePreview.slice(0, isRescue ? 3 : 6).map((track) => ({
        title: track.title,
        artist: track.artist,
        album: track.album,
        year: track.year,
        genres: track.genres?.slice(0, 2),
        energy: track.energy
    }));
    const recentTracks = context.recentTracks.slice(0, isRescue ? 4 : 6).map((track) => ({
        title: track.title,
        artist: track.artist
    }));
    const recentArtists = context.recentArtists.slice(0, isRescue ? 4 : 6);
    const recentFeedback = context.feedback
        .filter((item) => Number(item.score ?? 0) !== 0)
        .slice(0, isRescue ? 4 : 6);
    const turnWindow = buildLiveTurnBrief(context, insightMap);
    const libraryDNA = isRescue
        ? {
            totalTracks: context.libraryProfile?.totalTracks ?? 0,
            losslessTracks: context.libraryProfile?.losslessTracks ?? 0,
            topGenres: context.libraryProfile?.topGenres?.slice(0, 3) ?? [],
            topDecades: context.libraryProfile?.topDecades?.slice(0, 3) ?? []
        }
        : buildLibraryDna(context);
    const requestedWindow = intent === "playlist" ? getRequestedPlaylistDecisionSize(playlistSize) : 1;
    const setPlanMode = intent === "playlist" && requestedWindow > (context.lockedQueueSize ?? 3);
    return JSON.stringify({
        intent,
        playlistSize,
        room: {
            station: "Mr Rassy Radio",
            host: "Mr Rassy",
            mood: context.mood,
            timeOfDay: context.timeOfDay,
            dayOfWeek: context.dayOfWeek,
            dayPart: context.dayPart,
            emotionalWeather: context.emotionalWeather,
            queueDepth: context.queueDepth,
            lockedQueueSize: context.lockedQueueSize ?? 3
        },
        planner: {
            mode: setPlanMode ? "set-plan" : "rolling-window",
            decisionWindow: requestedWindow,
            note: setPlanMode
                ? "Choose a full authored set that can unfold across the next eleven songs. Only the next few songs are physically locked in the live queue, but the whole set should hold together from opener through landing."
                : "Choose only the next small authored move. The station will re-decide from fresh context after this window."
        },
        setDesign: {
            handoffSource: frame.setDesign.anchorTrack ? buildListenerTrackFrame(frame.setDesign.anchorTrack) : null,
            targetEnergy: Number(frame.setDesign.referenceEnergy.toFixed(2)),
            emotionalGoal: frame.setDesign.emotionalGoal,
            arcPressure: frame.setDesign.arcPressure,
            authorship: frame.setDesign.authorship,
            antiGoals: frame.setDesign.antiGoals
        },
        turnWindow,
        showEmotion: {
            crowdState: frame.showEmotion.crowdState,
            requestPressure: frame.showEmotion.requestPressure,
            motion: frame.showEmotion.motionLabel,
            motionTargetDelta: Number(frame.showEmotion.motionTargetDelta.toFixed(2)),
            surpriseBudget: Number(frame.showEmotion.surpriseBudget.toFixed(2)),
            familiarityBias: Number(frame.showEmotion.familiarityBias.toFixed(2)),
            continuityBias: Number(frame.showEmotion.continuityBias.toFixed(2)),
            riskLane: frame.showEmotion.riskLane,
            sequenceShape: frame.showEmotion.sequenceShape,
            thesisPrompt: frame.showEmotion.thesisPrompt,
            landingPrompt: frame.showEmotion.landingPrompt
        },
        programming: buildProgrammingPayload(context.programming),
        libraryDNA,
        nowPlaying: context.nowPlaying
            ? {
                title: context.nowPlaying.title,
                artist: context.nowPlaying.artist,
                album: context.nowPlaying.album,
                year: context.nowPlaying.year,
                genres: context.nowPlaying.genres?.slice(0, 2),
                energy: context.nowPlaying.energy
            }
            : null,
        lockedQueuePreview: (context.lockedQueuePreview ?? context.queuePreview.slice(0, 3)).slice(0, isRescue ? 2 : 3).map((track) => ({
            title: track.title,
            artist: track.artist,
            album: track.album,
            year: track.year,
            genres: track.genres?.slice(0, 2),
            energy: track.energy
        })),
        queuePreview,
        recentTracks,
        recentArtists,
        recentTrail: {
            storySoFar: buildRecentTrailStory(context, frame),
            ...(isRescue ? {} : { tracks: recentTracks })
        },
        requests: context.requests.slice(0, isRescue ? 3 : 4),
        candidateTracks: (candidates?.tracks ?? []).map(({ slot, track, analysis }) => buildDecisionTrackPromptPayload(track, analysis, slot, mode, insightMap)),
        sequenceSketches: (candidates?.sequenceSketches ?? []).map((sequence, index) => ({
            index: index + 1,
            slots: sequence.slots,
            shape: sequence.shape,
            why: sequence.why
        })),
        snippetCandidates: (candidates?.snippets ?? []).map(({ slot, snippet }) => ({
            slot,
            label: snippet.label
        })),
        feedback: recentFeedback.length > 0 ? recentFeedback : context.feedback.slice(0, 4),
        ...(isRescue
            ? {}
            : {
                feedbackTopLiked: context.feedbackTopLiked.slice(0, 4),
                feedbackTopDisliked: context.feedbackTopDisliked.slice(0, 3)
            }),
        rotationPolicy: {
            trackCooldownHours: config.RADIO_TRACK_COOLDOWN_HOURS,
            requestsCanBreakTrackCooldown: true
        },
        decisionMode: mode,
        rule: "Choose only slot numbers from candidateTracks and snippetCandidates. Never invent tracks, ids, or metadata."
    });
};
const buildListenerPrompt = async (context, input) => {
    const recentConversation = input.recentChat.slice(-6).map((entry) => ({
        role: entry.role,
        text: entry.text.slice(0, 220)
    }));
    const setDesign = buildSetDesignBrief(context);
    const lockedQueuePreview = (context.lockedQueuePreview ?? context.queuePreview.slice(0, 3)).map((track) => buildListenerTrackFrame(track));
    const queuePreview = context.queuePreview
        .slice(0, 4)
        .map((track) => buildListenerTrackFrame(track))
        .filter(Boolean);
    const insightTracks = [
        context.nowPlaying,
        ...(context.lockedQueuePreview ?? context.queuePreview.slice(0, 3)),
        ...context.queuePreview.slice(0, 4),
        ...input.requestMatches.slice(0, 4),
        ...(input.requestCandidates ?? []).slice(0, 4)
    ]
        .map((track) => toInsightTrack(track))
        .filter(Boolean);
  const insightMap = await getTrackInsightMap(insightTracks);
  const turnWindow = buildLiveTurnBrief(context, insightMap);
  void syncTrackInsights(insightTracks.slice(0, 6), {
    embed: true,
    analyze: true,
    analysisLimit: 2,
    limit: Math.min(6, insightTracks.length)
  });
    return JSON.stringify({
        station: {
            name: "Mr Rassy Radio",
            host: "Mr Rassy",
            creator: "Ian Rasmussen"
        },
        listenerIntent: inferListenerIntentHint(input.message),
        hostGoals: [
            "Ian loves when you share real music knowledge with style.",
            "Make Ian Rasmussen's taste legible instead of flattening it into a generic radio answer.",
            "Use history, artist facts, scene context, production details, and tonal comparisons when you know them confidently.",
            "If a fact feels shaky, pivot into sound, lineage, feel, and why the track works in this set.",
            "When you explain a fit, talk about the handoff or the pressure in the stack, not empty vibe language."
        ],
        listenerMessage: input.message,
        recentConversation,
        air: {
            mood: context.mood,
            timeOfDay: context.timeOfDay,
            dayOfWeek: context.dayOfWeek,
            dayPart: context.dayPart,
            emotionalWeather: context.emotionalWeather
        },
        setDesign: {
            emotionalGoal: setDesign.emotionalGoal,
            arcPressure: setDesign.arcPressure,
            authorship: setDesign.authorship
        },
        turnWindow,
        programming: buildProgrammingPayload(context.programming),
        currentSet: {
            nowPlaying: buildListenerTrackFrame(context.nowPlaying),
            nowPlayingKnowledge: buildPromptTrackKnowledge(context.nowPlaying, insightMap),
            queueDepth: context.queueDepth,
            lockedQueueSize: context.lockedQueueSize ?? 3,
            lockedQueuePreview: lockedQueuePreview.filter(Boolean),
            queuePreview,
            queueKnowledge: context.queuePreview.slice(0, 4).map((track) => ({
                track: buildListenerTrackFrame(track),
                knowledge: buildPromptTrackKnowledge(track, insightMap)
            }))
        },
        recentTrail: {
            tracks: context.recentTracks.slice(0, 5),
            artists: context.recentArtists.slice(0, 5)
        },
        requestLine: {
            active: context.requests.slice(0, 4),
            requestMatches: input.requestMatches.slice(0, 4),
            requestCandidates: (input.requestCandidates ?? []).slice(0, 6),
            matchKnowledge: input.requestMatches.slice(0, 3).map((track) => ({
                track: buildListenerTrackFrame(track),
                knowledge: buildPromptTrackKnowledge(track, insightMap)
            })),
            candidateKnowledge: (input.requestCandidates ?? []).slice(0, 3).map((track) => ({
                track: buildListenerTrackFrame(track),
                knowledge: buildPromptTrackKnowledge(track, insightMap)
            })),
            currentLine: (input.liveSnapshot?.requestLine ?? []).slice(0, 3).map((item) => ({
                summary: item.summary,
                status: item.status,
                intent: item.intent,
                response: item.response,
                tracks: item.tracks?.slice(0, 3)
            }))
        },
        crowd: {
            liked: context.feedbackTopLiked.slice(0, 4),
            disliked: context.feedbackTopDisliked.slice(0, 3)
        },
        liveSnapshot: input.liveSnapshot
            ? {
                djScript: input.liveSnapshot.djScript,
                djReason: input.liveSnapshot.djReason,
                boothHeadline: input.liveSnapshot.boothHeadline,
                boothIntro: input.liveSnapshot.boothIntro,
                lineupNote: input.liveSnapshot.lineupNote,
                contextNote: input.liveSnapshot.contextNote,
                listenForNote: input.liveSnapshot.listenForNote,
                nextMove: input.liveSnapshot.nextMove,
                programmingMode: input.liveSnapshot.programmingMode,
                programmingLabel: input.liveSnapshot.programmingLabel,
                programmingDescription: input.liveSnapshot.programmingDescription,
                tags: input.liveSnapshot.tags?.slice(0, 6)
            }
            : null,
        libraryDNA: {
            topArtists: context.libraryProfile.topArtists.slice(0, 4),
            topGenres: context.libraryProfile.topGenres.slice(0, 4),
            topDecades: context.libraryProfile.topDecades.slice(0, 3)
        },
        styleGuardrails: {
            avoidRecentDjOpeners: extractRecentDjOpeners(input.recentChat)
        }
    });
};
const buildBoothDossierPrompt = async (context, input) => {
    const setDesign = buildSetDesignBrief(context);
    const liveTracks = [
        context.nowPlaying,
        ...context.queuePreview.slice(0, 2)
    ]
        .map((track) => toInsightTrack(track))
        .filter(Boolean);
  const insightMap = await getTrackInsightMap(liveTracks);
  const turnWindow = buildLiveTurnBrief(context, insightMap);
  void syncTrackInsights(liveTracks, {
    embed: true,
    analyze: true,
    analysisLimit: 2,
    limit: Math.min(4, liveTracks.length)
  });
    const boothDraft = buildBoothEntityDraft(context, input, insightMap);
    return JSON.stringify({
        station: {
            name: "Mr Rassy Radio",
            host: "Mr Rassy"
        },
        goals: [
            "Give strong music intelligence, not generic vibes.",
            "Make the notes useful later when someone searches by artist, genre, or track.",
            "Show real DJ logic and real love for the records."
        ],
        qualityBar: boothDossierQualityBar,
        forbiddenPhrases: boothDossierForbiddenPhrases,
        outputBlueprint: boothDossierOutputBlueprint,
        mood: context.mood,
        timeOfDay: context.timeOfDay,
        dayOfWeek: context.dayOfWeek,
        dayPart: context.dayPart,
        emotionalWeather: context.emotionalWeather,
        turnWindow,
        setDesign: {
            handoffSource: setDesign.anchorTrack ? buildListenerTrackFrame(setDesign.anchorTrack) : null,
            targetEnergy: Number(setDesign.referenceEnergy.toFixed(2)),
            emotionalGoal: setDesign.emotionalGoal,
            arcPressure: setDesign.arcPressure,
            authorship: setDesign.authorship
        },
        libraryDNA: buildLibraryDna(context),
        programming: buildProgrammingPayload(input.programming ?? context.programming),
        longFormPlayback: (input.playbackPlans ?? []).map((plan) => ({
            trackId: plan.trackId,
            title: plan.title,
            artist: plan.artist,
            mode: plan.mode,
            segment: plan.segment,
            reason: plan.reason,
            transitionAfter: plan.transitionAfter,
            transitionStyle: plan.transitionStyle,
            transitionFeel: plan.transitionFeel,
            transitionDurationSeconds: plan.transitionDurationSeconds,
            transitionReason: plan.transitionReason
        })),
        liveTurn: [
            context.nowPlaying
                ? {
                    role: "now",
                    id: context.nowPlaying.id,
                    title: context.nowPlaying.title,
                    artist: context.nowPlaying.artist,
                    album: context.nowPlaying.album,
                    year: context.nowPlaying.year,
                    genres: context.nowPlaying.genres,
                    energy: context.nowPlaying.energy
                }
                : null,
            ...context.queuePreview.slice(0, 2).map((track, index) => ({
                role: index === 0 ? "next" : "later",
                id: track.id,
                title: track.title,
                artist: track.artist,
                album: track.album,
                year: track.year,
                genres: track.genres,
                energy: track.energy
            }))
        ].filter(Boolean),
        trackProfiles: buildBoothTrackProfiles(context, insightMap),
        requestLine: context.requests.slice(0, 2),
        crowd: {
            liked: context.feedbackTopLiked.slice(0, 2),
            disliked: context.feedbackTopDisliked.slice(0, 1)
        },
        onAirScript: input.djScript,
        onAirReason: input.djReason,
        boothDraft
    });
};
const buildBoothDossierRecoveryPrompt = async (context, input) => {
    const setDesign = buildSetDesignBrief(context);
    const liveTracks = [
        context.nowPlaying,
        ...context.queuePreview.slice(0, 2)
    ]
        .map((track) => toInsightTrack(track))
        .filter(Boolean);
    const insightMap = await getTrackInsightMap(liveTracks);
    const turnWindow = buildLiveTurnBrief(context, insightMap);
    const boothDraft = buildBoothEntityDraft(context, input, insightMap);
    return JSON.stringify({
        station: {
            name: "Mr Rassy Radio",
            host: "Mr Rassy"
        },
        goals: [
            "Rescue the note with concrete DJ knowledge instead of generic filler.",
            "Stay tied to the live handoff and the request pressure.",
            "Only keep details that are worth saving back into the library."
        ],
        qualityBar: boothDossierQualityBar,
        forbiddenPhrases: boothDossierForbiddenPhrases,
        outputBlueprint: boothDossierOutputBlueprint,
        mood: context.mood,
        timeOfDay: context.timeOfDay,
        dayPart: context.dayPart,
        emotionalWeather: context.emotionalWeather,
        turnWindow,
        setDesign: {
            handoffSource: setDesign.anchorTrack ? buildListenerTrackFrame(setDesign.anchorTrack) : null,
            targetEnergy: Number(setDesign.referenceEnergy.toFixed(2)),
            emotionalGoal: setDesign.emotionalGoal,
            arcPressure: setDesign.arcPressure
        },
        libraryDNA: buildLibraryDna(context),
        programming: buildProgrammingPayload(input.programming ?? context.programming),
        longFormPlayback: (input.playbackPlans ?? []).map((plan) => ({
            trackId: plan.trackId,
            title: plan.title,
            artist: plan.artist,
            mode: plan.mode,
            segment: plan.segment,
            reason: plan.reason,
            transitionAfter: plan.transitionAfter,
            transitionStyle: plan.transitionStyle,
            transitionFeel: plan.transitionFeel,
            transitionDurationSeconds: plan.transitionDurationSeconds,
            transitionReason: plan.transitionReason
        })),
        liveTurn: [
            context.nowPlaying
                ? {
                    role: "now",
                    id: context.nowPlaying.id,
                    title: context.nowPlaying.title,
                    artist: context.nowPlaying.artist,
                    album: context.nowPlaying.album,
                    year: context.nowPlaying.year,
                    genres: context.nowPlaying.genres
                }
                : null,
            ...context.queuePreview.slice(0, 2).map((track, index) => ({
                role: index === 0 ? "next" : "later",
                id: track.id,
                title: track.title,
                artist: track.artist,
                album: track.album,
                year: track.year,
                genres: track.genres
            }))
        ].filter(Boolean),
        trackProfiles: buildBoothTrackProfiles(context, insightMap),
        requestLine: context.requests.slice(0, 2),
        crowd: {
            liked: context.feedbackTopLiked.slice(0, 2),
            disliked: context.feedbackTopDisliked.slice(0, 1)
        },
        onAirScript: input.djScript,
        onAirReason: input.djReason,
        boothDraft
    });
};
const buildLongFormPrompt = (context, tracks) => JSON.stringify({
    station: {
        name: "Mr Rassy Radio",
        host: "Mr Rassy",
        creator: "Ian Rasmussen"
    },
    mood: context.mood,
    timeOfDay: context.timeOfDay,
    dayOfWeek: context.dayOfWeek,
    dayPart: context.dayPart,
    emotionalWeather: context.emotionalWeather,
    programming: buildProgrammingPayload(context.programming),
    nowPlaying: context.nowPlaying,
    transitionSystem: {
        spacing: "The station creates transition opportunities randomly every 3 to 10 songs.",
        instruction: "Use these as human DJ levers. Pick the feel and style only when the opportunity is listed."
    },
    transitionOpportunities: (context.transitionOpportunities ?? []).map((opportunity) => {
        const track = tracks[opportunity.trackSlot - 1] ?? tracks.find((item) => item.id === opportunity.trackId);
        const nextTrack = opportunity.nextTrackSlot
            ? tracks[opportunity.nextTrackSlot - 1]
            : tracks.find((item) => item.id === opportunity.nextTrackId);
        return {
            trackSlot: opportunity.trackSlot,
            trackId: opportunity.trackId,
            track: track ? buildTrackPayload(track) : null,
            nextTrackSlot: opportunity.nextTrackSlot,
            nextTrackId: opportunity.nextTrackId,
            nextTrack: nextTrack ? buildTrackPayload(nextTrack) : null
        };
    }),
    longTracks: tracks.map((track, index) => ({
        trackSlot: index + 1,
        id: track.id,
        isLongForm: typeof track.duration === "number" && track.duration > config.RADIO_LONG_TRACK_THRESHOLD_SECONDS,
        ...buildTrackPayload(track)
    }))
});
const extractJson = (content) => {
    const stripped = content
        .replace(/```json/gi, "```")
        .replace(/```/g, "")
        .trim();
    const start = stripped.indexOf("{");
    const end = stripped.lastIndexOf("}");
    if (start >= 0 && end > start) {
        return stripped.slice(start, end + 1);
    }
    return stripped;
};
const readStructuredMessageText = (value) => {
    if (typeof value === "string") {
        return value.trim();
    }
    if (Array.isArray(value)) {
        return value
            .map((part) => {
            if (typeof part === "string") {
                return part;
            }
            if (part && typeof part === "object") {
                if (typeof part.text === "string") {
                    return part.text;
                }
                if (typeof part.content === "string") {
                    return part.content;
                }
            }
            return "";
        })
            .join("")
            .trim();
    }
    if (value && typeof value === "object") {
        if (typeof value.text === "string") {
            return value.text.trim();
        }
        if (typeof value.content === "string") {
            return value.content.trim();
        }
    }
    return "";
};
const readStructuredAssistantFallback = (message) => {
    const reasoning = [message?.reasoning, message?.thinking]
        .map((value) => (typeof value === "string" ? value.trim() : ""))
        .find(Boolean);
    if (!reasoning) {
        return "";
    }
    const extracted = extractJson(reasoning);
    if (!extracted || (!extracted.startsWith("{") && !extracted.startsWith("["))) {
        return "";
    }
    return extracted;
};
const recoverPlainListenerReply = (content) => {
    const rawReply = typeof content === "string" ? content.replace(/\s+/g, " ").trim() : "";
    const metadataIndex = rawReply.search(/\s+\*\*(?:status|summary|track ids?|recommendation|matched track)\s*:/i);
    const reply = (metadataIndex >= 0 ? rawReply.slice(0, metadataIndex) : rawReply).trim();
    if (!reply || reply.startsWith("{") || reply.startsWith("[")) {
        return null;
    }
    return {
        reply: reply.slice(0, 900),
        recommendationStatus: "none",
        reason: "Recovered plain-text listener LLM reply.",
        trackIds: []
    };
};
const sleep = async (ms) => new Promise((resolve) => {
    setTimeout(resolve, ms);
});
const shouldRetryStatus = (status) => status === 408 || status === 425 || status === 429 || status >= 500;
const llmCircuit = createLlmCircuitRegistry({
    failureThreshold: config.DJ_LLM_FAILURE_THRESHOLD,
    cooldownMs: config.DJ_LLM_COOLDOWN_MS
});
const DECISION_CACHE_TTL_MS = 20_000;
const decisionInFlight = new Map();
const decisionResultCache = new Map();
const buildDecisionContextKey = (context, intent, playlistSize) => JSON.stringify({
    intent,
    playlistSize: playlistSize ?? null,
    mood: context.mood,
    dayPart: context.dayPart,
    emotionalWeather: context.emotionalWeather,
    nowPlaying: context.nowPlaying?.id ?? `${context.nowPlaying?.artist ?? ""}::${context.nowPlaying?.title ?? ""}`,
    lockedQueue: (context.lockedQueuePreview ?? context.queuePreview.slice(0, context.lockedQueueSize ?? 3))
        .slice(0, 4)
        .map((track) => track.id ?? `${track.artist ?? ""}::${track.title ?? ""}`),
    recentTracks: (context.recentTracks ?? [])
        .slice(0, 4)
        .map((track) => track.id ?? `${track.artist ?? ""}::${track.title ?? ""}`),
    requests: context.requests.slice(0, 4),
    programming: context.programming
        ? {
            mode: context.programming.mode,
            label: context.programming.label,
            specialType: context.programming.specialType,
            trackIds: context.programming.trackIds?.slice(0, 6) ?? []
        }
        : null
});
const pruneDecisionResultCache = () => {
    const now = Date.now();
    for (const [key, entry] of decisionResultCache.entries()) {
        if (entry.expiresAt <= now) {
            decisionResultCache.delete(key);
        }
    }
};
const readCachedDecisionResult = (key) => {
    pruneDecisionResultCache();
    const cached = decisionResultCache.get(key);
    return cached?.value ?? null;
};
const storeCachedDecisionResult = (key, value) => {
    if (!value) {
        return;
    }
    decisionResultCache.set(key, {
        value,
        expiresAt: Date.now() + DECISION_CACHE_TTL_MS
    });
};
const toLoggableError = (error) => {
    if (error instanceof Error) {
        return {
            name: error.name,
            message: error.message
        };
    }
    return error;
};
const looksLikeTemplateDecision = (decision) => {
    if (!decision || typeof decision !== "object") {
        return false;
    }
    const mood = typeof decision.mood === "string" ? decision.mood.trim().toLowerCase() : "";
    const talkScript = typeof decision.talkScript === "string" ? decision.talkScript.trim().toLowerCase() : "";
    const reason = typeof decision.reason === "string" ? decision.reason.trim().toLowerCase() : "";
    return mood === "mood" || talkScript === "text" || reason === "brief explanation";
};
const isActionableDecision = (decision, intent) => {
    if (!decision || typeof decision !== "object") {
        return false;
    }
    const hasTrackSlot = typeof decision.trackSlot === "number";
    const hasPlaylistSlots = Array.isArray(decision.playlistSlots) && decision.playlistSlots.length > 0;
    const hasTrackId = typeof decision.trackId === "string" && decision.trackId.trim().length > 0;
    const hasPlaylistIds = Array.isArray(decision.playlist) && decision.playlist.some((trackId) => typeof trackId === "string" && trackId.trim().length > 0);
    const hasSnippetSlot = typeof decision.snippetSlot === "number";
    const hasTalkScript = typeof decision.talkScript === "string" && decision.talkScript.trim().length > 0;
    if (intent === "playlist") {
        return hasPlaylistSlots || hasPlaylistIds || hasTrackSlot || hasTrackId;
    }
    if (intent === "track") {
        return hasTrackSlot || hasTrackId;
    }
    return hasTalkScript || hasSnippetSlot;
};
const callCheshireJson = async (systemPrompt, userPrompt, schema, temperature, options) => {
    if (!config.CHESHIRE_BASE_URL)
        return null;
    const label = options?.label ?? "unknown";
    if (llmCircuit.shouldSkip(label)) {
        return null;
    }
    const endpoint = `${config.CHESHIRE_BASE_URL.replace(/\/$/, "")}/v1/chat/completions`;
    const buildPayload = (jsonMode = "prompt") => ({
        model: options?.model ?? config.CHESHIRE_MODEL,
        messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt }
        ],
        temperature,
        ...(jsonMode === "json_object"
            ? {
                response_format: {
                    type: "json_object"
                }
            }
            : {}),
        ...(typeof options?.maxTokens === "number" ? { max_tokens: options.maxTokens } : {})
    });
    const timeoutMs = Math.max(1000, options?.timeoutMs ?? config.DJ_REQUEST_TIMEOUT_MS);
    const proxyTimeoutMs = Math.max(1000, timeoutMs - 750);
    const retries = Math.max(0, options?.retries ?? config.CHESHIRE_REQUEST_RETRIES);
    const retryDelayMs = Math.max(0, options?.retryDelayMs ?? config.CHESHIRE_RETRY_DELAY_MS);
    const laneName = options?.lane ?? "programming";
    const queueWaitMs = Math.max(0, options?.queueWaitMs ?? 1200);
    const jsonMode = options?.jsonMode === "json_object" ? "json_object" : "prompt";
    let lastFailure = null;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const response = await fetch(endpoint, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-cheshire-client": "radio-controller",
                    "x-cheshire-purpose": label,
                    "x-cheshire-lane": laneName,
                    "x-cheshire-priority": options?.priority ?? "normal",
                    "x-cheshire-queue-wait-ms": String(queueWaitMs),
                    "x-cheshire-timeout-ms": String(proxyTimeoutMs),
                    "x-cheshire-retries": "0",
                    "x-cheshire-retry-delay-ms": "0",
                    ...(config.CHESHIRE_API_KEY ? { Authorization: `Bearer ${config.CHESHIRE_API_KEY}` } : {})
                },
                body: JSON.stringify(buildPayload(jsonMode)),
                signal: controller.signal
            });
            if (!response.ok) {
                const bodySnippet = (await response.text()).slice(0, 240);
                if (response.status === 503 && bodySnippet.includes("cheshire_queue_busy")) {
                    logger.info({ label, lane: laneName, status: response.status }, "Cheshire proxy queue busy; skipping call");
                    return null;
                }
                lastFailure = {
                    bodySnippet,
                    message: "Cheshire request failed",
                    status: response.status
                };
                if (attempt < retries && shouldRetryStatus(response.status)) {
                    await sleep(retryDelayMs * (attempt + 1));
                    continue;
                }
                break;
            }
            const data = (await response.json());
            const message = data?.choices?.[0]?.message ?? {};
            const content = readStructuredMessageText(message.content) || readStructuredAssistantFallback(message);
            if (!content) {
                lastFailure = {
                    message: "Cheshire response was empty"
                };
                if (attempt < retries) {
                    await sleep(retryDelayMs * (attempt + 1));
                    continue;
                }
                break;
            }
            try {
                const extracted = extractJson(content);
                const parsedJson = JSON.parse(extracted);
                const parsed = schema.safeParse(parsedJson);
                if (parsed.success) {
                    llmCircuit.noteSuccess(label);
                    return parsed.data;
                }
                lastFailure = {
                    contentPreview: extracted.slice(0, 240),
                    issues: parsed.error.issues.slice(0, 4),
                    message: "Cheshire JSON schema validation failed"
                };
                if (attempt < retries) {
                    await sleep(retryDelayMs * (attempt + 1));
                    continue;
                }
                break;
            }
            catch (error) {
                if (label === "listener-reply") {
                    const recovered = recoverPlainListenerReply(content);
                    if (recovered) {
                        llmCircuit.noteSuccess(label);
                        logger.info({ label }, "Recovered plain-text listener LLM reply");
                        return recovered;
                    }
                }
                lastFailure = {
                    contentPreview: content.slice(0, 240),
                    error,
                    message: "Cheshire JSON parsing failed"
                };
                if (attempt < retries) {
                    await sleep(retryDelayMs * (attempt + 1));
                    continue;
                }
                break;
            }
        }
        catch (error) {
            lastFailure = {
                error,
                message: "Cheshire JSON call failed"
            };
            if (attempt < retries) {
                await sleep(retryDelayMs * (attempt + 1));
                continue;
            }
            break;
        }
        finally {
            clearTimeout(timeoutId);
        }
    }
    const circuit = llmCircuit.noteFailure(label);
    logger.warn({
        label,
        bodySnippet: lastFailure?.bodySnippet,
        contentPreview: lastFailure?.contentPreview,
        error: lastFailure?.error ? toLoggableError(lastFailure.error) : undefined,
        issues: lastFailure?.issues,
        status: lastFailure?.status,
        failures: circuit.failures,
        openedUntil: circuit.openedUntil || null
    }, lastFailure?.message ?? "Cheshire JSON call failed");
    return null;
};
const buildDecisionPromptPlan = (context, intent, playlistSize, mode = "full") => {
    const frame = buildDecisionFrame(context);
    const playlistWindow = intent === "playlist" ? getRequestedPlaylistDecisionSize(playlistSize) : 1;
    const isLongSet = intent === "playlist" && playlistWindow >= 6;
    const trackLimit = mode === "full"
        ? intent === "playlist"
            ? isLongSet
                ? Math.min(36, Math.max(22, playlistWindow * 3))
                : playlistWindow <= 2
                    ? 9
                    : 12
            : intent === "talk"
                ? 10
                : 12
        : intent === "playlist"
            ? isLongSet
                ? Math.min(20, Math.max(14, playlistWindow + 5))
                : playlistWindow <= 2
                    ? 6
                    : 7
            : intent === "talk"
                ? 6
                : 7;
    const snippetLimit = intent === "talk"
        ? 0
        : mode === "full"
            ? 1
            : 0;
    const sequenceLimit = intent === "playlist"
        ? mode === "full"
            ? isLongSet
                ? 2
                : playlistWindow <= 2
                    ? 2
                    : 3
            : 1
        : 0;
    const trackCandidates = buildDecisionTrackCandidates(context, trackLimit);
    const sequenceSketches = intent === "playlist"
        ? buildSequenceSketches(trackCandidates, context, frame, getPlaylistDecisionLength(playlistSize, trackCandidates.length)).slice(0, sequenceLimit)
        : [];
    const snippetCandidates = intent === "talk" ? [] : buildDecisionSnippetCandidates(context, snippetLimit);
    return {
        frame,
        trackCandidates,
        sequenceSketches,
        snippetCandidates
    };
};
const buildDecisionCallSpec = (intent, mode = "full") => {
    if (mode !== "full") {
        return intent === "playlist"
            ? {
                temperature: 0.46,
                options: {
                    maxTokens: 220,
                    timeoutMs: 52000,
                    label: "playlist-rescue",
                    retries: 0,
                    priority: "high",
                    queueWaitMs: 20000,
                    lane: "programming",
                    model: MR_RASSY_MODEL
                }
            }
            : intent === "talk"
                ? {
                    temperature: 0.64,
                    options: {
                        maxTokens: 240,
                        timeoutMs: 32000,
                        label: "talk-rescue",
                        retries: 0,
                        priority: "high",
                        queueWaitMs: 10000,
                        lane: "programming",
                        model: MR_RASSY_MODEL
                    }
                }
                : {
                    temperature: 0.44,
                    options: {
                        maxTokens: 240,
                        timeoutMs: 34000,
                        label: "track-rescue",
                        retries: 0,
                        priority: "high",
                        queueWaitMs: 10000,
                        lane: "programming",
                        model: MR_RASSY_MODEL
                    }
                };
    }
    return intent === "playlist"
        ? {
            temperature: 0.56,
            options: {
                maxTokens: 560,
                timeoutMs: 55000,
                label: "playlist",
                retries: 0,
                priority: "high",
                queueWaitMs: 10000,
                lane: "programming",
                model: MR_RASSY_MODEL
            }
        }
        : intent === "talk"
            ? {
                temperature: 0.72,
                options: {
                    maxTokens: 320,
                    timeoutMs: 40000,
                    label: "talk",
                    retries: 0,
                    priority: "normal",
                    queueWaitMs: 8000,
                    lane: "programming",
                    model: MR_RASSY_MODEL
                }
            }
            : {
                temperature: 0.52,
                options: {
                    maxTokens: 320,
                    timeoutMs: 40000,
                    label: "track",
                    retries: 0,
                    priority: "high",
                    queueWaitMs: 8000,
                    lane: "programming",
                    model: MR_RASSY_MODEL
                }
            };
};
const callCheshireDecision = async (context, intent, playlistSize) => {
    const cacheKey = buildDecisionContextKey(context, intent, playlistSize);
    const cached = readCachedDecisionResult(cacheKey);
    if (cached) {
        return cached;
    }
    const existingFlight = decisionInFlight.get(cacheKey);
    if (existingFlight) {
        return existingFlight;
    }
    const decisionPromise = (async () => {
        let plan = buildDecisionPromptPlan(context, intent, playlistSize, "full");
        let decisionInsightTracks = plan.trackCandidates
            .map(({ track }) => toInsightTrack(track))
            .filter(Boolean);
        let decisionInsightMap = await getTrackInsightMap(decisionInsightTracks);
        void syncTrackInsights(decisionInsightTracks.slice(0, Math.min(6, decisionInsightTracks.length)), {
            embed: true,
            analyze: true,
            analysisLimit: 2,
            limit: Math.min(6, decisionInsightTracks.length)
        });
        let callSpec = buildDecisionCallSpec(intent, "full");
        let rawDecision = await callCheshireJson(boothSystemPrompt, buildUserPrompt(context, intent, playlistSize, {
            tracks: plan.trackCandidates,
            snippets: plan.snippetCandidates,
            sequenceSketches: plan.sequenceSketches
        }, plan.frame, "full", decisionInsightMap), decisionSchema, callSpec.temperature, callSpec.options);
        if (rawDecision && (looksLikeTemplateDecision(rawDecision) || !isActionableDecision(rawDecision, intent))) {
            logger.warn({ intent, rawDecision }, "Discarding non-actionable Cheshire decision");
            rawDecision = null;
        }
        if (!rawDecision) {
            logger.info({ intent }, "Retrying Cheshire decision with compact deck");
            plan = buildDecisionPromptPlan(context, intent, playlistSize, "rescue");
            decisionInsightTracks = plan.trackCandidates
                .map(({ track }) => toInsightTrack(track))
                .filter(Boolean);
            decisionInsightMap = await getTrackInsightMap(decisionInsightTracks);
            void syncTrackInsights(decisionInsightTracks.slice(0, Math.min(4, decisionInsightTracks.length)), {
                embed: true,
                analyze: true,
                analysisLimit: 1,
                limit: Math.min(4, decisionInsightTracks.length)
            });
            callSpec = buildDecisionCallSpec(intent, "rescue");
            rawDecision = await callCheshireJson(boothRescueSystemPrompt, buildUserPrompt(context, intent, playlistSize, {
                tracks: plan.trackCandidates,
                snippets: plan.snippetCandidates,
                sequenceSketches: plan.sequenceSketches
            }, plan.frame, "rescue", decisionInsightMap), decisionSchema, callSpec.temperature, callSpec.options);
            if (rawDecision && (looksLikeTemplateDecision(rawDecision) || !isActionableDecision(rawDecision, intent))) {
                logger.warn({ intent, rawDecision }, "Discarding non-actionable Cheshire rescue decision");
                rawDecision = null;
            }
        }
        if (!rawDecision) {
            return null;
        }
        const trackCandidates = plan.trackCandidates;
        const snippetCandidates = plan.snippetCandidates;
        const sequenceSketches = plan.sequenceSketches;
        const frame = plan.frame;
        const trackIdFromSlot = typeof rawDecision.trackSlot === "number"
            ? trackCandidates.find((candidate) => candidate.slot === rawDecision.trackSlot)?.track.id
            : undefined;
        const playlistFromSlots = Array.isArray(rawDecision.playlistSlots) && rawDecision.playlistSlots.length > 0
            ? rawDecision.playlistSlots
                .map((slot) => trackCandidates.find((candidate) => candidate.slot === slot)?.track.id)
                .filter((trackId) => typeof trackId === "string")
            : [];
        const fallbackTrackId = typeof rawDecision.trackId === "string" &&
            trackCandidates.some((candidate) => candidate.track.id === rawDecision.trackId)
            ? rawDecision.trackId
            : undefined;
        const fallbackPlaylist = Array.isArray(rawDecision.playlist) && rawDecision.playlist.length > 0
            ? rawDecision.playlist.filter((trackId) => trackCandidates.some((candidate) => candidate.track.id === trackId))
            : [];
        const refinedPlaylist = intent === "playlist"
            ? refineDecisionPlaylistIds(playlistFromSlots.length > 0 ? playlistFromSlots : fallbackPlaylist, trackCandidates, context, frame, playlistSize, sequenceSketches)
            : [];
        const snippetIdFromSlot = typeof rawDecision.snippetSlot === "number"
            ? snippetCandidates.find((candidate) => candidate.slot === rawDecision.snippetSlot)?.snippet.id
            : undefined;
        const fallbackSnippetId = typeof rawDecision.snippetId === "string" &&
            snippetCandidates.some((candidate) => candidate.snippet.id === rawDecision.snippetId)
            ? rawDecision.snippetId
            : undefined;
        const resolvedDecision = {
            ...(refinedPlaylist.length > 0
                ? { playlist: Array.from(new Set(refinedPlaylist)) }
                : playlistFromSlots.length > 0
                    ? { playlist: Array.from(new Set(playlistFromSlots)) }
                    : fallbackPlaylist.length > 0
                        ? { playlist: Array.from(new Set(fallbackPlaylist)) }
                        : {}),
            ...((trackIdFromSlot ?? fallbackTrackId) ? { trackId: trackIdFromSlot ?? fallbackTrackId } : {}),
            ...(rawDecision.mood ? { mood: rawDecision.mood } : {}),
            ...(rawDecision.talkScript ? { talkScript: rawDecision.talkScript } : {}),
            ...((snippetIdFromSlot ?? fallbackSnippetId)
                ? { snippetId: snippetIdFromSlot ?? fallbackSnippetId }
                : {}),
            ...(rawDecision.reason ? { reason: rawDecision.reason } : {})
        };
        storeCachedDecisionResult(cacheKey, resolvedDecision);
        return resolvedDecision;
    })()
        .finally(() => {
        decisionInFlight.delete(cacheKey);
    });
    decisionInFlight.set(cacheKey, decisionPromise);
    return decisionPromise;
};
const callCheshireListenerReply = async (context, input) => {
    return callCheshireJson(listenerSystemPrompt, await buildListenerPrompt(context, input), listenerReplySchema, 0.84, {
        maxTokens: 220,
        timeoutMs: 45000,
        label: "listener-reply",
        retries: 2,
        retryDelayMs: 350,
        priority: "high",
        queueWaitMs: 30000,
        lane: "listener",
        model: MR_RASSY_MODEL,
        jsonMode: "json_object"
    });
};
const callCheshireLongFormPlans = async (context, tracks) => {
    const hasLongTracks = tracks.some((track) => typeof track.duration === "number" &&
        track.duration > config.RADIO_LONG_TRACK_THRESHOLD_SECONDS);
    const hasTransitionOpportunities = Array.isArray(context.transitionOpportunities) && context.transitionOpportunities.length > 0;
    if (!hasLongTracks && !hasTransitionOpportunities)
        return [];
    const rawPlans = await callCheshireJson(longFormSystemPrompt, buildLongFormPrompt(context, tracks), longFormPlanSchema, 0.48, {
        maxTokens: 360,
        timeoutMs: 35000,
        label: "playback-transition-plan",
        retries: 0,
        priority: "low",
        queueWaitMs: 8000,
        lane: "programming",
        model: MR_RASSY_MODEL
    });
    if (!rawPlans)
        return [];
    const resolvedPlans = [];
    const transitionOpportunityTrackIds = new Set((context.transitionOpportunities ?? []).map((opportunity) => opportunity.trackId));
    for (const plan of rawPlans.plans) {
        const trackId = typeof plan.trackSlot === "number"
            ? tracks[plan.trackSlot - 1]?.id
            : typeof plan.trackId === "string"
                ? tracks.find((track) => track.id === plan.trackId)?.id
                : undefined;
        if (!trackId)
            continue;
        const track = tracks.find((item) => item.id === trackId);
        const isLongTrack = typeof track?.duration === "number" && track.duration > config.RADIO_LONG_TRACK_THRESHOLD_SECONDS;
        const transitionAfter = Boolean(plan.transitionAfter && transitionOpportunityTrackIds.has(trackId));
        if (!isLongTrack && !transitionAfter)
            continue;
        const nextOpportunity = (context.transitionOpportunities ?? []).find((opportunity) => opportunity.trackId === trackId);
        resolvedPlans.push({
            trackId,
            ...(track?.title ? { title: track.title } : {}),
            ...(track?.artist ? { artist: track.artist } : {}),
            ...(typeof track?.duration === "number" ? { duration: track.duration } : {}),
            mode: plan.mode ?? "full",
            ...(plan.segment ? { segment: plan.segment } : {}),
            ...(plan.reason ? { reason: plan.reason } : {}),
            ...(transitionAfter ? { transitionAfter: true } : {}),
            ...(transitionAfter && plan.transitionStyle ? { transitionStyle: plan.transitionStyle } : {}),
            ...(transitionAfter && plan.transitionFeel ? { transitionFeel: plan.transitionFeel } : {}),
            ...(transitionAfter && typeof plan.transitionDurationSeconds === "number"
                ? { transitionDurationSeconds: plan.transitionDurationSeconds }
                : {}),
            ...(transitionAfter && plan.transitionReason ? { transitionReason: plan.transitionReason } : {}),
            ...(transitionAfter && nextOpportunity?.nextTrackId ? { transitionNextTrackId: nextOpportunity.nextTrackId } : {})
        });
    }
    return resolvedPlans;
};
export const buildBoothDossier = async (context, input) => {
    const generated = await callCheshireJson(boothDossierSystemPrompt, await buildBoothDossierPrompt(context, input), boothDossierSchema, 0.52, {
        maxTokens: 720,
        timeoutMs: 45000,
        label: "booth-dossier",
        retries: 1,
        retryDelayMs: 250,
        priority: "low",
        queueWaitMs: 24000,
        lane: "notes",
        model: MR_RASSY_MODEL,
        jsonMode: "json_object"
    });
    if (generated && isBoothDossierGrounded(context, generated)) {
        return generated;
    }
    const recovered = await callCheshireJson(boothDossierRecoverySystemPrompt, await buildBoothDossierRecoveryPrompt(context, input), boothDossierSchema, 0.44, {
        maxTokens: 560,
        timeoutMs: 30000,
        label: "booth-dossier-recovery",
        retries: 2,
        retryDelayMs: 300,
        priority: "low",
        queueWaitMs: 30000,
        lane: "notes",
        model: MR_RASSY_MODEL,
        jsonMode: "json_object"
    });
    if (!recovered)
        return null;
    return isBoothDossierGrounded(context, recovered) ? recovered : null;
};
export class MrRassyLiveDJ {
    id = "mr-rassy-live-dj";
    cachedTalk = null;
    cachedDecision = null;
    async getPlaylist(context, count) {
        try {
            const decision = await callCheshireDecision(context, "playlist", count);
            this.cachedDecision = decision ?? null;
            return decision;
        }
        catch {
            return null;
        }
    }
    async getNextTrack(context) {
        try {
            const decision = await callCheshireDecision(context, "track");
            this.cachedDecision = decision ?? null;
            return decision;
        }
        catch {
            return null;
        }
    }
    async shouldTalk(context) {
        if (this.cachedTalk)
            return true;
        const decision = await callCheshireDecision(context, "talk");
        if (decision?.talkScript) {
            this.cachedTalk = decision.talkScript;
            return true;
        }
        return false;
    }
    async getTalkScript(context) {
        if (this.cachedTalk) {
            const script = this.cachedTalk;
            this.cachedTalk = null;
            return script;
        }
        const decision = await callCheshireDecision(context, "talk");
        return decision?.talkScript ?? null;
    }
    async pickSnippet(context) {
        if (this.cachedDecision?.snippetId)
            return this.cachedDecision.snippetId;
        return null;
    }
    async planTrackPlayback(context, tracks) {
        try {
            return await callCheshireLongFormPlans(context, tracks);
        }
        catch {
            return null;
        }
    }
    async replyToListener(context, input) {
        try {
            return await callCheshireListenerReply(context, input);
        }
        catch (error) {
            logger.warn({ error }, "Mr Rassy listener LLM reply failed; using local fallback");
            return null;
        }
    }
}
