import { prisma } from "@/lib/db";
import { getCurrentBranch } from "@/lib/workspace/git";

const DEFAULT_SLUG = "default";
const DEFAULT_NAME = "Launchpad Studio";
const DEFAULT_OPEN_FILES = [
  "app/page.tsx",
  "components/playground/chat-tab.tsx",
  "components/playground/personas-tab.tsx"
];

const DEFAULT_SESSIONS = [
  { title: "Game pitch", status: "Live" },
  { title: "Quest pass", status: "Idle" },
  { title: "Publish checklist", status: "Review" }
];

const DEFAULT_RUNS = [
  { label: "template-seed", status: "Queued" },
  { label: "build-kit-checks", status: "Running" },
  { label: "publish-readiness", status: "Passed" }
];

export async function getOrCreateWorkspace(userId: string) {
  let workspace = await prisma.workspace.findUnique({ where: { slug: DEFAULT_SLUG } });
  if (!workspace) {
    workspace = await prisma.workspace.create({
      data: {
        slug: DEFAULT_SLUG,
        name: DEFAULT_NAME,
        repoRoot: process.cwd()
      }
    });
  }

  let member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: workspace.id, userId } }
  });

  if (!member) {
    const memberCount = await prisma.workspaceMember.count({
      where: { workspaceId: workspace.id }
    });
    const role = memberCount === 0 ? "Owner" : "Member";
    member = await prisma.workspaceMember.create({
      data: {
        workspaceId: workspace.id,
        userId,
        role
      }
    });
  }

  return { workspace, member };
}

export async function ensureWorkspaceSessions(workspaceId: string, ownerId: string) {
  let sessions = await prisma.workspaceSession.findMany({
    where: { workspaceId },
    include: { owner: true },
    orderBy: { updatedAt: "desc" }
  });

  if (sessions.length === 0) {
    for (let index = 0; index < DEFAULT_SESSIONS.length; index += 1) {
      const template = DEFAULT_SESSIONS[index];
      const isPrimary = index === 0;
      const openFilesJson = isPrimary ? JSON.stringify(DEFAULT_OPEN_FILES) : null;
      const activeFile = isPrimary ? DEFAULT_OPEN_FILES[0] : null;

      await prisma.workspaceSession.create({
        data: {
          workspaceId,
          title: template.title,
          status: template.status,
          ownerId: ownerId,
          openFilesJson,
          activeFile
        }
      });
    }

    sessions = await prisma.workspaceSession.findMany({
      where: { workspaceId },
      include: { owner: true },
      orderBy: { updatedAt: "desc" }
    });
  }

  return sessions;
}

export async function ensureWorkspaceRuns(workspaceId: string) {
  let runs = await prisma.workspaceRun.findMany({
    where: { workspaceId },
    orderBy: { updatedAt: "desc" }
  });

  if (runs.length === 0) {
    for (const run of DEFAULT_RUNS) {
      await prisma.workspaceRun.create({
        data: {
          workspaceId,
          label: run.label,
          status: run.status
        }
      });
    }

    runs = await prisma.workspaceRun.findMany({
      where: { workspaceId },
      orderBy: { updatedAt: "desc" }
    });
  }

  return runs;
}

export function parseOpenFiles(raw?: string | null) {
  if (!raw) return [...DEFAULT_OPEN_FILES];
  try {
    const parsed = JSON.parse(raw) as string[];
    if (Array.isArray(parsed) && parsed.length) return parsed;
    return [...DEFAULT_OPEN_FILES];
  } catch (error) {
    return [...DEFAULT_OPEN_FILES];
  }
}

export async function getWorkspaceBranch() {
  return getCurrentBranch(process.cwd());
}
