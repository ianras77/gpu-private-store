import { NextResponse, type NextRequest } from "next/server";
import { getSessionFromRequest, resolveEngineUserId } from "@/lib/auth/session";
import { fetchJson } from "@/lib/cat/client";

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const pluginId = encodeURIComponent(params.id);
  const data = await fetchJson<Record<string, unknown>>(`/plugins/${pluginId}`, {
    method: "GET",
    token: session.engineJwt,
    userId: resolveEngineUserId(session),
    appUserId: session.userId
  });

  return NextResponse.json(data);
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const pluginId = encodeURIComponent(params.id);
  const data = await fetchJson<Record<string, unknown>>(`/plugins/toggle/${pluginId}`, {
    method: "PUT",
    token: session.engineJwt,
    userId: resolveEngineUserId(session),
    appUserId: session.userId
  });

  return NextResponse.json(data);
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const pluginId = encodeURIComponent(params.id);
  const data = await fetchJson<Record<string, unknown>>(`/plugins/${pluginId}`, {
    method: "DELETE",
    token: session.engineJwt,
    userId: resolveEngineUserId(session),
    appUserId: session.userId
  });

  return NextResponse.json(data);
}
