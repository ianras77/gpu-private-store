import { NextResponse, type NextRequest } from "next/server";
import { getSessionFromRequest } from "@/lib/auth/session";
import { listWorkspaceFiles } from "@/lib/workspace/fs";
import { getGitStatusMap } from "@/lib/workspace/git";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [entries, statusMap] = await Promise.all([
    listWorkspaceFiles(),
    getGitStatusMap(process.cwd())
  ]);

  const payload = entries.map((entry) => ({
    ...entry,
    status: statusMap.get(entry.path) ?? "clean"
  }));

  return NextResponse.json({ entries: payload });
}
