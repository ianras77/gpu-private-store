import type { FastifyInstance } from "fastify";
import { authenticateRequest } from "../lib/auth";
import { prisma } from "../lib/prisma";

export const accountRoutes = async (app: FastifyInstance) => {
  app.delete("/account", async (request, reply) => {
    try {
      const user = await authenticateRequest(request);
      const charts = await prisma.chartProfile.findMany({
        where: { userId: user.id },
        select: { id: true }
      });
      const chartIds = charts.map((chart: { id: string }) => chart.id);
      await prisma.contentJob.deleteMany({ where: { userId: user.id } });
      await prisma.contentEntry.deleteMany({ where: { userId: user.id } });
      await prisma.reading.deleteMany({ where: { chartProfileId: { in: chartIds } } });
      await prisma.chartProfile.deleteMany({ where: { userId: user.id } });
      await prisma.authSession.deleteMany({ where: { userId: user.id } });
      await prisma.user.deleteMany({ where: { id: user.id } });
      return { ok: true };
    } catch (error: any) {
      return reply.status(400).send({ error: error.message });
    }
  });
};
