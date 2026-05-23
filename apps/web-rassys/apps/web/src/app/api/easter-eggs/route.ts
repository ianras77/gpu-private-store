import { NextResponse } from "next/server";
import { z } from "zod";
import {
  fetchListeningRoom,
  fetchPhotoShelf,
  fetchPodcastShow,
} from "../../../lib/media-controller";
import { requestCheshireJson } from "../../../lib/cheshire-client";
import { fetchRadio } from "../../../lib/radio-api";
import { rateLimit } from "../../../lib/rate-limit";
import { getClientIp } from "../../../lib/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const siteTargets = [
  {
    href: "/radio",
    cta: "Enter the booth",
    hint: "The loudest room is still the radio tower.",
  },
  {
    href: "/radio#booth-chat",
    cta: "Talk to Mr Rassy",
    hint: "The live line is strongest when the booth is already humming.",
  },
  {
    href: "/radio#live-booth-notebook",
    cta: "Read the live notebook",
    hint: "The notebook sits right beside the set while the room is still warm.",
  },
  {
    href: "/radio/notes",
    cta: "Open the notes archive",
    hint: "The note trail lives wherever Mr Rassy bothered to remember the night.",
  },
  {
    href: "/listening-room",
    cta: "Browse the shelves",
    hint: "The quieter shelf is where the records sit without the station wrapping around them.",
  },
  {
    href: "/photos",
    cta: "Open the family shelf",
    hint: "The warmest room on the site still lives closest to home.",
  },
  {
    href: "/real-life-bedtime-stories",
    cta: "Find the quieter room",
    hint: "One room exists for softer voices and slower breathing.",
  },
  {
    href: "/mc",
    cta: "Visit the observatory",
    hint: "The sky room still keeps a little weirdness in the architecture.",
  },
  {
    href: "/dungeon-master",
    cta: "Open the control room",
    hint: "The tabletop room is where Ian lets the site reason differently.",
  },
  {
    href: "/#thoughts",
    cta: "Follow the thought trail",
    hint: "The slower signal is still hanging off the writing shelf.",
  },
  {
    href: "/#troupe",
    cta: "Look toward the observatory",
    hint: "The stranger little sky room is still tucked into the homepage.",
  },
  {
    href: "/#about",
    cta: "Read the foundation",
    hint: "The clearest explanation of the whole thing still lives on the homepage.",
  },
] as const;

const targetByHref = new Map<string, (typeof siteTargets)[number]>(
  siteTargets.map((target) => [target.href, target]),
);
const allowedTargetHrefs = new Set<string>(siteTargets.map((target) => target.href));

const responseSchema = z.object({
  badge: z.string().min(2).max(28),
  title: z.string().min(3).max(60),
  body: z.string().min(12).max(180),
  cta: z.string().min(2).max(28),
  hint: z.string().min(8).max(120),
  href: z.string().min(1).max(120),
  sigil: z.string().min(2).max(24).regex(/^[a-z][a-z\s-]{1,23}$/i),
});

const triggerSchema = z.enum(["route", "interval", "manual", "secret-word"]);

type EasterEggRequestContext = {
  path: string;
  trigger: z.infer<typeof triggerSchema>;
  trail: string[];
};

type RouteSignal = {
  surface: string;
  summary: string;
  preferredTargets: string[];
  details?: Record<string, unknown> | null;
};

type CurioPayload = z.infer<typeof responseSchema>;

const fallbackCurios = [
  {
    href: "/radio#booth-chat",
    badge: "Booth Static",
    title: "The headphones know a secret.",
    body: "Mr Rassy swears the booth gets better the moment someone uses the live line like it matters.",
    sigil: "vinyl spark",
  },
  {
    href: "/radio#live-booth-notebook",
    badge: "Notebook Heat",
    title: "A margin just woke up.",
    body: "The booth notebook is still the quickest way to catch the room while it is changing shape.",
    sigil: "paper ember",
  },
  {
    href: "/listening-room",
    badge: "Shelf Murmur",
    title: "The quieter room is humming.",
    body: "Some records are better when the station stops talking and Ian’s shelves get to speak for themselves.",
    sigil: "sleeve glow",
  },
  {
    href: "/photos",
    badge: "Home Trace",
    title: "A warmer room blinked.",
    body: "The family shelf is still the part of the site most likely to make the rest of it feel real.",
    sigil: "gold paw",
  },
  {
    href: "/#troupe",
    badge: "Sky Glass",
    title: "Something blinked over mc_troupe.",
    body: "A tiny observatory rumor says the clouds keep score when nobody is looking.",
    sigil: "glass star",
  },
  {
    href: "/#thoughts",
    badge: "Thought Echo",
    title: "A note is warming its edges.",
    body: "Somewhere on the site, a half-finished idea is pretending it is already a finished jewel.",
    sigil: "ink ember",
  },
] as const;

