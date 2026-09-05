import { NextResponse } from "next/server";
import { getPublicBaseUrl } from "../../../../lib/request";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const base = await getPublicBaseUrl(request);
  // These are the public proxy routes. The legacy root mount names are not
  // guaranteed to be exposed by the reverse proxy.
  const mp3 = new URL("/api/radio/stream?quality=mp3", base).toString();
  const lossless = new URL("/api/radio/stream?quality=lossless", base).toString();
  const hires = process.env.NEXT_PUBLIC_STREAM_HIRES_URL?.trim() || "";
  const channels = [
    { id: "main", name: "Main Radio", nativeHighResOnly: false, available: true, outputs: [{ id: "main-mp3", label: "Universal MP3", url: mp3, mimeType: "audio/mpeg", codec: "mp3", compatibility: "universal" }] },
    { id: "studio-lossless", name: "Studio Lossless", nativeHighResOnly: false, available: true, outputs: [{ id: "studio-lossless", label: "Studio Lossless", url: lossless, mimeType: "audio/ogg", codec: "flac", compatibility: "lossless" }] },
    { id: "hires", name: "Hi-Res Radio", nativeHighResOnly: true, available: Boolean(hires), outputs: hires ? [{ id: "hires", label: "Native Hi-Res Lossless", url: hires, mimeType: "audio/ogg", codec: "flac", compatibility: "native-hi-res" }] : [] },
  ];
  return NextResponse.json({ station: { name: process.env.STATION_NAME?.trim() || "Mr Rassy Radio" }, channels, generatedAt: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
}
