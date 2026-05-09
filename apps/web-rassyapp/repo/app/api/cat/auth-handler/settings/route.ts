import { NextResponse, type NextRequest } from "next/server";
import { getSessionFromRequest, resolveEngineUserId } from "@/lib/auth/session";
import { fetchJson } from "@/lib/cat/client";

export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const data = await fetchJson<unknown>("/auth_handler/settings", {
    method: "GET",
    token: session.engineJwt,
    userId: resolveEngineUserId(session),
    appUserId: session.userId
  });

  return NextResponse.json({ settings: data });
}

