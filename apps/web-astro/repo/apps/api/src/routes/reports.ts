import type { FastifyInstance } from "fastify";
import { authenticateRequest } from "../lib/auth";
import { prisma } from "../lib/prisma";

export const reportRoutes = async (app: FastifyInstance) => {
  app.get("/:id", async (request, reply) => {
    const user = await authenticateRequest(request);
    const id = (request.params as { id: string }).id;
    const artifact = await prisma.reportArtifact.findFirst({ where: { id, reportRun: { userId: user.id } }, include: { reportRun: { select: { id: true, status: true, kind: true, depth: true, brandId: true, chartProfileId: true, createdAt: true, updatedAt: true } } } });
    if (!artifact) return reply.status(404).send({ error: "Report not found." });
    return { report: artifact };
  });

  app.get("/:id/sections/:key", async (request, reply) => {
    const user = await authenticateRequest(request);
    const params = request.params as { id: string; key: string };
    const section = await prisma.reportSection.findFirst({ where: { reportRunId: params.id, sectionKey: params.key, reportRun: { userId: user.id } } });
    if (!section) return reply.status(404).send({ error: "Report section not found." });
    return { section };
  });
};
