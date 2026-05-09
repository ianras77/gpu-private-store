import { NextResponse, type NextRequest } from "next/server";
import { getSessionFromRequest, resolveEngineUserId } from "@/lib/auth/session";
import { fetchForm } from "@/lib/cat/client";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }

  const forward = new FormData();
  forward.append("file", file);

  const data = await fetchForm<Record<string, unknown>>("/plugins/upload", forward, {
    token: session.engineJwt,
    userId: resolveEngineUserId(session),
    appUserId: session.userId
  });

  return NextResponse.json(data);
}
