import { proxyControllerMedia } from "../../../../../lib/proxy-media";
import { requireAdmin } from "../../../../../lib/admin-auth";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ mediaId: string }> },
) {
  if (!await requireAdmin()) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: { "Cache-Control": "private, no-store" } });
  const { mediaId } = await context.params;
  return proxyControllerMedia(
    request,
    `/public/photos/${encodeURIComponent(mediaId)}/preview`,
  );
}

export async function HEAD(
  request: Request,
  context: { params: Promise<{ mediaId: string }> },
) {
  if (!await requireAdmin()) return new NextResponse(null, { status: 401, headers: { "Cache-Control": "private, no-store" } });
  const { mediaId } = await context.params;
  return proxyControllerMedia(
    request,
    `/public/photos/${encodeURIComponent(mediaId)}/preview`,
  );
}
