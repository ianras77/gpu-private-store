import { randomBytes, scryptSync, timingSafeEqual, createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import type { FastifyRequest } from "fastify";
import { prisma } from "./prisma";

export interface AuthUser {
  id: string;
  email: string;
  displayName?: string | null;
}

const PASSWORD_PREFIX = "scrypt";
const DEFAULT_SESSION_TTL_DAYS = Number(process.env.AUTH_SESSION_TTL_DAYS ?? 30);

const normalizeEmail = (value: string): string => value.trim().toLowerCase();

const hashToken = (token: string): string =>
  createHash("sha256")
    .update(token)
    .digest("hex");

const buildPasswordHash = (password: string): string => {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, 64).toString("hex");
  return [PASSWORD_PREFIX, salt, derived].join(":");
};

const verifyPasswordHash = (password: string, encoded: string): boolean => {
  const [prefix, salt, expectedHex] = encoded.split(":");
  if (prefix !== PASSWORD_PREFIX || !salt || !expectedHex) return false;
  const actual = scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHex, "hex");
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(actual, expected);
};

const getSupabaseClient = () => {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
};

const getBearerToken = (req: FastifyRequest): string | null => {
  const authHeader = req.headers.authorization;
  return authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
};

export const createPasswordHash = (password: string): string => buildPasswordHash(password);

export const verifyPassword = (password: string, passwordHash: string): boolean =>
  verifyPasswordHash(password, passwordHash);

export const createSessionToken = (): string => randomBytes(32).toString("base64url");

export const createAuthSession = async (params: {
  userId: string;
  userAgent?: string | null;
  ttlDays?: number;
}) => {
  const token = createSessionToken();
  const expiresAt = new Date(Date.now() + (params.ttlDays ?? DEFAULT_SESSION_TTL_DAYS) * 24 * 60 * 60 * 1000);
  await prisma.authSession.create({
    data: {
      userId: params.userId,
      tokenHash: hashToken(token),
      userAgent: params.userAgent ?? undefined,
      expiresAt
    }
  });
  return { token, expiresAt };
};

export const revokeSession = async (token: string) => {
  await prisma.authSession.deleteMany({
    where: {
      tokenHash: hashToken(token)
    }
  });
};

const authenticateLocalSession = async (token: string): Promise<AuthUser | null> => {
  const session = await prisma.authSession.findFirst({
    where: {
      tokenHash: hashToken(token),
      expiresAt: { gt: new Date() }
    },
    include: { user: true }
  });

  if (!session?.user) return null;

  await prisma.authSession.update({
    where: { id: session.id },
    data: { lastUsedAt: new Date() }
  });

  return {
    id: session.user.id,
    email: session.user.email,
    displayName: session.user.displayName
  };
};

const authenticateSupabaseSession = async (token: string): Promise<AuthUser | null> => {
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return null;

  const email = data.user.email ? normalizeEmail(data.user.email) : "unknown";
  const user = await prisma.user.upsert({
    where: { id: data.user.id },
    update: {
      email,
      displayName:
        typeof data.user.user_metadata?.display_name === "string"
          ? data.user.user_metadata.display_name
          : undefined
    },
    create: {
      id: data.user.id,
      email,
      displayName:
        typeof data.user.user_metadata?.display_name === "string"
          ? data.user.user_metadata.display_name
          : undefined
    }
  });

  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName
  };
};

export const maybeAuthenticateRequest = async (req: FastifyRequest): Promise<AuthUser | null> => {
  const token = getBearerToken(req);

  if (!token) {
    if (process.env.ALLOW_DEV_AUTH === "true") {
      return {
        id: process.env.DEV_USER_ID ?? "00000000-0000-0000-0000-000000000000",
        email: normalizeEmail(process.env.DEV_USER_EMAIL ?? "dev@example.com"),
        displayName: process.env.DEV_USER_NAME ?? "Dev User"
      };
    }
    return null;
  }

  const localUser = await authenticateLocalSession(token);
  if (localUser) return localUser;

  const supabaseUser = await authenticateSupabaseSession(token);
  if (supabaseUser) return supabaseUser;

  if (process.env.ALLOW_DEV_AUTH === "true") {
    return {
      id: process.env.DEV_USER_ID ?? "00000000-0000-0000-0000-000000000000",
      email: normalizeEmail(process.env.DEV_USER_EMAIL ?? "dev@example.com"),
      displayName: process.env.DEV_USER_NAME ?? "Dev User"
    };
  }

  return null;
};

export const authenticateRequest = async (req: FastifyRequest): Promise<AuthUser> => {
  const user = await maybeAuthenticateRequest(req);
  if (!user) {
    throw new Error("Missing or invalid Authorization bearer token.");
  }
  return user;
};

export const normalizeAuthEmail = normalizeEmail;
