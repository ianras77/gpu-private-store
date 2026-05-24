import { FastifyPluginAsync } from "fastify";
import { prisma } from "../lib/prisma";
import {
  CraftNotesSchema,
  StorySparkSchema,
  StorytellerProfileUpdateSchema,
} from "@trt/shared";
import {
  aiEnabled,
  chatCompletion,
  polishStory,
  transcribeAudio,
} from "../lib/ai";
import { buildCraftNotesFallback, chooseCraftFocus } from "../lib/craft";

function serializeUser(user: {
  id: string;
  email: string;
  pseudonym: string;
  displayName: string | null;
  bio: string | null;
  avatarImageId: string | null;
  creditsTotal: number;
  role: "USER" | "MOD" | "ADMIN";
  avatarImage?: { url: string } | null;
}) {
  return {
    id: user.id,
    email: user.email,
    pseudonym: user.pseudonym,
    displayName: user.displayName,
    bio: user.bio,
    avatarImageId: user.avatarImageId,
    avatarUrl: user.avatarImage?.url ?? null,
    creditsTotal: user.creditsTotal,
    role: user.role,
    profileComplete: Boolean(user.displayName && user.avatarImageId),
  };
}

function fallbackStorySpark(input: {
  premise: string;
  mood?: string | null;
  setting?: string | null;
  wonder?: string | null;
  character?: string | null;
  stakes?: string | null;
  turn?: string | null;
  voice?: string | null;
}) {
  const mood = input.mood?.trim() || "warm, whimsical";
  const setting =
    input.setting?.trim() ||
    "a place that feels one breath away from impossible";
  const wonder = input.wonder?.trim() || "one delightful impossibility";
  const character = input.character?.trim() || "someone with a private want";
  const stakes = input.stakes?.trim() || "a cost that cannot be shrugged off";
  const turn = input.turn?.trim() || "one choice that changes the bargain";
  const voice = input.voice?.trim() || "clear, vivid, and hand-led";
  const titleSuggestion = `${input.premise.split(" ").slice(0, 4).join(" ")} and the ${wonder}`;
  const prompt =
    `Story spine: premise=${input.premise}; character=${character}; stakes=${stakes}; turn=${turn}; ` +
    `voice=${voice}; setting=${setting}; wonder=${wonder}. Draft slowly in scenes, keep cause and effect clear, ` +
    `and leave room for the human author to make final language choices.`;
  const opening =
    `${input.premise} began in ${setting}, where ${wonder.toLowerCase()} felt as ordinary as weather and just as moody. ` +
    `Put ${character} in motion, hint at ${stakes.toLowerCase()}, and end the opening on ${turn.toLowerCase()}.`;

  return { titleSuggestion, prompt, opening };
}

async function conjureStorySpark(input: {
  premise: string;
  mood?: string | null;
  setting?: string | null;
  wonder?: string | null;
  character?: string | null;
  stakes?: string | null;
  turn?: string | null;
  voice?: string | null;
}) {
  if (!aiEnabled()) {
    return fallbackStorySpark(input);
  }

  try {
    const content = await chatCompletion(
      [
        {
          role: "system",
          content:
            'You are a story atelier assistant for an anti-slop long-form writing app. Craft a scene-first story spine and opening, not a finished story. Respond ONLY with valid JSON using this shape: {"titleSuggestion":"string","prompt":"string","opening":"string"}. The opening should be 2-4 sentences long, specific, and unfinished. Never produce a complete tale.',
        },
        {
          role: "user",
          content: JSON.stringify(input),
        },
      ],
      0.85,
    );

    if (!content) {
      return fallbackStorySpark(input);
    }

    const cleaned = content.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned) as {
      titleSuggestion?: string;
      prompt?: string;
      opening?: string;
    };

    if (!parsed.titleSuggestion || !parsed.prompt || !parsed.opening) {
      return fallbackStorySpark(input);
    }

    return {
      titleSuggestion: parsed.titleSuggestion.trim(),
      prompt: parsed.prompt.trim(),
      opening: parsed.opening.trim(),
    };
  } catch (_err) {
    return fallbackStorySpark(input);
  }
}

