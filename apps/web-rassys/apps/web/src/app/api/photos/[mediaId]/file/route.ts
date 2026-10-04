import { proxyControllerMedia } from "../../../../../lib/proxy-media";
import { limitPublicPhotoMedia } from "../../../../../lib/public-photo-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ mediaId: string }> },
) {
  const limited = await limitPublicPhotoMedia();
  if (limited) return limited;
  const { mediaId } = await context.params;
  return proxyControllerMedia(
    request,
    `/public/photos/${encodeURIComponent(mediaId)}/file`,
    { cacheControl: "public, max-age=300, stale-while-revalidate=3600" },
  );
}

export async function HEAD(
  request: Request,
  context: { params: Promise<{ mediaId: string }> },
) {
  const limited = await limitPublicPhotoMedia();
  if (limited)
    return new Response(null, {
      status: limited.status,
      headers: limited.headers,
    });
  const { mediaId } = await context.params;
  return proxyControllerMedia(
    request,
    `/public/photos/${encodeURIComponent(mediaId)}/file`,
    { cacheControl: "public, max-age=300, stale-while-revalidate=3600" },
  );
}
