import { NextResponse, type NextRequest } from "next/server";
import { getSessionFromRequest } from "@/lib/auth/session";
import { listPluginDrafts, loadPluginDraft, savePluginDraft } from "@/lib/cat/plugin-builder";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const slug = request.nextUrl.searchParams.get("slug");
  if (slug) {
    const draft = await loadPluginDraft(session.userId, slug);
    return NextResponse.json({ draft });
  }

  const drafts = await listPluginDrafts(session.userId);
  return NextResponse.json({ drafts });
}

export async function PUT(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const draft = await savePluginDraft(session.userId, body as Record<string, unknown>);
  return NextResponse.json({ draft });
}

