import { NextResponse } from "next/server";
import { z } from "zod";
import { fetchRadio } from "../../../../lib/radio-api";
import { rateLimit } from "../../../../lib/rate-limit";
import { getClientIp } from "../../../../lib/request";
import { cookies } from "next/headers";
import { createRadioChatIdentity, readRadioChatIdentity, RADIO_CHAT_COOKIE } from "../../../../lib/radio-chat-identity";

const bodySchema = z.object({
  message: z.string().min(2).max(360),
  requestId: z.string().min(8).max(120).optional()
});

async function visitor() {
  const existing = readRadioChatIdentity((await cookies()).get(RADIO_CHAT_COOKIE)?.value);
  return existing ? { id: existing, cookie: null } : createRadioChatIdentity();
}

function respond(data: unknown, identity: { id: string; cookie: string | null }, status = 200) {
  const response = NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
  if (identity.cookie) response.cookies.set(RADIO_CHAT_COOKIE, identity.cookie, {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 90
  });
  return response;
}

export async function GET(request: Request) {
  const ip = await getClientIp();
  const { allowed } = await rateLimit(`rl:radio:chat:get:${ip}`, 30, 60);
  if (!allowed) return NextResponse.json({ error: "rate limit" }, { status: 429 });

  if (new URL(request.url).searchParams.has("clientId")) return NextResponse.json({ error: "client_id_not_allowed" }, { status: 400 });

  try {
    const identity = await visitor();
    const data = await fetchRadio(`/public/chat?clientId=${encodeURIComponent(identity.id)}`);
    return respond(data ?? { messages: [] }, identity);
  } catch {
    return NextResponse.json({ error: "radio_unavailable" }, { status: 502 });
  }
}

export async function POST(request: Request) {
  const ip = await getClientIp();
  const { allowed } = await rateLimit(`rl:radio:chat:post:${ip}`, 8, 60);
  if (!allowed) return NextResponse.json({ error: "rate limit" }, { status: 429 });

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (Object.prototype.hasOwnProperty.call(body, "clientId")) {
    return NextResponse.json({ error: "client_id_not_allowed" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  try {
    const identity = await visitor();
    const data = await fetchRadio("/public/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: parsed.data.message,
        clientId: identity.id,
        requestId: parsed.data.requestId ? `${identity.id}:${parsed.data.requestId.slice(0, 72)}` : undefined
      })
    }, {
      retries: 0,
      timeoutMs: Number(process.env.RADIO_CHAT_TIMEOUT_MS ?? 20000),
      retryDelayMs: 0
    });
    return respond(data ?? { ok: true }, identity, data?.pending ? 202 : 200);
  } catch {
    return NextResponse.json({ error: "radio_unavailable" }, { status: 502 });
  }
}
