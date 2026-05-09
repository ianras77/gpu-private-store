import { NextResponse } from "next/server";
import { rateLimit } from "../../../../lib/rate-limit";
import { getClientIp } from "../../../../lib/request";
import { serverConfig } from "../../../../lib/server-config";

export async function GET() {
  const ip = await getClientIp();
  const { allowed } = await rateLimit(`rl:mc:events:${ip}`, 30, 60);
  if (!allowed) return NextResponse.json({ error: "rate limit" }, { status: 429 });

  const base = serverConfig.MINECRAFT_BRIDGE_URL.replace(/\/$/, "");
  const res = await fetch(`${base}/events`, { cache: "no-store" });
  if (!res.ok) {
    return NextResponse.json([]);
  }
  const data = await res.json();
  return NextResponse.json(data ?? []);
}
