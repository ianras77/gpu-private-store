import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/sessions";
import { getUserForSessionToken } from "@/lib/auth/users";
import { listRunEvents } from "@/lib/runs";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await getUserForSessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (!user) return NextResponse.json({ ok: false, error: "auth_required" }, { status: 401 });
  const after = Number(new URL(request.url).searchParams.get("after") ?? "0");
  if (!Number.isSafeInteger(after) || after < 0) return NextResponse.json({ ok: false, error: "invalid_cursor" }, { status: 400 });
  return NextResponse.json({ ok: true, events: await listRunEvents((await context.params).id, user.id, after) }, { headers: { "cache-control": "no-store" } });
}
