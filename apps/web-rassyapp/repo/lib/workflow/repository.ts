import type { PrismaClient } from "@prisma/client";

export async function claimWorkflowRun(db: PrismaClient, workerId: string, leaseMs = 60_000) {
  const now = new Date();
  const expires = new Date(now.getTime() + leaseMs);
  const candidate = await db.workflowRun.findFirst({ where: { status: "queued", OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lt: now } }] }, orderBy: { createdAt: "asc" } });
  if (!candidate) return null;
  const claimed = await db.workflowRun.updateMany({ where: { id: candidate.id, status: "queued", OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lt: now } }] }, data: { status: "running", leaseOwner: workerId, leaseExpiresAt: expires, startedAt: candidate.startedAt ?? now } });
  return claimed.count === 1 ? db.workflowRun.findUnique({ where: { id: candidate.id } }) : null;
}
