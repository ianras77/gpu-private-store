import { NextRequest, NextResponse } from "next/server";
import { registerUser, loginUser } from "@/lib/auth/users";
import { SESSION_COOKIE } from "@/lib/auth/sessions";
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
    password: String(form.get("password") ?? ""),
    name: String(form.get("name") ?? "")
  };
}

export async function POST(request: NextRequest) {
  const input = await readInput(request);
  const wantsHtml = request.headers.get("content-type")?.includes("application/x-www-form-urlencoded");

  try {
    const user = await registerUser(input);
    const session = await loginUser(input);
    const response = wantsHtml
      ? NextResponse.redirect(redirectUrl(request.headers, request.url, user.role === "admin" ? "/admin" : "/"), {
          status: 303
        })
      : NextResponse.json({ ok: true, user });

    response.cookies.set(SESSION_COOKIE, session.token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      expires: session.expiresAt,
      path: "/"
    });

    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "registration_failed";
    if (wantsHtml) {
      return NextResponse.redirect(redirectUrl(request.headers, request.url, `/login?error=${encodeURIComponent(message)}`), {
        status: 303
      });
    }
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
