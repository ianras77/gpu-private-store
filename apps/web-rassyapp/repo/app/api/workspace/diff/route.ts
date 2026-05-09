import { NextResponse, type NextRequest } from "next/server";
import { getSessionFromRequest } from "@/lib/auth/session";
import { getFileDiff } from "@/lib/workspace/git";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const path = searchParams.get("path");
  if (!path) {
    return NextResponse.json({ error: "Missing path" }, { status: 400 });
  }
  if (path.includes("..") || path.startsWith("/") || path.startsWith("\\")) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  const diff = await getFileDiff(process.cwd(), path);
  const lines = diff.split("\n");
  const limited = lines.slice(0, 200).join("\n");
  return NextResponse.json({ path, diff: limited });
}
