import { NextResponse, type NextRequest } from "next/server";
import { getSessionFromRequest } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { getStudioSummary } from "@/lib/studio/data";
import {
  ensureWorkspaceRuns,
  ensureWorkspaceSessions,
  getOrCreateWorkspace,
  getWorkspaceBranch,
  parseOpenFiles
} from "@/lib/workspace/data";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { workspace, member } = await getOrCreateWorkspace(session.userId);
  const sessions = await ensureWorkspaceSessions(workspace.id, session.userId);
  const activeSession = sessions.find((item) => item.status === "Live") ?? sessions[0];

  if (!activeSession) {
    return NextResponse.json({ error: "No sessions available" }, { status: 500 });
  }

  const openFiles = parseOpenFiles(activeSession.openFilesJson);
  const activeFile = activeSession.activeFile ?? openFiles[0] ?? null;
  const normalizedOpenFiles =
    activeFile && !openFiles.includes(activeFile) ? [activeFile, ...openFiles] : openFiles;

  if (
    activeSession.activeFile !== activeFile ||
    !activeSession.openFilesJson ||
    normalizedOpenFiles !== openFiles
  ) {
    await prisma.workspaceSession.update({
      where: { id: activeSession.id },
      data: {
        activeFile,
        openFilesJson: JSON.stringify(normalizedOpenFiles)
      }
    });
  }

  const [runs, collaboratorCount, branch, studioProject] = await Promise.all([
    ensureWorkspaceRuns(workspace.id),
    prisma.workspaceMember.count({
      where: { workspaceId: workspace.id }
    }),
    getWorkspaceBranch(),
    getStudioSummary(workspace.id, session.userId)
  ]);

  return NextResponse.json({
    workspace: {
      id: workspace.id,
      slug: workspace.slug,
      name: workspace.name,
      repoRoot: workspace.repoRoot,
      branch,
      collaboratorCount
    },
    member: {
      role: member.role
    },
    sessions: sessions.map((item) => ({
      id: item.id,
      title: item.title,
      status: item.status,
      updatedAt: item.updatedAt.toISOString(),
      owner: item.owner ? { id: item.owner.id, username: item.owner.username } : null
    })),
    activeSessionId: activeSession.id,
    openFiles: normalizedOpenFiles,
    activeFile,
    runs: runs.map((run) => ({
      id: run.id,
      label: run.label,
      status: run.status
    })),
    studioProject
  });
}
