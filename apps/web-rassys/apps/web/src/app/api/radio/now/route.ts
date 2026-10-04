import { NextResponse } from "next/server";
import {
  enrichTrack,
  type LibraryTrack,
} from "../../../../lib/media-controller";
import { fetchRadio } from "../../../../lib/radio-api";
import { rateLimit } from "../../../../lib/rate-limit";
import { getClientIp } from "../../../../lib/request";

export async function GET() {
  const ip = await getClientIp();
  const { allowed } = await rateLimit(`rl:radio:now:${ip}`, 60, 60);
  if (!allowed)
    return NextResponse.json({ error: "rate limit" }, { status: 429 });
  try {
    const data = await fetchRadio<LibraryTrack | null>("/public/now");
    const track = enrichTrack(data);
    if (track) {
      const artworkParams = new URLSearchParams({
        trackId: track.id,
        title: track.title ?? "Current record",
        artist: track.artist ?? "Mr Rassy Radio",
      });
      // The quick current-track metadata may not yet know that an embedded or
      // nearby cover exists. Let the artwork route try the controller lookup
      // before it falls back to generated art, and key the URL by track so the
      // browser refreshes it when playback advances.
      const albumArtUrl = `/api/radio/artwork?${artworkParams.toString()}`;
      return NextResponse.json({ ...track, albumArtUrl, hasArtwork: true });
    }
    return NextResponse.json(track ?? {});
  } catch {
    return NextResponse.json({ error: "radio_unavailable" }, { status: 502 });
  }
}
