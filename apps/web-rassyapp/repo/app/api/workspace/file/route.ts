import { NextResponse, type NextRequest } from "next/server";
import { getSessionFromRequest } from "@/lib/auth/session";
import { readWorkspaceFile } from "@/lib/workspace/fs";

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

  try {
    const { content, truncated } = await readWorkspaceFile(path);
    return NextResponse.json({ path, content, truncated });
  } catch (error) {
    return NextResponse.json({ error: "Unable to read file" }, { status: 400 });
  }
}
