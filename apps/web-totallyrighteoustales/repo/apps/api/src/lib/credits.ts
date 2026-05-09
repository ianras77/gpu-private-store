import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

export async function grantCredits(
  userId: string,
  delta: number,
  type: string,
  meta?: Prisma.InputJsonValue
) {
  if (delta === 0) return { granted: false, delta: 0 };
  await prisma.$transaction([
    prisma.creditLedger.create({
      data: {
        userId,
        delta,
        type,
        metaJson: meta
      }
    }),
    prisma.user.update({
      where: { id: userId },
      data: { creditsTotal: { increment: delta } }
    })
  ]);
  return { granted: true, delta };
}

export async function grantCreditsWithDailyCap(params: {
  userId: string;
  delta: number;
  type: string;
  cap: number;
  meta?: Prisma.InputJsonValue;
}) {
  if (params.delta <= 0) return grantCredits(params.userId, params.delta, params.type, params.meta);
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const ledger = await prisma.creditLedger.aggregate({
    where: {
      userId: params.userId,
      type: params.type,
      createdAt: { gte: since }
    },
    _sum: { delta: true }
  });

  const used = ledger._sum.delta ?? 0;
  if (used >= params.cap) return { granted: false, delta: 0 };
  const allowed = Math.min(params.delta, params.cap - used);
  return grantCredits(params.userId, allowed, params.type, params.meta);
}
