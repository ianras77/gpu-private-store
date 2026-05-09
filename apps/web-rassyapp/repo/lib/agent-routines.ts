import "server-only";

import { prisma } from "@/lib/db";

type RoutineWithRelations = Awaited<ReturnType<typeof getRoutineRecord>>;

function parseJsonRecord(raw?: string | null) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

async function getRoutineRecord(routineId: string, userId: string) {
  return prisma.agentRoutine.findFirst({
    where: { id: routineId, userId },
    include: {
      session: true,
      sourceThread: true,
      runs: {
        orderBy: { createdAt: "desc" },
        take: 5
      }
    }
  });
}

export function parseRoutineContext(raw?: string | null) {
  return parseJsonRecord(raw);
}

export function serializeRoutine(routine: NonNullable<RoutineWithRelations>) {
  return {
    id: routine.id,
    kind: routine.kind,
    stageKey: routine.stageKey,
    agentKey: routine.agentKey,
    dependsOnRoutineId: routine.dependsOnRoutineId,
    status: routine.status,
    triggerMode: routine.triggerMode,
    scheduleText: routine.scheduleText,
    name: routine.name,
    description: routine.description,
    draftSlug: routine.draftSlug,
    promptBrief: routine.promptBrief,
    workspaceContext: parseRoutineContext(routine.workspaceContextJson),
    handoff: parseJsonRecord(routine.handoffJson),
    projectSnapshot: parseJsonRecord(routine.projectSnapshotJson),
    sourceThreadId: routine.sourceThreadId,
    sessionId: routine.sessionId,
    lastRunAt: routine.lastRunAt?.toISOString() ?? null,
    nextRunAt: routine.nextRunAt?.toISOString() ?? null,
    createdAt: routine.createdAt.toISOString(),
    updatedAt: routine.updatedAt.toISOString(),
    recentRuns: routine.runs.map((run) => ({
      id: run.id,
      status: run.status,
      stageStatus: run.stageStatus,
      trigger: run.trigger,
      outputText: run.outputText,
      errorText: run.errorText,
      handoff: parseJsonRecord(run.handoffJson),
      createdAt: run.createdAt.toISOString(),
      startedAt: run.startedAt.toISOString(),
      completedAt: run.completedAt?.toISOString() ?? null
    }))
  };
}

export async function listAgentRoutines(userId: string, workspaceId?: string | null) {
  const routines = await prisma.agentRoutine.findMany({
    where: {
      userId,
      ...(workspaceId ? { workspaceId } : {})
    },
    include: {
      session: true,
      sourceThread: true,
      runs: {
        orderBy: { createdAt: "desc" },
        take: 5
      }
    },
    orderBy: { updatedAt: "desc" }
  });

  return routines.map((routine) => serializeRoutine(routine));
}

export async function getAgentRoutine(userId: string, routineId: string) {
  const routine = await getRoutineRecord(routineId, userId);
  return routine ? serializeRoutine(routine) : null;
}
