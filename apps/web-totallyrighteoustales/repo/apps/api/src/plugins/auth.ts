import fp from "fastify-plugin";
import { jwtVerify } from "jose";
import { prisma } from "../lib/prisma";
import { makeAvatarSeed, makePseudonym } from "../lib/pseudonym";

export type AuthUser = {
  id: string;
  email: string;
  role: "USER" | "MOD" | "ADMIN";
  pseudonym: string;
  displayName?: string | null;
};

declare module "fastify" {
  interface FastifyRequest {
    user?: AuthUser | null;
  }
}

export default fp(async (app) => {
  const secretRaw = process.env.SUPABASE_JWT_SECRET;
  const secret = secretRaw ? new TextEncoder().encode(secretRaw) : null;

  app.decorateRequest("user", null);

  app.addHook("preHandler", async (req) => {
    const devBypass = process.env.DEV_AUTH_BYPASS === "true";
    const devEmail = req.headers["x-dev-user"];

    if (!secret && !devBypass) {
      req.user = null;
      return;
    }

    if (devBypass && typeof devEmail === "string") {
      const user = await prisma.user.upsert({
        where: { email: devEmail },
        update: {},
        create: {
          email: devEmail,
          pseudonym: makePseudonym(),
          avatarSeed: makeAvatarSeed()
        }
      });
      req.user = {
        id: user.id,
        email: user.email,
        role: user.role,
        pseudonym: user.pseudonym,
        displayName: user.displayName
      };
      return;
    }

    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith("Bearer ")) {
      req.user = null;
      return;
    }

    if (!secret) {
      req.user = null;
      return;
    }

    try {
      const token = auth.replace("Bearer ", "");
      const { payload } = await jwtVerify(token, secret);
      const email = payload.email as string | undefined;

      if (!email) {
        req.user = null;
        return;
      }

      const user = await prisma.user.upsert({
        where: { email },
        update: {},
        create: {
          email,
          pseudonym: makePseudonym(),
          avatarSeed: makeAvatarSeed()
        }
      });

      req.user = {
        id: user.id,
        email: user.email,
        role: user.role,
        pseudonym: user.pseudonym,
        displayName: user.displayName
      };
    } catch (_err) {
      req.user = null;
    }
  });
});
