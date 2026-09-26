import { NextResponse } from "next/server";
import { enrichTrack, type LibraryTrack } from "../../../../lib/media-controller";
import { fetchRadio } from "../../../../lib/radio-api";
import { rateLimit } from "../../../../lib/rate-limit";
import { getClientIp } from "../../../../lib/request";

export async function GET() {
  const ip = await getClientIp();
  const { allowed } = await rateLimit(`rl:radio:now:${ip}`, 60, 60);
  if (!allowed) return NextResponse.json({ error: "rate limit" }, { status: 429 });
  try {
    const data = await fetchRadio<LibraryTrack | null>("/public/now");
    const track = enrichTrack(data);
    if (track) {
      const params = new URLSearchParams({
        title: track.title ?? "Current record",
        artist: track.artist ?? "Mr Rassy Radio"
      });
      // A track id is immutable for the library: point the browser at it
      // directly so the image is cached for the entire song and revisits.
      const albumArtUrl = track.hasArtwork
        ? `/api/library/tracks/${encodeURIComponent(track.id)}/artwork`
        : `/api/library/artwork/placeholder?${params.toString()}`;
      return NextResponse.json({ ...track, albumArtUrl, hasArtwork: true });
    }
    return NextResponse.json(track ?? {});
  } catch {
    return NextResponse.json({ error: "radio_unavailable" }, { status: 502 });
  }
}
