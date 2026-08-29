import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/sessions";
import { getUserForSessionToken } from "@/lib/auth/users";
import { findThreadForUser, listMessagesForThread } from "@/lib/chat-store";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await getUserForSessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (!user) return NextResponse.json({ ok: false, error: "auth_required" }, { status: 401 });
  const { id } = await context.params;
  const thread = await findThreadForUser(id, user.id);
  if (!thread) return NextResponse.json({ ok: false, error: "thread_not_found" }, { status: 404 });
  return NextResponse.json({ ok: true, thread, messages: await listMessagesForThread(id, user.id) });
}
