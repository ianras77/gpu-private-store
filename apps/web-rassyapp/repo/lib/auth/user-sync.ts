import "server-only";

import { prisma } from "@/lib/db";

const MAX_USERNAME_LENGTH = 64;

function normalizeUsername(input: string | null | undefined) {
  const base = (input ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

  return base || "cat-user";
}

async function reserveUsername(baseInput: string, excludeUserId?: string) {
  const base = normalizeUsername(baseInput).slice(0, MAX_USERNAME_LENGTH);

  let attempt = 0;
  while (attempt < 100) {
    const suffix = attempt === 0 ? "" : `-${attempt + 1}`;
    const maxBaseLength = MAX_USERNAME_LENGTH - suffix.length;
    const candidate = `${base.slice(0, Math.max(1, maxBaseLength))}${suffix}`;

    const existing = await prisma.user.findUnique({ where: { username: candidate } });
    if (!existing || existing.id === excludeUserId) {
      return candidate;
    }

    attempt += 1;
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`.slice(0, MAX_USERNAME_LENGTH);
}

export async function upsertLocalUserFromEngine({
  engineUserId,
  username
}: {
  engineUserId: string;
  username?: string | null;
}) {
  const requestedUsername = normalizeUsername(username || `cat-${engineUserId.slice(0, 8)}`).slice(
    0,
    MAX_USERNAME_LENGTH
  );
  const existing = await prisma.user.findUnique({ where: { engineUserId } });
  const resolvedUsername = await reserveUsername(requestedUsername, existing?.id);

  if (existing) {
    return prisma.user.update({
      where: { id: existing.id },
      data: { username: resolvedUsername }
    });
  }

  const orphanWithSameUsername = await prisma.user.findUnique({
    where: { username: requestedUsername }
  });
  if (orphanWithSameUsername && !orphanWithSameUsername.engineUserId) {
    return prisma.user.update({
      where: { id: orphanWithSameUsername.id },
      data: { engineUserId, username: requestedUsername }
    });
  }

  return prisma.user.create({
    data: {
      engineUserId,
      username: resolvedUsername
    }
  });
}

export async function upsertLocalUserByUsername(username: string) {
  const normalized = normalizeUsername(username).slice(0, MAX_USERNAME_LENGTH);
  const existing = await prisma.user.findUnique({ where: { username: normalized } });
  if (existing) return existing;

  const resolvedUsername = await reserveUsername(normalized);
  return prisma.user.create({
    data: {
      username: resolvedUsername
    }
  });
}

export async function deleteLocalUserByEngineId(engineUserId: string) {
  await prisma.user.deleteMany({ where: { engineUserId } });
}

type MaybeCatUser = {
  id?: unknown;
  username?: unknown;
};

function asCatUser(value: unknown): MaybeCatUser | null {
  if (!value || typeof value !== "object") return null;
  return value as MaybeCatUser;
}

export async function syncCatUserPayload(payload: unknown) {
  const catUser = asCatUser(payload);
  const engineUserId = typeof catUser?.id === "string" ? catUser.id : null;
  if (!engineUserId) return null;

  const username = typeof catUser?.username === "string" ? catUser.username : null;
  return upsertLocalUserFromEngine({ engineUserId, username });
}

export async function syncCatUsersPayload(payload: unknown) {
  const raw = Array.isArray(payload)
    ? payload
    : payload && typeof payload === "object" && Array.isArray((payload as { users?: unknown[] }).users)
      ? (payload as { users: unknown[] }).users
      : [];

  for (const item of raw) {
    await syncCatUserPayload(item);
  }
}
