import "server-only";

import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { parseJwtClaims } from "@/lib/cat/identity";

const COOKIE_NAME = "console_session";
const SESSION_TTL_DAYS = 7;

function base64UrlEncode(buffer: Buffer) {
  return buffer.toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function signValue(value: string) {
  const signature = createHmac("sha256", env.appSessionSecret).update(value).digest();
  return base64UrlEncode(signature);
}

function safeCompare(a: string, b: string) {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

function parseSignedValue(raw?: string | null) {
  if (!raw) return null;
  const [value, signature] = raw.split(".");
  if (!value || !signature) return null;
  const expected = signValue(value);
  if (!safeCompare(signature, expected)) return null;
  return value;
}

export function getSessionCookieName() {
  return COOKIE_NAME;
}

export async function createSession(userId: string, engineJwt: string) {
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
  const session = await prisma.session.create({
    data: {
      userId,
      engineJwt,
      expiresAt
    }
  });
  const signed = `${session.id}.${signValue(session.id)}`;
  return { session, signed, expiresAt };
}

export async function revokeSession(sessionId: string) {
  await prisma.session.deleteMany({ where: { id: sessionId } });
}

export async function getSessionFromCookies() {
  const cookieStore = cookies();
  const raw = cookieStore.get(COOKIE_NAME)?.value;
  return getSessionFromRaw(raw);
}

export async function getSessionFromRequest(request: NextRequest) {
  const raw = request.cookies.get(COOKIE_NAME)?.value;
  return getSessionFromRaw(raw);
}

type SessionWithUser = {
  id: string;
  userId: string;
  engineJwt: string;
  user: {
    engineUserId: string | null;
  };
};

export function resolveEngineUserId(session: SessionWithUser) {
  const engineUserId = session.user.engineUserId?.trim();
  if (engineUserId) {
    return engineUserId;
  }
  const jwtUserId = parseJwtClaims(session.engineJwt).sub;
  if (jwtUserId) {
    return jwtUserId;
  }
  return `console-${session.userId}`;
}

async function getSessionFromRaw(raw?: string | null) {
  const sessionId = parseSignedValue(raw);
  if (!sessionId) return null;
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: { user: true }
  });
  if (!session) return null;
  if (session.expiresAt.getTime() < Date.now()) {
    await prisma.session.deleteMany({ where: { id: session.id } });
    return null;
  }

  const jwtClaims = parseJwtClaims(session.engineJwt);
  if (jwtClaims.exp && jwtClaims.exp * 1000 <= Date.now()) {
    await prisma.session.deleteMany({ where: { id: session.id } });
    return null;
  }

  if (!session.user.engineUserId) {
    const jwtUserId = jwtClaims.sub;
    if (jwtUserId) {
      await prisma.user
        .updateMany({
          where: { id: session.userId, engineUserId: null },
          data: { engineUserId: jwtUserId }
        })
        .catch(() => undefined);
      session.user.engineUserId = jwtUserId;
    }
  }

  return session;
}
