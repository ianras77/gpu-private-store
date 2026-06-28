import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/sessions";
import { loginUser } from "@/lib/auth/users";
import { redirectUrl } from "@/lib/http";

export const dynamic = "force-dynamic";

async function readInput(request: NextRequest) {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return request.json();
  }
  const form = await request.formData();
  return {
    email: String(form.get("email") ?? ""),
    password: String(form.get("password") ?? "")
  };
}

export async function POST(request: NextRequest) {
  const input = await readInput(request);
  const wantsHtml = request.headers.get("content-type")?.includes("application/x-www-form-urlencoded");

  try {
    const session = await loginUser(input);
    const response = wantsHtml
      ? NextResponse.redirect(redirectUrl(request.headers, request.url, session.user.role === "admin" ? "/admin" : "/"), {
          status: 303
        })
      : NextResponse.json({ ok: true, user: session.user });

    response.cookies.set(SESSION_COOKIE, session.token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      expires: session.expiresAt,
      path: "/"
    });

    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid_credentials";
    if (wantsHtml) {
      return NextResponse.redirect(redirectUrl(request.headers, request.url, `/login?error=${encodeURIComponent(message)}`), {
        status: 303
      });
    }
    return NextResponse.json({ ok: false, error: message }, { status: 401 });
  }
}
