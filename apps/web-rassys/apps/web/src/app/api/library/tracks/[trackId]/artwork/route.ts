import { proxyControllerMedia } from "../../../../../../lib/proxy-media";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ trackId: string }> }
) {
  const { trackId } = await context.params;
  return proxyControllerMedia(request, `/public/library/tracks/${encodeURIComponent(trackId)}/artwork`);
}

export async function HEAD(
  request: Request,
  context: { params: Promise<{ trackId: string }> }
) {
  const { trackId } = await context.params;
  return proxyControllerMedia(request, `/public/library/tracks/${encodeURIComponent(trackId)}/artwork`);
}
