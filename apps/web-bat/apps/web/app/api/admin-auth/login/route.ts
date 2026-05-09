import { NextRequest, NextResponse } from "next/server";

import { ADMIN_SESSION_COOKIE, buildAdminSessionToken, isValidAdminLogin, normalizeNextPath } from "@/lib/admin-auth";

export async function POST(request: NextRequest) {
  const payload = (await request.json().catch(() => null)) as
    | { username?: string; password?: string; next?: string }
    | null;

  const username = (payload?.username ?? "").trim();
  const password = payload?.password ?? "";
  const next = normalizeNextPath(payload?.next);

  if (!(await isValidAdminLogin(username, password))) {
    return NextResponse.json({ ok: false, error: "Invalid credentials." }, { status: 401 });
  }

  const token = await buildAdminSessionToken(username, password);
  const response = NextResponse.json({ ok: true, redirectTo: next });
  response.cookies.set({
    name: ADMIN_SESSION_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  return response;
}
