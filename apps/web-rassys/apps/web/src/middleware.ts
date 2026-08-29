import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const redirects: Record<string, string> = {
    "/radio": "/mr-rassy", "/listening-room": "/mr-rassy/library", "/radio/notes": "/mr-rassy/notes",
    "/mc": "/minecraft", "/real-life-bedtime-stories": "/stories", "/photos": "/family", "/thoughts": "/notebook",
  };
  const destination = redirects[request.nextUrl.pathname];
  if (destination) return NextResponse.redirect(new URL(destination, request.url), 308);
  if (request.headers.has("next-action")) {
    return new NextResponse(null, {
      status: 404,
      headers: {
        "Cache-Control": "no-store",
      },
    });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
