import { FastifyPluginAsync } from "fastify";
import { ModerationDecisionSchema } from "@trt/shared";
import { prisma } from "../lib/prisma";
import { grantCredits } from "../lib/credits";

const moderationRoutes: FastifyPluginAsync = async (app) => {
  app.get("/queue", async (req, reply) => {
    if (!req.user || (req.user.role !== "MOD" && req.user.role !== "ADMIN")) {
      reply.status(403);
      return { error: "Forbidden" };
    }

    const tales = await prisma.tale.findMany({
      where: { status: "PENDING", deletedAt: null },
      include: { author: true, image: true },
      orderBy: { createdAt: "asc" },
      take: 50
    });

    return tales.map((tale) => ({
      id: tale.id,
      title: tale.title,
      excerpt: tale.body.slice(0, 240),
      authorPseudonym: tale.author.displayName || tale.author.pseudonym,
      createdAt: tale.createdAt.toISOString(),
      imageUrl: tale.image?.url ?? null
    }));
  });

  app.post("/tales/:id/approve", async (req, reply) => {
    if (!req.user || (req.user.role !== "MOD" && req.user.role !== "ADMIN")) {
      reply.status(403);
      return { error: "Forbidden" };
    }

    const { id } = req.params as { id: string };
    const tale = await prisma.tale.findUnique({ where: { id } });
    if (!tale) {
      reply.status(404);
      return { error: "Not found" };
    }

    const approved = await prisma.tale.update({
      where: { id },
      data: { status: "APPROVED", approvedAt: new Date(), rejectionReason: null, rejectedAt: null }
    });

    await grantCredits(tale.authorId, 1, "TALE_APPROVED", { taleId: id });

    return approved;
  });

  app.post("/tales/:id/reject", async (req, reply) => {
    if (!req.user || (req.user.role !== "MOD" && req.user.role !== "ADMIN")) {
      reply.status(403);
      return { error: "Forbidden" };
    }

    const payload = ModerationDecisionSchema.safeParse(req.body ?? {});
    if (!payload.success) {
      reply.status(400);
      return { error: "Invalid payload" };
    }

    const { id } = req.params as { id: string };
    const tale = await prisma.tale.findUnique({ where: { id } });
    if (!tale) {
      reply.status(404);
      return { error: "Not found" };
    }

    const rejected = await prisma.tale.update({
      where: { id },
      data: {
        status: "REJECTED",
        rejectedAt: new Date(),
        rejectionReason: payload.data.reason ?? "Rejected"
      }
    });

    return rejected;
  });

  app.post("/tales/:id/needs-edits", async (req, reply) => {
    if (!req.user || (req.user.role !== "MOD" && req.user.role !== "ADMIN")) {
      reply.status(403);
      return { error: "Forbidden" };
    }

    const payload = ModerationDecisionSchema.safeParse(req.body ?? {});
    if (!payload.success) {
      reply.status(400);
      return { error: "Invalid payload" };
    }

    const { id } = req.params as { id: string };
    const updated = await prisma.tale.update({
      where: { id },
      data: {
        status: "NEEDS_EDITS",
        rejectionReason: payload.data.reason ?? "Needs edits"
      }
    });

    return updated;
  });

  app.get("/images/queue", async (req, reply) => {
    if (!req.user || (req.user.role !== "MOD" && req.user.role !== "ADMIN")) {
      reply.status(403);
      return { error: "Forbidden" };
    }

    const images = await prisma.imageAsset.findMany({
      where: { status: "PENDING" },
      include: { uploader: true },
      orderBy: { createdAt: "asc" },
      take: 50
    });

    return images.map((img) => ({
      id: img.id,
      url: img.url,
      createdAt: img.createdAt.toISOString(),
      uploader: img.uploader.displayName || img.uploader.pseudonym
    }));
  });

  app.post("/images/:id/approve", async (req, reply) => {
    if (!req.user || (req.user.role !== "MOD" && req.user.role !== "ADMIN")) {
      reply.status(403);
      return { error: "Forbidden" };
    }

    const { id } = req.params as { id: string };
    const updated = await prisma.imageAsset.update({
      where: { id },
      data: { status: "APPROVED", hasFace: false }
    });

    await prisma.moderationEvent.create({
      data: { imageId: id, source: "HUMAN", result: "PASS", notes: "Approved by moderator" }
    });

    return updated;
  });

  app.post("/images/:id/reject", async (req, reply) => {
    if (!req.user || (req.user.role !== "MOD" && req.user.role !== "ADMIN")) {
      reply.status(403);
      return { error: "Forbidden" };
    }

    const payload = ModerationDecisionSchema.safeParse(req.body ?? {});
    if (!payload.success) {
      reply.status(400);
      return { error: "Invalid payload" };
    }

    const { id } = req.params as { id: string };
    const updated = await prisma.imageAsset.update({
      where: { id },
      data: { status: "REJECTED" }
    });

    await prisma.moderationEvent.create({
      data: {
        imageId: id,
        source: "HUMAN",
        result: "BLOCK",
        notes: payload.data.reason ?? "Rejected by moderator"
      }
    });

    return updated;
  });
};

export default moderationRoutes;
