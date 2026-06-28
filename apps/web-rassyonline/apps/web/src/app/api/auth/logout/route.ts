import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/sessions";
import { deleteSessionToken } from "@/lib/auth/users";
import { redirectUrl } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  await deleteSessionToken(token);

  const response = NextResponse.redirect(redirectUrl(request.headers, request.url, "/"), { status: 303 });
  response.cookies.delete(SESSION_COOKIE);
  return response;
}
