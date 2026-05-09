import type { FastifyInstance } from "fastify";
import {
  authenticateRequest,
  createAuthSession,
  createPasswordHash,
  normalizeAuthEmail,
  revokeSession,
  verifyPassword
} from "../lib/auth";
import { prisma } from "../lib/prisma";
import { LoginInput, RegisterInput } from "../lib/validators";

const serializeUser = (user: {
  id: string;
  email: string;
  displayName?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}) => ({
  id: user.id,
  email: user.email,
  displayName: user.displayName ?? null,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt
});

export const authRoutes = async (app: FastifyInstance) => {
  app.post("/auth/register", async (request, reply) => {
    const parsed = RegisterInput.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }

    const email = normalizeAuthEmail(parsed.data.email);
    const existing = await prisma.user.findUnique({
      where: { email }
    });

    if (existing?.passwordHash) {
      return reply.status(409).send({ error: "An account with this email already exists." });
    }

    const user = existing
      ? await prisma.user.update({
          where: { id: existing.id },
          data: {
            displayName: parsed.data.displayName ?? existing.displayName,
            passwordHash: createPasswordHash(parsed.data.password)
          }
        })
      : await prisma.user.create({
          data: {
            email,
            displayName: parsed.data.displayName,
            passwordHash: createPasswordHash(parsed.data.password)
          }
        });

    const session = await createAuthSession({
      userId: user.id,
      userAgent: request.headers["user-agent"]
    });

    return {
      user: serializeUser(user),
      token: session.token,
      expiresAt: session.expiresAt
    };
  });

  app.post("/auth/login", async (request, reply) => {
    const parsed = LoginInput.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }

    const email = normalizeAuthEmail(parsed.data.email);
    const user = await prisma.user.findUnique({
      where: { email }
    });

    if (!user?.passwordHash || !verifyPassword(parsed.data.password, user.passwordHash)) {
      return reply.status(401).send({ error: "Invalid email or password." });
    }

    const session = await createAuthSession({
      userId: user.id,
      userAgent: request.headers["user-agent"]
    });

    return {
      user: serializeUser(user),
      token: session.token,
      expiresAt: session.expiresAt
    };
  });

  app.get("/auth/session", async (request, reply) => {
    try {
      const authUser = await authenticateRequest(request);
      const user = await prisma.user.upsert({
        where: { id: authUser.id },
        update: {
          email: normalizeAuthEmail(authUser.email),
          displayName: authUser.displayName ?? undefined
        },
        create: {
          id: authUser.id,
          email: normalizeAuthEmail(authUser.email),
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

      return {
        user: serializeUser(user),
        stats: {
          chartCount,
          feedCount
        }
      };
    } catch (error: any) {
      return reply.status(401).send({ error: error.message });
    }
  });

  app.post("/auth/logout", async (request, reply) => {
    const token = request.headers.authorization?.startsWith("Bearer ")
      ? request.headers.authorization.slice(7)
      : null;

    if (!token) {
      return reply.status(400).send({ error: "Missing Authorization bearer token." });
    }

    await revokeSession(token);
    return { ok: true };
  });
};
