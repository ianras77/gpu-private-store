import { proxyControllerMedia } from "../../../../../../lib/proxy-media";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ episodeId: string }> }
) {
  const { episodeId } = await context.params;
  return proxyControllerMedia(
    request,
    `/public/podcast-episodes/${encodeURIComponent(episodeId)}/artwork`
  );
}

export async function HEAD(
  request: Request,
  context: { params: Promise<{ episodeId: string }> }
) {
  const { episodeId } = await context.params;
  return proxyControllerMedia(
    request,
    `/public/podcast-episodes/${encodeURIComponent(episodeId)}/artwork`
  );
}
