import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
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
