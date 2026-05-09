import { proxyControllerMedia } from "../../../../../lib/proxy-media";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ mediaId: string }> },
) {
  const { mediaId } = await context.params;
  return proxyControllerMedia(
    request,
    `/public/photos/${encodeURIComponent(mediaId)}/file`,
  );
}

export async function HEAD(
  request: Request,
  context: { params: Promise<{ mediaId: string }> },
) {
  const { mediaId } = await context.params;
  return proxyControllerMedia(
    request,
    `/public/photos/${encodeURIComponent(mediaId)}/file`,
  );
}
