import { NextResponse } from "next/server";
import { fetchPhotoShelf } from "../../../lib/media-controller";
import { getClientIp } from "../../../lib/request";
import { rateLimit } from "../../../lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const ip = await getClientIp();
  const { allowed } = await rateLimit(`rl:photos:${ip}`, 40, 60);
  if (!allowed) {
    return NextResponse.json({ error: "rate_limit" }, { status: 429 });
  }

  try {
    const url = new URL(request.url);
    const limitRaw = url.searchParams.get("limit");
    const limit = limitRaw ? Number(limitRaw) : undefined;
    const sourceRaw = url.searchParams.get("source");
    const source =
      sourceRaw === "immich" || sourceRaw === "local" ? sourceRaw : undefined;
    const payload = await fetchPhotoShelf({
      ...(Number.isFinite(limit) ? { limit } : {}),
      ...(source ? { source } : {})
    });

    return NextResponse.json(payload ?? {}, {
      headers: {
        "Cache-Control": "no-store"
      }
    });
  } catch {
    return NextResponse.json({ error: "photos_unavailable" }, { status: 502 });
  }
}
