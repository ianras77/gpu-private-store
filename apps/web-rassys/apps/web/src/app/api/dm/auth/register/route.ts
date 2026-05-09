import { ZodError } from "zod";
import { NextResponse } from "next/server";
import { issueDmToken } from "../../../../../lib/dm/auth";
import { parseRegisterInput, recordDmAuthEvent, registerDmUser } from "../../../../../lib/dm/service";
import { rateLimit } from "../../../../../lib/rate-limit";
import { getClientIp } from "../../../../../lib/request";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const ip = await getClientIp();
  const limit = Number(process.env.DM_AUTH_RATE_LIMIT_COUNT ?? 12);
  const windowSeconds = Number(process.env.DM_AUTH_RATE_LIMIT_WINDOW_SECONDS ?? 60);
  const { allowed } = await rateLimit(`dm-auth:register:${ip}`, limit, windowSeconds);
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
    const parsed = parseRegisterInput(body);
    const user = await registerDmUser(parsed);
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
      eventType: "register",
      request,
      metadata: { method: "email_password" }
    });
    return NextResponse.json({ ok: true, user }, { status: 201 });
  } catch (error) {
    console.error("dm_register_failed", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    if (error instanceof ZodError) {
      return NextResponse.json({ error: "invalid", details: error.issues }, { status: 400 });
    }
    if (error instanceof Error && error.message === "email_in_use") {
      return NextResponse.json({ error: "email_in_use" }, { status: 409 });
    }
    return NextResponse.json({ error: "register_failed" }, { status: 500 });
  }
}
