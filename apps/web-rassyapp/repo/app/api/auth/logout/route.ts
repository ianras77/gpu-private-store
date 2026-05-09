import { NextResponse, type NextRequest } from "next/server";
import { getSessionFromRequest, getSessionCookieName, revokeSession } from "@/lib/auth/session";

export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (session) {
    await revokeSession(session.id);
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(getSessionCookieName(), "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    expires: new Date(0),
    path: "/"
  });
  return response;
}
