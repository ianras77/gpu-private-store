import { NextResponse, type NextRequest } from "next/server";
import { getSessionFromRequest } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

async function authorizedRun(id: string, userId: string) {
  const run = await prisma.workflowRun.findUnique({ where: { id } });
  if (!run) return null;
  const member = await prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId: run.workspaceId, userId } } });
  return member ? run : null;
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const run = await authorizedRun(params.id, session.userId);
  if (!run) return NextResponse.json({ error: "Run not found" }, { status: 404 });
  return NextResponse.json({ run: { ...run, input: JSON.parse(run.inputJson), state: JSON.parse(run.stateJson) } });
}
