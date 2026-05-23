import { FastifyPluginAsync } from "fastify";
import { TaleCreateSchema, TaleUpdateSchema } from "@trt/shared";
import type { Prisma, TaleStatus } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { computeHotScore } from "../lib/ranking";
import { enforceDailyLimit } from "../lib/rate";
import { moderationQueue } from "../jobs/queues";
import { grantCredits } from "../lib/credits";
import { aiEnabled, embedText } from "../lib/ai";
import { cosineSimilarity } from "../lib/embedding";

const publicTaleInclude = {
  author: {
    include: {
      avatarImage: true,
    },
  },
  image: true,
} satisfies Prisma.TaleInclude;

type TaleWithRelations = Prisma.TaleGetPayload<{
  include: typeof publicTaleInclude;
}>;

function serializeTale(
  tale: TaleWithRelations,
  options?: { revealAuthor?: boolean },
) {
  const revealAuthor = options?.revealAuthor ?? !tale.isAnonymous;
  const authorLabel = revealAuthor
    ? tale.author.displayName || tale.author.pseudonym
    : "Anonymous storyteller";
  const authorAvatarUrl = revealAuthor
    ? (tale.author.avatarImage?.url ?? null)
    : null;

  return {
    id: tale.id,
    title: tale.title,
    excerpt: tale.body.slice(0, 240),
    authorPseudonym: authorLabel,
    authorAvatarUrl,
    createdAt: tale.createdAt.toISOString(),
    status: tale.status,
    assistMode: tale.assistMode,
    storyPrompt: tale.storyPrompt,
    isAnonymous: tale.isAnonymous,
    hotScore: tale.hotScore,
    topScore: tale.topScore,
    imageUrl: tale.image?.url ?? null,
    upvotes: tale.upvotes,
    downvotes: tale.downvotes,
  };
}

const talesRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async (req, reply) => {
    const { sort = "hot", status } =
      (req.query as { sort?: string; status?: string }) ?? {};
    const isMod = req.user?.role === "MOD" || req.user?.role === "ADMIN";
    const allowedStatuses = new Set<TaleStatus>([
      "PENDING",
      "APPROVED",
      "REJECTED",
      "NEEDS_EDITS",
    ]);
    const finalStatus: TaleStatus =
      isMod && status && allowedStatuses.has(status as TaleStatus)
        ? (status as TaleStatus)
        : "APPROVED";

    const orderBy: Prisma.TaleOrderByWithRelationInput =
      sort === "new"
        ? { createdAt: "desc" }
        : sort === "top"
          ? { topScore: "desc" }
          : { hotScore: "desc" };

    const limit = Math.min(Number((req.query as any)?.limit ?? 30), 50);
    const page = Math.max(Number((req.query as any)?.page ?? 0), 0);

    const tales = await prisma.tale.findMany({
      where: {
        status: finalStatus,
        deletedAt: null,
      },
      include: publicTaleInclude,
      orderBy,
      take: limit,
      skip: page * limit,
    });

    return tales.map((tale) => serializeTale(tale));
  });

  app.get("/featured", async () => {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const tales = await prisma.tale.findMany({
      where: { status: "APPROVED", createdAt: { gte: since }, deletedAt: null },
      include: publicTaleInclude,
      orderBy: { hotScore: "desc" },
      take: 5,
    });

    return tales.map((tale) => serializeTale(tale));
  });

  app.get("/mine", async (req, reply) => {
    if (!req.user) {
      reply.status(401);
      return { error: "Unauthorized" };
    }

    const tales = await prisma.tale.findMany({
      where: { authorId: req.user.id, deletedAt: null },
      orderBy: { createdAt: "desc" },
      include: publicTaleInclude,
      take: 50,
    });

    return tales.map((tale) => serializeTale(tale, { revealAuthor: true }));
  });

  app.get("/search", async (req, reply) => {
    const query = (req.query as { query?: string })?.query?.trim();
    if (!query || query.length < 3) {
      reply.status(400);
      return { error: "Missing query" };
    }

    if (!aiEnabled()) {
      reply.status(501);
      return { error: "Search disabled" };
    }

    let queryEmbedding: number[] | undefined;
    try {
      queryEmbedding = await embedText(query);
    } catch (_err) {
      reply.status(500);
      return { error: "Embedding failed" };
    }

    if (!queryEmbedding || queryEmbedding.length === 0) {
      return [];
    }

    const poolSize = Number(process.env.SEARCH_POOL_SIZE || 200);
    const limit = Math.min(Number((req.query as any)?.limit ?? 20), 50);
    const page = Math.max(Number((req.query as any)?.page ?? 0), 0);
    const minSim = Number(process.env.SEARCH_MIN_SIM || 0.78);

    const embeddings = await prisma.taleEmbedding.findMany({
      where: { tale: { is: { status: "APPROVED", deletedAt: null } } },
      include: { tale: { include: publicTaleInclude } },
      orderBy: { createdAt: "desc" },
      take: poolSize,
    });

    const scored = embeddings
      .map((entry) => {
        const embedding = Array.isArray(entry.embedding)
          ? (entry.embedding as number[])
          : null;
        if (!embedding) return null;
        const similarity = cosineSimilarity(queryEmbedding!, embedding);
        return { entry, similarity };
      })
      .filter(
        (
          item,
        ): item is { entry: (typeof embeddings)[number]; similarity: number } =>
          Boolean(item),
      )
      .filter((item) => item.similarity >= minSim)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(page * limit, page * limit + limit);

    return scored.map(({ entry, similarity }) => ({
      ...serializeTale(entry.tale),
      similarity,
    }));
  });

  app.get("/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const tale = await prisma.tale.findUnique({
      where: { id },
      include: publicTaleInclude,
    });
    if (!tale || tale.deletedAt) {
      reply.status(404);
      return { error: "Not found" };
    }

    const isOwner = req.user?.id === tale.authorId;
    const isMod = req.user?.role === "MOD" || req.user?.role === "ADMIN";

    if (tale.status !== "APPROVED" && !isOwner && !isMod) {
      reply.status(403);
      return { error: "Forbidden" };
    }

    const response: any = {
      ...serializeTale(tale, {
        revealAuthor: isOwner || isMod || !tale.isAnonymous,
      }),
      title: tale.title,
      body: tale.body,
      excerpt: tale.body.slice(0, 240),
    };
    if (isOwner || isMod) {
      response.rejectionReason = tale.rejectionReason;
    }
    return response;
  });

  app.post("/", async (req, reply) => {
    if (!req.user) {
      reply.status(401);
      return { error: "Unauthorized" };
    }

    const payload = TaleCreateSchema.safeParse(req.body);
    if (!payload.success) {
      reply.status(400);
      return { error: "Invalid payload" };
    }

    const author = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { displayName: true, avatarImageId: true },
    });

    const wantsNamedStory = !(payload.data.isAnonymous ?? false);
    if (wantsNamedStory && (!author?.displayName || !author.avatarImageId)) {
      reply.status(409);
      return {
        error:
          "Complete your storyteller profile with a name and photo before publishing under your name.",
      };
    }

    await enforceDailyLimit({ userId: req.user.id, table: "tale", limit: 5 });

    let embedding: number[] | undefined;
    if (aiEnabled()) {
      try {
        embedding = await embedText(payload.data.body);
      } catch (_err) {
        embedding = undefined;
      }
    }

    if (embedding && embedding.length > 0) {
      const recentEmbeddings = await prisma.taleEmbedding.findMany({
        where: { tale: { is: { authorId: req.user.id } } },
        orderBy: { createdAt: "desc" },
        take: 20,
      });

      for (const recent of recentEmbeddings) {
        if (!Array.isArray(recent.embedding)) continue;
        const similarity = cosineSimilarity(
          embedding,
          recent.embedding as number[],
        );
        if (similarity >= 0.97) {
          reply.status(409);
          return {
            error: "Similar tale detected. Please submit a fresh story.",
          };
        }
      }
    }

    const duplicate = await prisma.tale.findFirst({
      where: {
        authorId: req.user.id,
        title: payload.data.title,
        body: payload.data.body,
      },
    });
    if (duplicate) {
      reply.status(409);
      return { error: "Duplicate tale detected" };
    }

    if (payload.data.imageId) {
      const image = await prisma.imageAsset.findUnique({
        where: { id: payload.data.imageId },
      });
      if (
        !image ||
        image.uploaderId !== req.user.id ||
        image.purpose !== "STORY"
      ) {
        reply.status(400);
        return { error: "Invalid image" };
      }
    }

    const assistMode = payload.data.assistMode ?? "HANDMADE";
    const tale = await prisma.tale.create({
      data: {
        authorId: req.user.id,
        title: payload.data.title,
        body: payload.data.body,
        imageId: payload.data.imageId ?? null,
        assistMode,
        isAnonymous: payload.data.isAnonymous ?? false,
        storyPrompt: payload.data.storyPrompt ?? null,
      },
    });

    if (embedding && embedding.length > 0) {
      await prisma.taleEmbedding.create({
        data: {
          taleId: tale.id,
          model:
            process.env.LOCALAI_EMBED_MODEL || "rassy-embed",
          embedding,
        },
      });
    }

    await moderationQueue.add("auto", { taleId: tale.id });

    return tale;
  });

  app.patch("/:id", async (req, reply) => {
    if (!req.user) {
      reply.status(401);
      return { error: "Unauthorized" };
    }

    const payload = TaleUpdateSchema.safeParse(req.body);
    if (!payload.success) {
      reply.status(400);
      return { error: "Invalid payload" };
    }

    const { id } = req.params as { id: string };
    const tale = await prisma.tale.findUnique({ where: { id } });
    if (!tale || tale.deletedAt) {
      reply.status(404);
      return { error: "Not found" };
    }

    if (tale.authorId !== req.user.id) {
      reply.status(403);
      return { error: "Forbidden" };
    }

    if (tale.status !== "NEEDS_EDITS") {
      reply.status(409);
      return { error: "Only tales marked NEEDS_EDITS can be edited." };
    }

    let embedding: number[] | undefined;
    if (aiEnabled()) {
      try {
        embedding = await embedText(payload.data.body);
      } catch (_err) {
        embedding = undefined;
      }
    }

    if (embedding && embedding.length > 0) {
      const recentEmbeddings = await prisma.taleEmbedding.findMany({
        where: { tale: { is: { authorId: req.user.id } } },
        orderBy: { createdAt: "desc" },
        take: 20,
      });

      for (const recent of recentEmbeddings) {
        if (recent.taleId === id) continue;
        if (!Array.isArray(recent.embedding)) continue;
        const similarity = cosineSimilarity(
          embedding,
          recent.embedding as number[],
        );
        if (similarity >= 0.97) {
          reply.status(409);
          return {
            error: "Similar tale detected. Please submit a fresh story.",
          };
        }
      }
    }

    const author = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { displayName: true, avatarImageId: true },
    });
    const finalIsAnonymous = payload.data.isAnonymous ?? tale.isAnonymous;
    if (!finalIsAnonymous && (!author?.displayName || !author.avatarImageId)) {
      reply.status(409);
      return {
        error:
          "Complete your storyteller profile with a name and photo before publishing under your name.",
      };
    }

    if (payload.data.imageId) {
      const image = await prisma.imageAsset.findUnique({
        where: { id: payload.data.imageId },
      });
      if (
        !image ||
        image.uploaderId !== req.user.id ||
        image.purpose !== "STORY"
      ) {
        reply.status(400);
        return { error: "Invalid image" };
      }
    }

    const updateData: any = {
      title: payload.data.title,
      body: payload.data.body,
      status: "PENDING",
      rejectionReason: null,
      rejectedAt: null,
      approvedAt: null,
    };
    if (Object.prototype.hasOwnProperty.call(payload.data, "imageId")) {
      updateData.imageId = payload.data.imageId ?? null;
    }
    if (payload.data.assistMode !== undefined) {
      updateData.assistMode = payload.data.assistMode;
    }
    if (payload.data.isAnonymous !== undefined) {
      updateData.isAnonymous = payload.data.isAnonymous;
    }
    if (payload.data.storyPrompt !== undefined) {
      updateData.storyPrompt = payload.data.storyPrompt ?? null;
    }

    const updated = await prisma.tale.update({
      where: { id },
      data: updateData,
    });

    if (embedding && embedding.length > 0) {
      await prisma.taleEmbedding.upsert({
        where: { taleId: id },
        update: {
          embedding,
          model:
            process.env.LOCALAI_EMBED_MODEL || "rassy-embed",
        },
        create: {
          taleId: id,
          model:
            process.env.LOCALAI_EMBED_MODEL || "rassy-embed",
          embedding,
        },
      });
    }

    await moderationQueue.add("auto", { taleId: updated.id });

    return updated;
  });

  app.post("/:id/heart", async (req, reply) => {
    if (!req.user) {
      reply.status(401);
      return { error: "Unauthorized" };
    }

    await enforceDailyLimit({ userId: req.user.id, table: "vote", limit: 400 });

    const tale = await prisma.tale.findUnique({
      where: { id: (req.params as { id: string }).id },
    });
    if (!tale || tale.status !== "APPROVED") {
      reply.status(404);
      return { error: "Tale not found" };
    }

    if (tale.authorId === req.user.id) {
      reply.status(403);
      return { error: "Cannot heart your own tale" };
    }

    const existing = await prisma.vote.findUnique({
      where: {
        userId_taleId: {
          userId: req.user.id,
          taleId: tale.id,
        },
      },
    });

    let upvotes = tale.upvotes;
    let downvotes = tale.downvotes;
    let hearted = false;
    let creditDelta = 0;

    if (existing?.value === 1) {
      await prisma.vote.delete({ where: { id: existing.id } });
      upvotes = Math.max(0, upvotes - 1);
      hearted = false;
      creditDelta = -2;
    } else if (existing?.value === -1) {
      await prisma.vote.update({
        where: { id: existing.id },
        data: { value: 1 },
      });
      upvotes += 1;
      downvotes = Math.max(0, downvotes - 1);
      hearted = true;
      creditDelta = 2;
    } else {
      await prisma.vote.create({
        data: {
          userId: req.user.id,
          taleId: tale.id,
          value: 1,
        },
      });
      upvotes += 1;
      hearted = true;
      creditDelta = 2;
    }

    const score = upvotes;
    const hotScore = computeHotScore(upvotes, tale.createdAt);

    await prisma.tale.update({
      where: { id: tale.id },
      data: {
        upvotes,
        downvotes,
        score,
        topScore: upvotes,
        hotScore,
      },
    });

    await grantCredits(
      tale.authorId,
      creditDelta,
      hearted ? "HEART_RECEIVED" : "HEART_REMOVED",
      {
        taleId: tale.id,
        voterId: req.user.id,
      },
    );

    return { ok: true, hearted, upvotes, downvotes, score };
  });
};

export default talesRoutes;
