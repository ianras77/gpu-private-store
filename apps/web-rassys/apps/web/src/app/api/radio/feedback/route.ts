import { NextResponse } from "next/server";
import { fetchRadio } from "../../../../lib/radio-api";
import { rateLimit } from "../../../../lib/rate-limit";
import { getClientIp } from "../../../../lib/request";
import { z } from "zod";

const bodySchema = z.object({
  vote: z.enum(["up", "down"]),
  trackId: z.string().optional(),
  title: z.string().optional(),
  artist: z.string().optional()
});

export async function POST(request: Request) {
  const ip = await getClientIp();
  const { allowed } = await rateLimit(`rl:radio:feedback:${ip}`, 12, 60);
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
    await fetchRadio("/public/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(parsed.data)
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "radio_unavailable" }, { status: 502 });
  }
}

export async function GET(request: Request) {
  const ip = await getClientIp();
  const { allowed } = await rateLimit(`rl:radio:feedback:get:${ip}`, 20, 60);
  if (!allowed) return NextResponse.json({ error: "rate limit" }, { status: 429 });
  const { searchParams } = new URL(request.url);
  const trackId = searchParams.get("trackId");
  if (!trackId) {
    return NextResponse.json({ error: "missing trackId" }, { status: 400 });
  }
  try {
    const data = await fetchRadio(`/public/feedback?trackId=${encodeURIComponent(trackId)}`);
    return NextResponse.json(data ?? {});
  } catch {
    return NextResponse.json({ error: "radio_unavailable" }, { status: 502 });
  }
}
