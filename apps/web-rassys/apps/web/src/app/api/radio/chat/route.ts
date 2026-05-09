import { NextResponse } from "next/server";
import { z } from "zod";
import { fetchRadio } from "../../../../lib/radio-api";
import { rateLimit } from "../../../../lib/rate-limit";
import { getClientIp } from "../../../../lib/request";

const bodySchema = z.object({
  message: z.string().min(2).max(360),
  clientId: z.string().min(8).max(120).optional(),
  requestId: z.string().min(8).max(120).optional()
});

const querySchema = z.object({
  clientId: z.string().min(8).max(120).optional()
});

export async function GET(request: Request) {
  const ip = await getClientIp();
  const { allowed } = await rateLimit(`rl:radio:chat:get:${ip}`, 30, 60);
  if (!allowed) return NextResponse.json({ error: "rate limit" }, { status: 429 });

  const parsed = querySchema.safeParse({
    clientId: new URL(request.url).searchParams.get("clientId") ?? undefined
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  try {
    const query = parsed.data.clientId
      ? `?clientId=${encodeURIComponent(parsed.data.clientId)}`
      : "";
    const data = await fetchRadio(`/public/chat${query}`);
    return NextResponse.json(data ?? { messages: [] });
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

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  try {
    const data = await fetchRadio("/public/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(parsed.data)
    }, {
      retries: 0,
      timeoutMs: Number(process.env.RADIO_CHAT_TIMEOUT_MS ?? 20000),
      retryDelayMs: 0
    });
    return NextResponse.json(data ?? { ok: true });
  } catch {
    return NextResponse.json({ error: "radio_unavailable" }, { status: 502 });
  }
}
