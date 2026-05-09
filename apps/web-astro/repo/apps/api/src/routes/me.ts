import type { FastifyInstance } from "fastify";
import { authenticateRequest } from "../lib/auth";
import { prisma } from "../lib/prisma";

export const meRoutes = async (app: FastifyInstance) => {
  app.get("/me", async (request, reply) => {
    try {
      const authUser = await authenticateRequest(request);
      const user = await prisma.user.upsert({
        where: { id: authUser.id },
        update: {
          email: authUser.email,
          displayName: authUser.displayName ?? undefined
        },
        create: {
          id: authUser.id,
          email: authUser.email,
          displayName: authUser.displayName ?? undefined
        }
      });
      const [chartCount, feedCount] = await Promise.all([
        prisma.chartProfile.count({
          where: {
            userId: user.id,
            brandId: request.brandId
          }
        }),
        prisma.contentEntry.count({
          where: {
            userId: user.id,
            brandId: request.brandId
          }
        })
      ]);
      return { user, stats: { chartCount, feedCount } };
    } catch (error: any) {
      return reply.status(401).send({ error: error.message });
    }
  });
};
