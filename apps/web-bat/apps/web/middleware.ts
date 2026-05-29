import { NextRequest, NextResponse } from "next/server";

import { ADMIN_SESSION_COOKIE, isValidAdminSession, normalizeNextPath } from "@/lib/admin-auth";

const SERVER_ACTION_HEADER = "next-action";

function isServerActionProbe(request: NextRequest) {
  return request.method === "POST" && request.headers.has(SERVER_ACTION_HEADER);
}

export async function middleware(request: NextRequest) {
  if (isServerActionProbe(request)) {
    return new NextResponse("Server actions are not enabled for BAT.", { status: 410 });
  }

  if (!request.nextUrl.pathname.startsWith("/admin")) {
    return NextResponse.next();
  }

  const token = request.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  if (await isValidAdminSession(token)) {
    return NextResponse.next();
  }

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/admin-login";
  loginUrl.searchParams.set("next", normalizeNextPath(`${request.nextUrl.pathname}${request.nextUrl.search}`));
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
