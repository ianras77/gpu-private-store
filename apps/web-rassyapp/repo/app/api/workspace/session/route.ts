import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getSessionFromRequest } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { getOrCreateWorkspace } from "@/lib/workspace/data";

export const runtime = "nodejs";

const UpdateSchema = z.object({
  sessionId: z.string().min(1),
  activeFile: z.string().min(1).optional(),
  openFiles: z.array(z.string().min(1)).optional()
});

export async function PATCH(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const { sessionId, activeFile, openFiles } = parsed.data;
  const normalizedOpenFiles = openFiles ? Array.from(new Set(openFiles)).slice(0, 5) : undefined;
  const { workspace } = await getOrCreateWorkspace(session.userId);

  const target = await prisma.workspaceSession.findFirst({
    where: { id: sessionId, workspaceId: workspace.id }
  });

  if (!target) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  await prisma.workspaceSession.update({
    where: { id: target.id },
    data: {
      activeFile: activeFile ?? target.activeFile,
      openFilesJson: normalizedOpenFiles
        ? JSON.stringify(normalizedOpenFiles)
        : target.openFilesJson
    }
  });

  return NextResponse.json({ ok: true });
}
