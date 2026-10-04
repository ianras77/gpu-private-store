import { NextResponse } from "next/server";
import { fetchPhotoShelf } from "../../../lib/media-controller";
import { getClientIp } from "../../../lib/request";
import { rateLimit } from "../../../lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const ip = await getClientIp();
  const { allowed } = await rateLimit(`rl:public-photos:${ip}`, 40, 60);
  if (!allowed) {
    return NextResponse.json({ error: "rate_limit" }, { status: 429 });
  }

  try {
    const url = new URL(request.url);
    const limitRaw = url.searchParams.get("limit");
    const limitValue = limitRaw ? Number(limitRaw) : 60;
    const limit = Number.isFinite(limitValue)
      ? Math.max(1, Math.min(120, Math.floor(limitValue)))
      : 60;
    const offsetRaw = url.searchParams.get("offset");
    const offsetValue = offsetRaw ? Number(offsetRaw) : 0;
    const offset = Number.isFinite(offsetValue)
      ? Math.max(0, Math.floor(offsetValue))
      : 0;
    const sourceRaw = url.searchParams.get("source");
    const source =
      sourceRaw === "immich" || sourceRaw === "local" ? sourceRaw : undefined;
    const payload = await fetchPhotoShelf({
      limit,
      offset,
      ...(source ? { source } : {}),
    });

    return NextResponse.json(payload ?? {}, {
      headers: {
        "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
      },
    });
  } catch {
    return NextResponse.json({ error: "photos_unavailable" }, { status: 502 });
  }
}
