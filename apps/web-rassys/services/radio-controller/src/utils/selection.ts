// @ts-nocheck
const moodEnergy = {
    "late-night": 0.2,
    focus: 0.34,
    dreamy: 0.28,
    daydream: 0.52,
    morning: 0.56,
    flow: 0.58,
    silly: 0.84,
    party: 0.9,
    sunburst: 0.72,
    ambient: 0.24,
    tender: 0.32,
    warm: 0.48,
    bright: 0.68,
    nocturnal: 0.22,
    electric: 0.82,
    golden: 0.62,
    velvet: 0.3
};
const dayPartProfiles = {
    "deep night": {
        energy: 0.2,
        tokens: ["night", "midnight", "afterhours", "drift", "ambient", "dub", "shadow", "hush"]
    },
    "blue hour": {
        energy: 0.28,
        tokens: ["dawn", "mist", "soft", "glow", "wake", "slow", "tender", "bloom"]
    },
    daybreak: {
        energy: 0.44,
        tokens: ["morning", "sunrise", "lift", "breeze", "open", "clear", "light"]
    },
    "late morning": {
        energy: 0.58,
        tokens: ["stride", "bright", "day", "warm", "steady", "clear", "spark"]
    },
    midday: {
        energy: 0.64,
        tokens: ["sun", "drive", "bright", "crisp", "open", "pulse", "forward"]
    },
    "golden afternoon": {
        energy: 0.68,
        tokens: ["gold", "groove", "roll", "heat", "cruise", "summer", "glow"]
    },
    sunset: {
        energy: 0.54,
        tokens: ["warm", "soul", "cruise", "honey", "heart", "glow", "ease"]
    },
    "after-hours": {
        energy: 0.34,
        tokens: ["neon", "velvet", "smoke", "late", "pulse", "club", "afterhours"]
    }
};
const dayOfWeekProfiles = {
    monday: {
        energyAdjust: -0.05,
        tokens: ["focus", "steady", "clean", "line", "engine", "intent"]
    },
    tuesday: {
        energyAdjust: -0.02,
        tokens: ["motion", "glide", "steady", "drive", "shape"]
    },
    wednesday: {
        energyAdjust: 0,
        tokens: ["groove", "flow", "arc", "middle", "lift"]
    },
    thursday: {
        energyAdjust: 0.04,
        tokens: ["heat", "build", "charge", "momentum", "night"]
    },
    friday: {
        energyAdjust: 0.09,
        tokens: ["party", "dance", "club", "anthem", "heat", "shine"]
    },
    saturday: {
        energyAdjust: 0.1,
        tokens: ["dance", "sweat", "joy", "club", "festival", "pulse"]
    },
    sunday: {
        energyAdjust: -0.08,
        tokens: ["home", "gentle", "tender", "soul", "acoustic", "ease"]
    }
};
const semanticBundles = [
    { match: /\bnight|midnight|moon|after\s*hours|nocturnal\b/i, tokens: ["night", "midnight", "velvet", "shadow"] },
    { match: /\bmorning|sunrise|daybreak|dawn\b/i, tokens: ["morning", "sunrise", "breeze", "clear"], energy: 0.5 },
    { match: /\bafternoon|golden|sunlit|summer\b/i, tokens: ["gold", "groove", "summer", "warm"], energy: 0.64 },
    { match: /\bparty|club|dance|anthem\b/i, tokens: ["party", "club", "dance", "pulse"], energy: 0.86 },
    { match: /\bdream|dreamy|float|drift|haze\b/i, tokens: ["dream", "drift", "haze", "soft"], energy: 0.3 },
    { match: /\btender|gentle|soft|ache|heart\b/i, tokens: ["tender", "gentle", "heart", "soft"], energy: 0.34 },
    { match: /\bneon|electric|voltage|static|spark\b/i, tokens: ["neon", "electric", "voltage", "spark"], energy: 0.74 },
    { match: /\bglow|warm|honey|velvet\b/i, tokens: ["glow", "warm", "velvet", "honey"], energy: 0.46 },
    { match: /\bfocus|study|deep|heads?-down\b/i, tokens: ["focus", "steady", "deep", "line"], energy: 0.36 }
];
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const TRACK_TITLE_DECORATION_PATTERN = /[\[(][^\])]*(?:remaster(?:ed)?|mono|stereo|edit|mix|version|radio|single|album|deluxe|bonus|clean|explicit)[^\])]*[\])]/gi;
const TRACK_TITLE_TAIL_PATTERN = /\s+-\s+(?:\d{4}\s+)?(?:remaster(?:ed)?|mono|stereo|edit|mix|version|radio edit|single version|album version|clean|explicit)\b.*$/gi;
const normalizeTrackIdentityText = (value) => (value ?? "")
    .toString()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const buildTrackCooldownSignature = (track) => {
    const normalizedTitle = normalizeTrackIdentityText((track?.title ?? "")
        .replace(TRACK_TITLE_DECORATION_PATTERN, " ")
        .replace(TRACK_TITLE_TAIL_PATTERN, " "));
    const normalizedArtist = normalizeTrackIdentityText(track?.artist ?? "");
    if (!normalizedTitle || !normalizedArtist)
        return "";
    return `${normalizedArtist}::${normalizedTitle}`;
};
const tokenize = (value) => (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length >= 3);
const addTokenWeight = (weights, token, weight) => {
    if (!token)
        return;
    weights.set(token, (weights.get(token) ?? 0) + weight);
};
const normalizeFeedback = (score) => {
    if (!Number.isFinite(score) || score === 0)
        return 0;
    return Math.tanh(score / 5);
};
const buildMoodTarget = (context) => {
    const moodTokens = tokenize(context.mood);
    const matchedMoodValues = moodTokens
        .map((token) => moodEnergy[token])
        .filter((value) => typeof value === "number");
    const moodTarget = matchedMoodValues.length > 0
        ? matchedMoodValues.reduce((total, value) => total + value, 0) / matchedMoodValues.length
        : 0.52;
    const dayPartProfile = context.dayPart ? dayPartProfiles[context.dayPart.toLowerCase()] : undefined;
    const dayProfile = context.dayOfWeek ? dayOfWeekProfiles[context.dayOfWeek.toLowerCase()] : undefined;
    let target = moodTarget;
    if (dayPartProfile) {
        target = target * 0.58 + dayPartProfile.energy * 0.42;
    }
    if (dayProfile) {
        target += dayProfile.energyAdjust;
    }
    for (const bundle of semanticBundles) {
        if (bundle.energy === undefined)
            continue;
        if (bundle.match.test(context.mood) || bundle.match.test(context.emotionalWeather ?? "")) {
            target = target * 0.7 + bundle.energy * 0.3;
        }
    }
    return clamp(target, 0.14, 0.92);
};
const buildContextTokenWeights = (context) => {
    const weights = new Map();
    const addTokens = (value, weight) => {
        for (const token of tokenize(value)) {
            addTokenWeight(weights, token, weight);
        }
    };
    addTokens(context.mood, 0.14);
    addTokens(context.emotionalWeather, 0.12);
    const dayPartProfile = context.dayPart ? dayPartProfiles[context.dayPart.toLowerCase()] : undefined;
    for (const token of dayPartProfile?.tokens ?? []) {
        addTokenWeight(weights, token, 0.18);
    }
    const dayProfile = context.dayOfWeek ? dayOfWeekProfiles[context.dayOfWeek.toLowerCase()] : undefined;
    for (const token of dayProfile?.tokens ?? []) {
        addTokenWeight(weights, token, 0.16);
    }
    const compositeText = [context.mood, context.dayPart, context.emotionalWeather, context.dayOfWeek]
        .filter(Boolean)
        .join(" ");
    for (const bundle of semanticBundles) {
        if (bundle.match.test(compositeText)) {
            for (const token of bundle.tokens) {
                addTokenWeight(weights, token, 0.18);
            }
        }
    }
    return weights;
};
const buildTrackTokenSet = (track) => new Set([
    ...track.moodTags,
    ...(track.genres ?? []),
    track.title,
    track.artist,
    track.album
]
    .flatMap((value) => tokenize(value))
    .filter(Boolean));
