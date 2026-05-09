import { NextResponse } from "next/server";
import { fetchListeningRoom } from "../../../lib/media-controller";
import { getClientIp } from "../../../lib/request";
import { rateLimit } from "../../../lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const ip = await getClientIp();
  const { allowed } = await rateLimit(`rl:library:${ip}`, 40, 60);
  if (!allowed) {
    return NextResponse.json({ error: "rate_limit" }, { status: 429 });
  }

  try {
    const url = new URL(request.url);
    const q = url.searchParams.get("q")?.trim() || undefined;
    const limitRaw = url.searchParams.get("limit");
    const offsetRaw = url.searchParams.get("offset");
    const limit = limitRaw ? Number(limitRaw) : undefined;
    const offset = offsetRaw ? Number(offsetRaw) : undefined;

    const payload = await fetchListeningRoom({
      ...(q ? { q } : {}),
      ...(Number.isFinite(limit) ? { limit } : {}),
      ...(Number.isFinite(offset) ? { offset } : {})
    });

    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "no-store"
      }
    });
  } catch {
    return NextResponse.json({ error: "library_unavailable" }, { status: 502 });
  }
}