async function buildCraftNotes(input: {
  title?: string | null;
  body?: string | null;
  premise?: string | null;
  character?: string | null;
  stakes?: string | null;
  turn?: string | null;
  voice?: string | null;
}) {
  const fallback = buildCraftNotesFallback(input);
  const focus = chooseCraftFocus(input);

  if (!aiEnabled() || !(input.body || input.title)) {
    return { notes: fallback, focus };
  }

  try {
    const content = await chatCompletion(
      [
        {
          role: "system",
          content:
            'You are a rigorous story editor for a modern Gutenberg writing studio. Give craft notes only. Do not rewrite the story. Respond ONLY with valid JSON: {"notes":["string","string","string","string"],"focus":"structure|voice|stakes|line-edit"}. Each note must be specific, humane, and action-oriented.',
        },
        {
          role: "user",
          content: JSON.stringify({ ...input, fallbackFocus: focus }),
        },
      ],
      0.45,
    );

    if (!content) return { notes: fallback, focus };
    const parsed = JSON.parse(content.replace(/```json|```/g, "").trim()) as {
      notes?: string[];
      focus?: "structure" | "voice" | "stakes" | "line-edit";
    };

    if (!Array.isArray(parsed.notes) || parsed.notes.length === 0) {
      return { notes: fallback, focus };
    }

    return {
      notes: parsed.notes
        .slice(0, 4)
        .map((note) => note.trim())
        .filter(Boolean),
      focus: parsed.focus ?? focus,
    };
  } catch (_err) {
    return { notes: fallback, focus };
  }
}

const miscRoutes: FastifyPluginAsync = async (app) => {
  app.get("/health", async () => ({ ok: true }));
  app.get("/healthz", async () => ({ ok: true }));

  app.get("/me", async (req, reply) => {
    if (!req.user) {
      reply.status(401);
      return { error: "Unauthorized" };
    }
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: { avatarImage: true },
    });

    if (!user) {
      reply.status(404);
      return { error: "Not found" };
    }

    return serializeUser(user);
  });

  app.post("/me/profile", async (req, reply) => {
    if (!req.user) {
      reply.status(401);
      return { error: "Unauthorized" };
    }

    const payload = StorytellerProfileUpdateSchema.safeParse(req.body);
    if (!payload.success) {
      reply.status(400);
      return { error: "Invalid profile payload" };
    }

    if (payload.data.avatarImageId) {
      const avatar = await prisma.imageAsset.findUnique({
        where: { id: payload.data.avatarImageId },
      });

      if (
        !avatar ||
        avatar.uploaderId !== req.user.id ||
        avatar.purpose !== "AVATAR"
      ) {
        reply.status(400);
        return { error: "Invalid avatar image" };
      }
    }

    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: {
        displayName: payload.data.displayName ?? null,
        bio: payload.data.bio ?? null,
        avatarImageId: Object.prototype.hasOwnProperty.call(
          payload.data,
          "avatarImageId",
        )
          ? (payload.data.avatarImageId ?? null)
          : undefined,
      },
      include: { avatarImage: true },
    });

    return serializeUser(user);
  });

  app.post("/story-spark", async (req, reply) => {
    const payload = StorySparkSchema.safeParse(req.body);
    if (!payload.success) {
      reply.status(400);
      return { error: "Invalid story spark payload" };
    }

    return conjureStorySpark(payload.data);
  });

  app.post("/craft-notes", async (req, reply) => {
    const payload = CraftNotesSchema.safeParse(req.body);
    if (!payload.success) {
      reply.status(400);
      return { error: "Invalid craft notes payload" };
    }

    return buildCraftNotes(payload.data);
  });

  app.post("/transcribe", async (req, reply) => {
    if (!req.user) {
      reply.status(401);
      return { error: "Unauthorized" };
    }
    if (!aiEnabled()) {
      reply.status(501);
      return { error: "Transcription disabled" };
    }

    const file = await req.file();
    if (!file) {
      reply.status(400);
      return { error: "Missing audio file" };
    }

    const buffer = await file.toBuffer();
    const text = await transcribeAudio(buffer, file.filename, file.mimetype);
    return { text: text ?? "" };
  });

  app.post("/polish", async (req, reply) => {
    if (!req.user) {
      reply.status(401);
      return { error: "Unauthorized" };
    }

    if (!aiEnabled()) {
      reply.status(501);
      return { error: "Polish disabled" };
    }

    const body = (req.body as { text?: string } | undefined)?.text;
    if (!body || body.length < 20) {
      reply.status(400);
      return { error: "Missing story text" };
    }

    const polished = await polishStory(body);
    return { text: polished };
  });
};

export default miscRoutes;
