import { NextResponse, type NextRequest } from "next/server";
import { getSessionFromRequest } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { listRunEvents } from "@/lib/workflow/events";

export const runtime = "nodejs";

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const run = await prisma.workflowRun.findUnique({ where: { id: params.id }, select: { id: true, workspaceId: true } });
  const member = run ? await prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId: run.workspaceId, userId: session.userId } } }) : null;
  if (!run || !member) return NextResponse.json({ error: "Run not found" }, { status: 404 });
  return NextResponse.json({ events: await listRunEvents(prisma, run.id) });
}
