import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getSessionFromRequest } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { getOrCreateWorkspace } from "@/lib/workspace/data";

export const runtime = "nodejs";

const PresenceSchema = z.object({
  status: z.string().min(1).optional()
});

export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { workspace } = await getOrCreateWorkspace(session.userId);
  const cutoff = new Date(Date.now() - 2 * 60 * 1000);

  const presences = await prisma.workspacePresence.findMany({
    where: {
      workspaceId: workspace.id,
      lastSeenAt: { gte: cutoff }
    },
    include: { user: true },
    orderBy: { lastSeenAt: "desc" }
  });

  const members = await prisma.workspaceMember.findMany({
    where: { workspaceId: workspace.id }
  });

  const roleByUser = new Map(members.map((member) => [member.userId, member.role]));

  return NextResponse.json({
    presences: presences.map((presence) => ({
      id: presence.id,
      userId: presence.userId,
      name: presence.user.username ?? "(unnamed)",
      role: roleByUser.get(presence.userId) ?? "Member",
      status: presence.status,
      lastSeenAt: presence.lastSeenAt.toISOString()
    }))
  });
}

export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = PresenceSchema.safeParse(body);
  const status = parsed.success && parsed.data.status ? parsed.data.status : "Editing";

  const { workspace } = await getOrCreateWorkspace(session.userId);

  const presence = await prisma.workspacePresence.upsert({
    where: { workspaceId_userId: { workspaceId: workspace.id, userId: session.userId } },
    update: { status, lastSeenAt: new Date() },
    create: {
      workspaceId: workspace.id,
      userId: session.userId,
      status,
      lastSeenAt: new Date()
    }
  });

  return NextResponse.json({
    id: presence.id,
    status: presence.status,
    lastSeenAt: presence.lastSeenAt.toISOString()
  });
}
