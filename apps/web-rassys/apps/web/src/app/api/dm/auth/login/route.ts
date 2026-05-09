import { ZodError } from "zod";
import { NextResponse } from "next/server";
import { issueDmToken } from "../../../../../lib/dm/auth";
import { authenticateDmUser, parseLoginInput, recordDmAuthEvent } from "../../../../../lib/dm/service";
import { rateLimit } from "../../../../../lib/rate-limit";
import { getClientIp } from "../../../../../lib/request";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const ip = await getClientIp();
  const limit = Number(process.env.DM_AUTH_RATE_LIMIT_COUNT ?? 12);
  const windowSeconds = Number(process.env.DM_AUTH_RATE_LIMIT_WINDOW_SECONDS ?? 60);
  const { allowed } = await rateLimit(`dm-auth:login:${ip}`, limit, windowSeconds);
  if (!allowed) {
    return NextResponse.json(
      { error: "rate_limited", retryAfterSeconds: windowSeconds },
      { status: 429, headers: { "Retry-After": String(windowSeconds) } }
    );
  }

  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "invalid_json" }, { status: 400 });
    }
    const parsed = parseLoginInput(body);
    const user = await authenticateDmUser(parsed);
    if (!user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    await issueDmToken(
      {
        userId: user.id,
        email: user.email,
        displayName: user.displayName
      },
      request
    );
    await recordDmAuthEvent({
      userId: user.id,
      eventType: "login",
      request,
      metadata: { method: "email_password" }
    });

    return NextResponse.json({ ok: true, user });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: "invalid", details: error.issues }, { status: 400 });
    }
    return NextResponse.json({ error: "login_failed" }, { status: 500 });
  }
}
