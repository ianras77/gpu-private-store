import { NextResponse } from "next/server";
import { fetchRadio } from "../../../../lib/radio-api";
import { rateLimit } from "../../../../lib/rate-limit";
import { getClientIp } from "../../../../lib/request";

export async function GET() {
  const ip = await getClientIp();
  const { allowed } = await rateLimit(`rl:radio:dj:${ip}`, 60, 60);
  if (!allowed) return NextResponse.json({ error: "rate limit" }, { status: 429 });
  try {
    const data = await fetchRadio("/public/dj");
    return NextResponse.json(data ?? {});
  } catch {
    return NextResponse.json({ error: "radio_unavailable" }, { status: 502 });
  }
}
