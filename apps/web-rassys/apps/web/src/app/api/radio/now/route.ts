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
      // One stable contract for the live player: this route resolves embedded
      // or nearby art first and supplies the branded fallback only when needed.
      return NextResponse.json({ ...track, albumArtUrl: "/api/radio/artwork", hasArtwork: true });
    }
    return NextResponse.json(track ?? {});
  } catch {
    return NextResponse.json({ error: "radio_unavailable" }, { status: 502 });
  }
}
