import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/sessions";
import { getUserForSessionToken } from "@/lib/auth/users";
import { listThreadsForUser } from "@/lib/chat-store";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const user = await getUserForSessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (!user) {
    return NextResponse.json({ ok: true, threads: [] });
  }

  const threads = await listThreadsForUser(user.id);
  return NextResponse.json({ ok: true, threads });
}
