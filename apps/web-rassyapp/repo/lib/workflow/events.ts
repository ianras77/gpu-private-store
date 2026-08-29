import type { PrismaClient } from "@prisma/client";

export async function appendRunEvent(db: PrismaClient, runId: string, type: string, payload: unknown) {
  const latest = await db.workflowRunEvent.findFirst({ where: { runId }, orderBy: { sequence: "desc" }, select: { sequence: true } });
  return db.workflowRunEvent.create({ data: { runId, sequence: (latest?.sequence ?? 0) + 1, type, payloadJson: JSON.stringify(payload) } });
}

export async function listRunEvents(db: PrismaClient, runId: string) {
  const events = await db.workflowRunEvent.findMany({ where: { runId }, orderBy: { sequence: "asc" } });
  return events.map((event) => ({ ...event, payload: JSON.parse(event.payloadJson) as unknown }));
}
