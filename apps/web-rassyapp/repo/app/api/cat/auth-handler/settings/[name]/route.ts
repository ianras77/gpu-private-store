import { NextResponse, type NextRequest } from "next/server";
import { getSessionFromRequest, resolveEngineUserId } from "@/lib/auth/session";
import { fetchJson } from "@/lib/cat/client";

export async function GET(request: NextRequest, { params }: { params: { name: string } }) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const settingName = encodeURIComponent(params.name);
  const data = await fetchJson<unknown>(`/auth_handler/settings/${settingName}`, {
    method: "GET",
    token: session.engineJwt,
    userId: resolveEngineUserId(session),
    appUserId: session.userId
  });

  return NextResponse.json({ settings: data });
}

export async function PUT(request: NextRequest, { params }: { params: { name: string } }) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const settingName = encodeURIComponent(params.name);
  const data = await fetchJson<unknown>(`/auth_handler/settings/${settingName}`, {
    method: "PUT",
    token: session.engineJwt,
    userId: resolveEngineUserId(session),
    appUserId: session.userId,
    body: JSON.stringify(body)
  });

  return NextResponse.json({ settings: data });
}