const readString = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

const normalizePath = (value?: string | null) => {
  const trimmed = value?.trim();
  if (!trimmed) return "/";

  const withoutOrigin = trimmed.replace(/^https?:\/\/[^/]+/i, "");
  const pathOnly = withoutOrigin.split("#")[0]?.split("?")[0]?.trim() || "/";
  if (!pathOnly.startsWith("/")) return "/";
  return pathOnly.slice(0, 120) || "/";
};

const hashString = (value: string) => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
};

const readRequestContext = (request: Request): EasterEggRequestContext => {
  const url = new URL(request.url);
  const parsedTrigger = triggerSchema.safeParse(url.searchParams.get("trigger"));

  return {
    path: normalizePath(url.searchParams.get("path")),
    trigger: parsedTrigger.success ? parsedTrigger.data : "route",
    trail: url.searchParams
      .getAll("trail")
      .map((item) => item.replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .slice(0, 6),
  };
};

const selectTargetPool = (preferredTargets: string[]) => {
  const pool = preferredTargets
    .map((href) => targetByHref.get(href))
    .filter((target): target is (typeof siteTargets)[number] => Boolean(target));

  return pool.length > 0 ? pool : [...siteTargets];
};

const coerceTarget = (
  href: string | null | undefined,
  preferredTargets: string[],
  seed: string,
) => {
  if (href && allowedTargetHrefs.has(href)) {
    return targetByHref.get(href) ?? siteTargets[0];
  }

  const pool = selectTargetPool(preferredTargets);
  return pool[hashString(seed) % pool.length] ?? siteTargets[0];
};

const summarizeTrack = (track: {
  title?: string;
  artist?: string;
  album?: string;
  year?: number;
}) => ({
  title: readString(track.title),
  artist: readString(track.artist),
  album: readString(track.album),
  year: typeof track.year === "number" ? track.year : null,
});

const summarizeRadioNote = (note: Record<string, unknown>) => ({
  title: readString(note.title),
  excerpt: readString(note.excerpt),
});

const buildSiteContext = async () => {
  const [statusResult, nowResult, hearsResult, notesResult] =
    await Promise.allSettled([
      fetchRadio<Record<string, unknown>>("/status"),
      fetchRadio<Record<string, unknown>>("/public/now"),
      fetchRadio<Record<string, unknown>>("/public/hears"),
      fetchRadio<{ notes?: Array<Record<string, unknown>> }>(
        "/public/notes?limit=1",
      ),
    ]);

  const status =
    statusResult.status === "fulfilled" && statusResult.value
      ? statusResult.value
      : null;
  const now =
    nowResult.status === "fulfilled" && nowResult.value ? nowResult.value : null;
  const hears =
    hearsResult.status === "fulfilled" && hearsResult.value
      ? hearsResult.value
      : null;
  const latestNote =
    notesResult.status === "fulfilled" &&
    Array.isArray(notesResult.value?.notes) &&
    notesResult.value.notes.length > 0
      ? notesResult.value.notes[0]
      : null;

  return {
    mood:
      typeof status?.mood === "string" && status.mood.trim()
        ? status.mood
        : null,
    requestLineDepth:
      typeof status?.requestLineDepth === "number"
        ? status.requestLineDepth
        : null,
    queueDepth:
      typeof status?.queueDepth === "number" ? status.queueDepth : null,
    libraryTracks:
      typeof status?.libraryTracks === "number" ? status.libraryTracks : null,
    llmActive:
      Boolean(
        status &&
          typeof status === "object" &&
          "llmDirector" in status &&
          (status.llmDirector as Record<string, unknown> | null)?.active === true,
      ) || false,
    nowPlaying:
      now && typeof now === "object"
        ? {
            title:
              typeof now.title === "string" && now.title.trim() ? now.title : null,
            artist:
              typeof now.artist === "string" && now.artist.trim()
                ? now.artist
                : null,
            album:
              typeof now.album === "string" && now.album.trim() ? now.album : null,
          }
        : null,
    hears:
      hears && typeof hears === "object"
        ? {
            headline:
              typeof hears.headline === "string" && hears.headline.trim()
                ? hears.headline
                : null,
            intro:
              typeof hears.intro === "string" && hears.intro.trim()
                ? hears.intro
                : null,
          }
        : null,
    latestNote:
      latestNote && typeof latestNote === "object"
        ? {
            title:
              typeof latestNote.title === "string" && latestNote.title.trim()
                ? latestNote.title
                : null,
            excerpt:
              typeof latestNote.excerpt === "string" && latestNote.excerpt.trim()
                ? latestNote.excerpt
                : null,
          }
        : null,
  };
};

const buildRouteSignal = async (path: string): Promise<RouteSignal> => {
  if (path.startsWith("/radio/notes")) {
    const notesPayload = await fetchRadio<{ notes?: Array<Record<string, unknown>> }>(
      "/public/notes?limit=3",
    ).catch(() => null);

    return {
      surface: "booth notebook",
      summary:
        "The visitor is already inside the notes archive. Reward the page they are on with a sharper clue or a nearby booth detail before sending them far away.",
      preferredTargets: [
        "/radio/notes",
        "/radio#live-booth-notebook",
        "/radio#booth-chat",
      ],
      details: {
        recentNotes: Array.isArray(notesPayload?.notes)
          ? notesPayload.notes.slice(0, 3).map((note) => summarizeRadioNote(note))
          : [],
      },
    };
  }

  if (path.startsWith("/radio")) {
    const [featuredPayload, notesPayload] = await Promise.all([
      fetchRadio<{ items?: Array<Record<string, unknown>> }>("/public/featured").catch(
        () => null,
      ),
      fetchRadio<{ notes?: Array<Record<string, unknown>> }>(
        "/public/notes?limit=3",
      ).catch(() => null),
    ]);

    return {
      surface: "radio booth",
      summary:
        "The visitor is already in the live radio tower. Keep the whisper close to the booth, the line, or the notebook before bouncing them to another room.",
      preferredTargets: [
        "/radio#booth-chat",
        "/radio#live-booth-notebook",
        "/radio/notes",
        "/listening-room",
      ],
      details: {
        featuredTracks: Array.isArray(featuredPayload?.items)
          ? featuredPayload.items.slice(0, 4).map((track) => summarizeTrack(track))
          : [],
        recentNotes: Array.isArray(notesPayload?.notes)
          ? notesPayload.notes.slice(0, 3).map((note) => summarizeRadioNote(note))
          : [],
      },
    };
  }

  if (path.startsWith("/listening-room")) {
    const listeningRoom = await fetchListeningRoom({ limit: 8 }).catch(() => null);

    return {
      surface: "listening room",
      summary:
        "The visitor is already on the shelves. Reward the slower music page with a whisper about Ian’s collection, the radio tie-in, or the difference between booth time and shelf time.",
      preferredTargets: ["/listening-room", "/radio", "/radio/notes"],
      details: listeningRoom
        ? {
            totalTracks:
              listeningRoom.stats?.totalTracks ?? listeningRoom.items.length,
            losslessTracks: listeningRoom.stats?.losslessTracks ?? null,
            djIdentifiers: listeningRoom.djIdentifiers
              .slice(0, 4)
              .map((identifier) => identifier.label),
            sampleTracks: listeningRoom.items
              .slice(0, 5)
              .map((track) => summarizeTrack(track)),
          }
        : null,
    };
  }

  if (path.startsWith("/photos")) {
    const photoShelf = await fetchPhotoShelf({ limit: 6 }).catch(() => null);

    return {
      surface: "family shelf",
      summary:
        "The visitor is on the family shelf. Keep the whisper warm, domestic, and grounded in Ian’s real life instead of making it feel like a random jump scare.",
      preferredTargets: ["/photos", "/real-life-bedtime-stories", "/#about"],
      details: photoShelf
        ? {
            total: photoShelf.total,
            counts: photoShelf.counts,
            recentItems: photoShelf.items.slice(0, 6).map((item) => ({
              title: item.title,
              kind: item.kind,
              capturedAt: item.capturedAt,
            })),
          }
        : null,
    };
  }

  if (path.startsWith("/real-life-bedtime-stories")) {
    const podcasts = await fetchPodcastShow().catch(() => null);

    return {
      surface: "bedtime stories",
      summary:
        "The visitor is already in the softer room. Keep the whisper calm, authored, and family-safe, with a clue that respects the slower pace of this page.",
      preferredTargets: [
        "/real-life-bedtime-stories",
        "/photos",
        "/#about",
      ],
      details: podcasts
        ? {
            totalSeries: podcasts.totalSeries,
            totalEpisodes: podcasts.totalEpisodes,
            series: podcasts.series.slice(0, 4).map((series) => ({
              title: series.title,
              episodeCount: series.episodeCount,
              updatedAt: series.updatedAt,
            })),
          }
        : null,
    };
  }

  if (path.startsWith("/mc")) {
    return {
      surface: "observatory",
      summary:
        "The visitor is already looking at the observatory. Lean into the slightly strange sky-room energy before sending them back into the rest of the site.",
      preferredTargets: ["/mc", "/#troupe", "/radio"],
      details: null,
    };
  }

  if (path.startsWith("/dungeon-master")) {
    return {
      surface: "control room",
      summary:
        "The visitor is in the tabletop control room. If you point them elsewhere, make it feel like an authored side corridor rather than a random redirect.",
      preferredTargets: ["/dungeon-master", "/#thoughts", "/radio"],
      details: null,
    };
  }

  return {
    surface: "homepage",
    summary:
      "The visitor is on Ian Rasmussen’s main signal house. The whisper can stay on the homepage and point to a deeper cut, or send them to the strongest adjacent room.",
    preferredTargets: [
      "/radio",
      "/listening-room",
      "/photos",
      "/#about",
      "/#thoughts",
      "/#troupe",
    ],
    details: null,
  };
};

const weakCopyPattern =
  /\b(easter egg|curious note|playful surprise|click|tap|discover|learn more|read it now|capture it|family fun|listen well|tune list|unique collection)\b/i;
const siteGroundingPattern =
  /\b(ian|rassy|mr rassy|radio|booth|notebook|shelf|family|photo|story|stories|observatory|minecraft|thought|control room|signal)\b/i;
const weakTitlePattern = /^(whisper|signal|note|radio echo|family shelf)$/i;

const isWeakCurio = (payload: CurioPayload) => {
  const combined = [
    payload.badge,
    payload.title,
    payload.body,
    payload.cta,
    payload.hint,
    payload.sigil,
  ]
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  const bodyAndHint = `${payload.body} ${payload.hint}`.replace(/\s+/g, " ").trim();

  return (
    weakCopyPattern.test(combined) ||
    weakTitlePattern.test(payload.badge) ||
    weakTitlePattern.test(payload.title) ||
    !siteGroundingPattern.test(bodyAndHint)
  );
};

const pickFallback = (preferredTargets: string[], seed: string) => {
  const target = coerceTarget(undefined, preferredTargets, seed);
  const directFallback =
    fallbackCurios.find((item) => item.href === target.href) ?? fallbackCurios[0];

  return {
    ...directFallback,
    cta: target.cta,
    hint: target.hint,
    source: "fallback" as const,
  };
};

const requestCheshireCurio = async (input: {
  seed: string;
  requestContext: EasterEggRequestContext;
  routeSignal: RouteSignal | null;
  siteContext: Awaited<ReturnType<typeof buildSiteContext>> | null;
  routeTargets: ReturnType<typeof selectTargetPool>;
  extraGuidance?: string;
  previousAttempt?: CurioPayload | null;
}) => {
  try {
    const response = await requestCheshireJson(
      {
        model: process.env.CHESHIRE_MODEL ?? "rassy-smart",
        temperature: 1,
        maxTokens: 120,
        messages: [
          {
            role: "system",
            content:
              "You are Cheshire, generating a fully dynamic easter egg inside Ian Rasmussen's live site at rassys.com. " +
              "Return ONLY strict JSON with keys badge, title, body, cta, hint, href, sigil. " +
              "This is not canned copy. React to requestContext, currentSignal, routeSignal, and recentTrail every time. " +
              "Write like the site itself: authored, warm, strange in a good way, and specific to Ian Rasmussen and Mr Rassy. " +
              "Prefer routeTargets before jumping to unrelated rooms, especially when the visitor is already inside a strong surface. " +
              "Never sound like generic UI copy, marketing copy, or app onboarding. " +
              "Never use phrases like Easter Egg, curious note, playful surprise, click here, read it now, discover, or learn more. " +
              "Avoid exclamation marks, generic praise, and broad placeholders like unique collection or family fun. " +
              "Reference Ian Rasmussen, Mr Rassy, the radio booth, the notebook, the listening room, the family shelf, the stories, the thoughts log, the observatory, or the control room when it helps. " +
              "Avoid repeating badges, titles, sigils, ctas, or destinations from recentTrail. " +
              "Choose href EXACTLY from routeTargets or siteTargets. " +
              "badge must be 1-3 words, title under 8 words, body under 28 words, hint under 18 words, cta under 4 words, sigil must be 1-2 lowercase words and not an emoji.",
          },
          {
            role: "user",
            content: JSON.stringify({
              seed: input.seed,
              requestContext: input.requestContext,
              routeSignal: input.routeSignal,
              currentSignal: input.siteContext,
              routeTargets: input.routeTargets,
              siteTargets,
              guidance:
                input.extraGuidance ??
                "Make one whisper that feels alive right now, rewards the current page, and still points to a real clickable place on the site.",
              previousAttempt: input.previousAttempt,
            }),
          },
        ],
        lane: "curio",
        priority: "low",
        purpose: "site-curio",
        queueWaitMs: 2500,
        timeoutMs: 12000,
      },
      responseSchema,
    );
    return response.data;
  } catch {
    return null;
  }
};

const callCheshire = async (requestContext: EasterEggRequestContext) => {
  const base = process.env.CHESHIRE_BASE_URL?.trim();
  if (!base) return null;

  const [siteContext, routeSignal] = await Promise.all([
    buildSiteContext().catch(() => null),
    buildRouteSignal(requestContext.path).catch(() => null),
  ]);
  const seed = `${new Date().toISOString()}::${requestContext.path}::${requestContext.trigger}`;

  const preferredTargets = routeSignal?.preferredTargets ?? [];
  const routeTargets = selectTargetPool(preferredTargets);

  const firstAttempt = await requestCheshireCurio({
    seed,
    requestContext,
    routeSignal,
    siteContext,
    routeTargets,
  });

  const secondAttempt =
    !firstAttempt || isWeakCurio(firstAttempt)
      ? await requestCheshireCurio({
          seed,
          requestContext,
          routeSignal,
          siteContext,
          routeTargets,
          previousAttempt: firstAttempt,
          extraGuidance:
            "The previous attempt was too generic. Rewrite it so it sounds unmistakably like Ian Rasmussen's site: specific room nouns, no marketing verbs, no generic delight language, and no emoji sigils.",
        })
      : null;

  const chosenAttempt =
    secondAttempt && !isWeakCurio(secondAttempt)
      ? secondAttempt
      : firstAttempt && !isWeakCurio(firstAttempt)
        ? firstAttempt
        : null;

  if (!chosenAttempt) return null;

  const target = coerceTarget(chosenAttempt.href, preferredTargets, seed);

  return {
    ...chosenAttempt,
    href: target.href,
    cta: target.cta,
    hint: target.hint,
    sigil: chosenAttempt.sigil.trim(),
    source: "cheshire" as const,
  };
};

export async function GET(request: Request) {
  const ip = await getClientIp();
  const { allowed } = await rateLimit(`rl:easter-eggs:${ip}`, 24, 60);
  if (!allowed) {
    return NextResponse.json({ error: "rate_limit" }, { status: 429 });
  }

  const requestContext = readRequestContext(request);
  const seed = `${new Date().toISOString()}::${requestContext.path}::${requestContext.trigger}`;
  const routeSignal = await buildRouteSignal(requestContext.path).catch(() => null);
  const payload =
    (await callCheshire(requestContext).catch(() => null)) ??
    pickFallback(routeSignal?.preferredTargets ?? [], seed);

  return NextResponse.json(
    {
      ...payload,
      id: `${payload.source}-${Date.now()}`,
      at: new Date().toISOString(),
    },
    {
      headers: {
        "Cache-Control": "no-store",
        "X-Robots-Tag": "noindex",
      },
    },
  );
}
