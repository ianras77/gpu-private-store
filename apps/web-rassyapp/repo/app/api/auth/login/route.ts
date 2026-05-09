import { NextResponse } from "next/server";
import { z } from "zod";
import { fetchCurrentUser, loginToCat } from "@/lib/cat/auth";
import { createSession, getSessionCookieName } from "@/lib/auth/session";
import { upsertLocalUserByUsername, upsertLocalUserFromEngine } from "@/lib/auth/user-sync";
import { parseJwtClaims } from "@/lib/cat/identity";

const LoginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1)
});

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = LoginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const { username, password } = parsed.data;

  let jwt: string;
  try {
    jwt = await loginToCat(username, password);
  } catch (error) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  let currentUser = null;
  try {
    currentUser = await fetchCurrentUser(jwt);
  } catch (error) {
    // If the instance blocks /users/me, proceed with username only.
  }

  const claims = parseJwtClaims(jwt);
  const engineUserId = currentUser?.id ?? claims.sub ?? null;
  const resolvedUsername = currentUser?.username ?? claims.username ?? username;

  const user = engineUserId
    ? await upsertLocalUserFromEngine({
        engineUserId,
        username: resolvedUsername
      })
    : await upsertLocalUserByUsername(resolvedUsername);

  const { signed, expiresAt } = await createSession(user.id, jwt);

  const response = NextResponse.json({
    ok: true,
    user: { id: user.id, username: user.username }
  });

  response.cookies.set(getSessionCookieName(), signed, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    expires: expiresAt,
    path: "/"
  });

  return response;
}
