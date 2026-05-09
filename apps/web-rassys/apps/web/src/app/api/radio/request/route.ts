import { NextResponse } from "next/server";
import { fetchRadio } from "../../../../lib/radio-api";
import { rateLimit } from "../../../../lib/rate-limit";
import { getClientIp } from "../../../../lib/request";
import { z } from "zod";

const bodySchema = z.object({ request: z.string().min(3).max(120) });

export async function POST(req: Request) {
  const ip = await getClientIp();
  const { allowed } = await rateLimit(`rl:radio:req:${ip}`, 8, 60);
  if (!allowed) return NextResponse.json({ error: "rate limit" }, { status: 429 });
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  try {
    await fetchRadio("/public/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(parsed.data)
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "radio_unavailable" }, { status: 502 });
  }
}
