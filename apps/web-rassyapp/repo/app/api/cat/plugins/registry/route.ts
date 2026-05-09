import { NextResponse, type NextRequest } from "next/server";
import { getSessionFromRequest, resolveEngineUserId } from "@/lib/auth/session";
import { fetchJson } from "@/lib/cat/client";

export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
  if (typeof (body as { url?: unknown }).url !== "string") {
    return NextResponse.json({ error: "Missing plugin registry URL" }, { status: 400 });
  }

  try {
    const data = await fetchJson<Record<string, unknown>>("/plugins/upload/registry", {
      method: "POST",
      token: session.engineJwt,
      userId: resolveEngineUserId(session),
      appUserId: session.userId,
      body: JSON.stringify(body)
    });
    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to install plugin";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

