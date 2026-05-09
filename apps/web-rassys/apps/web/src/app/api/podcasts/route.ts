import { NextResponse } from "next/server";
import { fetchPodcastShow } from "../../../lib/media-controller";
import { getClientIp } from "../../../lib/request";
import { rateLimit } from "../../../lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const ip = await getClientIp();
  const { allowed } = await rateLimit(`rl:podcasts:${ip}`, 30, 60);
  if (!allowed) {
    return NextResponse.json({ error: "rate_limit" }, { status: 429 });
  }

  try {
    const payload = await fetchPodcastShow();
    return NextResponse.json(payload ?? {}, {
      headers: {
        "Cache-Control": "no-store"
      }
    });
  } catch {
    return NextResponse.json({ error: "podcasts_unavailable" }, { status: 502 });
  }
}
