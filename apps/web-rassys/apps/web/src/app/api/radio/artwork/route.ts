import { type LibraryTrack } from "../../../../lib/media-controller";
import { proxyControllerMedia } from "../../../../lib/proxy-media";
import { fetchRadio } from "../../../../lib/radio-api";
import { fetchUpstream } from "../../../../lib/upstream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const baseHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "no-store",
  "X-Robots-Tag": "noindex",
};

const emptyArtwork = () =>
  new Response(null, {
    status: 204,
    headers: baseHeaders,
  });

const proxyArtwork = async (request: Request) => {
  try {
    const now = await fetchRadio<LibraryTrack | null>(
      "/public/now",
    );
    if (now?.id && now.hasArtwork) {
      return proxyControllerMedia(
        request,
        `/public/library/tracks/${encodeURIComponent(now.id)}/artwork`,
      );
    }

    const artworkUrl = now?.albumArtUrl?.trim();
    if (!artworkUrl) {
      const params = new URLSearchParams({ title: now?.title ?? "Current record", artist: now?.artist ?? "Mr Rassy Radio" });
      return new Response(null, {
        status: 302,
        headers: { ...baseHeaders, Location: `/api/library/artwork/placeholder?${params.toString()}` },
      });
    }

    const response = await fetchUpstream(
      artworkUrl,
      { method: request.method },
      {
        timeoutMs: Number(process.env.RADIO_ARTWORK_TIMEOUT_MS ?? 7000),
        retries: Number(process.env.RADIO_ARTWORK_RETRIES ?? 1),
        retryDelayMs: Number(process.env.RADIO_ARTWORK_RETRY_DELAY_MS ?? 250),
      },
    );

    const headers = new Headers(baseHeaders);
    const contentType = response.headers.get("content-type");
    const contentLength = response.headers.get("content-length");
    const lastModified = response.headers.get("last-modified");
    const etag = response.headers.get("etag");

    if (contentType) headers.set("Content-Type", contentType);
    if (contentLength) headers.set("Content-Length", contentLength);
    if (lastModified) headers.set("Last-Modified", lastModified);
    if (etag) headers.set("ETag", etag);

    if (request.method === "HEAD") {
      response.body?.cancel();
      return new Response(null, {
        status: response.status,
        headers,
      });
    }

    return new Response(response.body, {
      status: response.status,
      headers,
    });
  } catch {
    return emptyArtwork();
  }
};

export async function GET(request: Request) {
  return proxyArtwork(request);
}

export async function HEAD(request: Request) {
  return proxyArtwork(request);
}
