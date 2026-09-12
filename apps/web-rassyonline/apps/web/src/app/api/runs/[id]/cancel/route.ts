import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/sessions";
import { getUserForSessionToken } from "@/lib/auth/users";
import { cancelRun } from "@/lib/runs";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await getUserForSessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (!user) return NextResponse.json({ ok: false, error: "auth_required" }, { status: 401 });
  try {
    const run = await cancelRun((await context.params).id, user.id);
    return NextResponse.json({ ok: true, run }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const code = error instanceof Error ? error.message : "run_cancel_failed";
    return NextResponse.json({ ok: false, error: code }, { status: code === "run_not_found" ? 404 : 409 });
  }
}