export const scoreTrack = (track, context, feedbackScores, feedbackWeight = 0.2) => {
    const targetEnergy = buildMoodTarget(context);
    const energyScore = 1 - Math.abs(track.energy - targetEnergy) * 1.08;
    const tokenWeights = buildContextTokenWeights(context);
    const trackTokens = buildTrackTokenSet(track);
    let tokenScore = 0;
    for (const token of trackTokens) {
        tokenScore += tokenWeights.get(token) ?? 0;
    }
    tokenScore = Math.min(tokenScore, 0.9);
    const normalizedMood = context.mood.toLowerCase();
    const moodBoost = track.moodTags.some((tag) => normalizedMood.includes(tag.toLowerCase())) ? 0.24 : 0;
    const voteScore = normalizeFeedback(feedbackScores?.get(track.id) ?? 0) * feedbackWeight;
    return energyScore + tokenScore + moodBoost + voteScore;
};
export const rankTracks = (tracks, context) => {
    const candidates = tracks.filter((track) => {
        if (context.bannedTrackIds.has(track.id))
            return false;
        if (context.bannedArtists.has(track.artist.toLowerCase()))
            return false;
        if (context.recentTrackIds.has(track.id))
            return false;
        if (context.recentTrackSignatures?.has(buildTrackCooldownSignature(track)))
            return false;
        if (context.recentArtists.has(track.artist.toLowerCase()))
            return false;
        return true;
    });
    const pool = candidates.length > 0 ? candidates : tracks;
    const scored = pool.map((track) => ({
        track,
        score: scoreTrack(track, context, context.feedbackScores, context.feedbackWeight) + Math.random() * 0.12
    }));
    scored.sort((a, b) => b.score - a.score);
    return scored;
};
export const pickTrack = (tracks, context) => {
    const scored = rankTracks(tracks, context);
    return scored[0]?.track;
};
export const sanitizeRequest = (value) => {
    const trimmed = value.trim().slice(0, 120);
    const safe = trimmed.replace(/[^\w\s\-.'",!?()&:]/g, "");
    return safe;
};
