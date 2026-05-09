import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getSessionFromRequest } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { serializeRoutine } from "@/lib/agent-routines";

export const runtime = "nodejs";

const PatchRoutineSchema = z
  .object({
    name: z.string().min(1).max(140).optional(),
    description: z.string().min(1).max(500).optional(),
    status: z.enum(["Active", "Paused"]).optional(),
    triggerMode: z.enum(["Manual", "Scheduled"]).optional(),
    scheduleText: z.string().max(120).nullable().optional()
  })
  .refine((data) => Object.keys(data).length > 0, { message: "No changes" });

async function loadOwnedRoutine(userId: string, id: string) {
  return prisma.agentRoutine.findFirst({
    where: { id, userId },
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

export async function GET(request: NextRequest, context: { params: { id: string } }) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const routine = await loadOwnedRoutine(session.userId, context.params.id);
  if (!routine) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ routine: serializeRoutine(routine) });
}

export async function PATCH(request: NextRequest, context: { params: { id: string } }) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = PatchRoutineSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const existing = await prisma.agentRoutine.findFirst({
    where: { id: context.params.id, userId: session.userId }
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const routine = await prisma.agentRoutine.update({
    where: { id: existing.id },
    data: {
      ...parsed.data,
      scheduleText:
        parsed.data.triggerMode === "Manual"
          ? null
          : parsed.data.scheduleText ?? existing.scheduleText ?? null
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

export async function DELETE(request: NextRequest, context: { params: { id: string } }) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await prisma.agentRoutine.deleteMany({
    where: { id: context.params.id, userId: session.userId }
  });

  return NextResponse.json({ ok: true });
}
