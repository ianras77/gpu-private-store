import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/sessions";
import { getUserForSessionToken } from "@/lib/auth/users";
import { listConversationThreads } from "@/lib/conversation-history";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const user = await getUserForSessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (!user) {
    return NextResponse.json({ ok: true, threads: [] });
  }

  const threads = await listConversationThreads(user.id);
  return NextResponse.json({ ok: true, threads });
}
