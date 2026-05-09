import { NextResponse, type NextRequest } from "next/server";
import { getSessionFromRequest } from "@/lib/auth/session";
import { getStudioSummary } from "@/lib/studio/data";
import { getOrCreateWorkspace } from "@/lib/workspace/data";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { workspace } = await getOrCreateWorkspace(session.userId);
  const summary = await getStudioSummary(workspace.id, session.userId);
  return NextResponse.json({ project: summary });
}
