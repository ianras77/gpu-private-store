import { NextResponse } from "next/server";
import { z } from "zod";
import { issueAdminToken } from "../../../../lib/admin-auth";
import { serverConfig } from "../../../../lib/server-config";
import { rateLimit } from "../../../../lib/rate-limit";
import { getClientIp } from "../../../../lib/request";

const bodySchema = z.object({
  username: z.string().min(1),
  password: z.string().min(4)
});

export async function POST(req: Request) {
  const ip = await getClientIp();
  const limit = Number(process.env.ADMIN_AUTH_RATE_LIMIT_COUNT ?? 10);
  const windowSeconds = Number(process.env.ADMIN_AUTH_RATE_LIMIT_WINDOW_SECONDS ?? 60);
  const { allowed } = await rateLimit(`admin-auth:login:${ip}`, limit, windowSeconds);
  if (!allowed) {
    return NextResponse.json(
      { error: "rate_limited", retryAfterSeconds: windowSeconds },
      { status: 429, headers: { "Retry-After": String(windowSeconds) } }
    );
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  if (
    !serverConfig.ADMIN_PASSWORD ||
    !serverConfig.ADMIN_JWT_SECRET ||
    parsed.data.username !== serverConfig.ADMIN_USERNAME ||
    parsed.data.password !== serverConfig.ADMIN_PASSWORD
  ) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  await issueAdminToken(parsed.data.username);
  return NextResponse.json({ ok: true });
}
