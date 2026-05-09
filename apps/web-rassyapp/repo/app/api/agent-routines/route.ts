import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getSessionFromRequest } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { listAgentRoutines, serializeRoutine } from "@/lib/agent-routines";
import { getOrCreateWorkspace } from "@/lib/workspace/data";

export const runtime = "nodejs";

const CreateRoutineSchema = z.object({
  name: z.string().min(1).max(140),
  description: z.string().min(1).max(500),
  kind: z.enum(["skill", "workflow", "loop"]),
  promptBrief: z.string().min(1).max(20_000),
  draftSlug: z.string().max(160).optional(),
  stageKey: z.string().max(80).nullable().optional(),
  agentKey: z.string().max(80).nullable().optional(),
  dependsOnRoutineId: z.string().nullable().optional(),
  status: z.enum(["Active", "Paused"]).optional(),
  triggerMode: z.enum(["Manual", "Scheduled"]).optional(),
  scheduleText: z.string().max(120).nullable().optional(),
  workspaceId: z.string().optional(),
  sessionId: z.string().nullable().optional(),
  sourceThreadId: z.string().nullable().optional(),
  workspaceContext: z.record(z.unknown()).optional(),
  handoff: z.record(z.unknown()).nullable().optional(),
  projectSnapshot: z.record(z.unknown()).nullable().optional()
});

export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const requestedWorkspaceId = request.nextUrl.searchParams.get("workspaceId");
  const { workspace } = await getOrCreateWorkspace(session.userId);
  const workspaceId = requestedWorkspaceId || workspace.id;

  const routines = await listAgentRoutines(session.userId, workspaceId);
  return NextResponse.json({ routines });
}

export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = CreateRoutineSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const { workspace } = await getOrCreateWorkspace(session.userId);
  const workspaceId = parsed.data.workspaceId ?? workspace.id;

  const membership = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: session.userId } }
  });
  if (!membership) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  const sessionRecord = parsed.data.sessionId
    ? await prisma.workspaceSession.findFirst({
        where: { id: parsed.data.sessionId, workspaceId }
      })
    : null;
  const sourceThread = parsed.data.sourceThreadId
    ? await prisma.chatThread.findFirst({
        where: { id: parsed.data.sourceThreadId, userId: session.userId }
      })
    : null;

  const routine = await prisma.agentRoutine.create({
    data: {
      userId: session.userId,
      workspaceId,
      sessionId: sessionRecord?.id ?? null,
      sourceThreadId: sourceThread?.id ?? null,
      kind: parsed.data.kind,
      stageKey: parsed.data.stageKey ?? null,
      agentKey: parsed.data.agentKey ?? null,
      dependsOnRoutineId: parsed.data.dependsOnRoutineId ?? null,
      status: parsed.data.status ?? "Active",
      triggerMode: parsed.data.triggerMode ?? "Manual",
      scheduleText: parsed.data.scheduleText ?? null,
      name: parsed.data.name,
      description: parsed.data.description,
      draftSlug: parsed.data.draftSlug ?? null,
      promptBrief: parsed.data.promptBrief,
      workspaceContextJson: parsed.data.workspaceContext
        ? JSON.stringify(parsed.data.workspaceContext)
        : null,
      handoffJson: parsed.data.handoff ? JSON.stringify(parsed.data.handoff) : null,
      projectSnapshotJson: parsed.data.projectSnapshot
        ? JSON.stringify(parsed.data.projectSnapshot)
        : null
    },
    include: {
      session: true,
      sourceThread: true,
      runs: {
        orderBy: { createdAt: "desc" },
        take: 5
      }
    }
  });

  return NextResponse.json({ routine: serializeRoutine(routine) });
}
