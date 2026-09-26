import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/sessions";
import { getUserForSessionToken } from "@/lib/auth/users";
import { getConversationForUser } from "@/lib/conversation-history";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await getUserForSessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (!user) return NextResponse.json({ ok: false, error: "auth_required" }, { status: 401 });
  const { id } = await context.params;
  const conversation = await getConversationForUser(id, user.id);
  if (!conversation) return NextResponse.json({ ok: false, error: "thread_not_found" }, { status: 404 });
  return NextResponse.json({ ok: true, ...conversation });
}
