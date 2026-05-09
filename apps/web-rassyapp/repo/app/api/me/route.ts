import { NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth/session";
import type { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ user: null }, { status: 401 });
  }

  return NextResponse.json({
    user: {
      id: session.user.id,
      username: session.user.username,
      engineUserId: session.user.engineUserId
    }
  });
}
