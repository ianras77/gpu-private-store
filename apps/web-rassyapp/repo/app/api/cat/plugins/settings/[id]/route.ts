import { NextResponse, type NextRequest } from "next/server";
import { getSessionFromRequest, resolveEngineUserId } from "@/lib/auth/session";
import { fetchJson } from "@/lib/cat/client";

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const pluginId = encodeURIComponent(params.id);
    const data = await fetchJson<Record<string, unknown>>(`/plugins/settings/${pluginId}`, {
      method: "GET",
      token: session.engineJwt,
      userId: resolveEngineUserId(session),
      appUserId: session.userId
    });
    return NextResponse.json({ settings: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to read plugin settings";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  try {
    const pluginId = encodeURIComponent(params.id);
    const data = await fetchJson<Record<string, unknown>>(`/plugins/settings/${pluginId}`, {
      method: "PUT",
      token: session.engineJwt,
      userId: resolveEngineUserId(session),
      appUserId: session.userId,
      body: JSON.stringify(body)
    });
    return NextResponse.json({ settings: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update plugin settings";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

