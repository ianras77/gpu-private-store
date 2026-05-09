import { fetchRadio } from "../../../../lib/radio-api";
import { getPublicBaseUrl } from "../../../../lib/request";

const stationName = process.env.STATION_NAME?.trim() || "Mr Rassy Radio";
const stationDescription =
  process.env.STATION_DESCRIPTION?.trim() ||
  "Mr Rassy Radio live stream for Volumio, VLC, Sonos, and other web radio players.";

const isPublicAbsoluteUrl = (value?: string | null) => {
  if (!value) return false;
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    if (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "::1"
    )
      return false;
    if (hostname.endsWith(".local") || hostname.endsWith(".internal"))
      return false;
    return true;
  } catch {
    return false;
  }
};

const resolveConfiguredPublicStream = (
  value: string | undefined,
  publicBaseUrl: string,
) => {
  if (!value) return "";
  if (isPublicAbsoluteUrl(value)) return value;
  if (/^[a-z][a-z\d+.-]*:\/\//i.test(value)) return "";
  try {
    return new URL(value, publicBaseUrl).toString();
  } catch {
    return "";
  }
};

const buildPublicIcecastMountUrl = (quality: "mp3" | "lossless") => {
  const configuredIcecastBase = process.env.ICECAST_PUBLIC_URL?.trim();
  if (!configuredIcecastBase || !isPublicAbsoluteUrl(configuredIcecastBase)) {
    return "";
  }

  try {
    return new URL(
      quality === "lossless" ? "/live-lossless.ogg" : "/live.mp3",
      configuredIcecastBase,
    ).toString();
  } catch {
    return "";
  }
};

const buildPublicStreamUrl = async (
  request: Request,
  quality: "mp3" | "lossless",
) => {
  const publicBaseUrl = await getPublicBaseUrl(request);
  const configuredStream = process.env.NEXT_PUBLIC_STREAM_URL?.trim();
  const configuredLosslessStream =
    process.env.NEXT_PUBLIC_STREAM_LOSSLESS_URL?.trim();

  if (quality === "lossless") {
    const publicLosslessStream = resolveConfiguredPublicStream(
      configuredLosslessStream,
      publicBaseUrl,
    );
    const publicIcecastLossless = buildPublicIcecastMountUrl("lossless");
    return (
      publicLosslessStream ||
      publicIcecastLossless ||
      new URL("/api/radio/stream?quality=lossless", publicBaseUrl).toString()
    );
  }

  const publicStream = resolveConfiguredPublicStream(
    configuredStream,
    publicBaseUrl,
  );
  if (publicStream) {
    return publicStream;
  }

  const publicIcecastStream = buildPublicIcecastMountUrl("mp3");
  if (publicIcecastStream) {
    return publicIcecastStream;
  }

  return new URL("/api/radio/stream?quality=mp3", publicBaseUrl).toString();
};

const buildPublicArtworkUrl = async (request: Request) =>
  new URL("/api/radio/artwork", await getPublicBaseUrl(request)).toString();

const escapeM3uAttribute = (value: string) => value.replace(/"/g, "'");

const escapeXml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const formatParam = requestUrl.searchParams.get("format")?.toLowerCase();
  const qualityParam = requestUrl.searchParams.get("quality")?.toLowerCase();
  const format =
    formatParam === "pls" ? "pls" : formatParam === "xspf" ? "xspf" : "m3u";
  const quality = qualityParam === "lossless" ? "lossless" : "mp3";
  const streamUrl = await buildPublicStreamUrl(request, quality);
  const artworkUrl = await buildPublicArtworkUrl(request);

  let trackLabel = stationName;
  try {
    const now = await fetchRadio<{ title?: string; artist?: string }>(
      "/public/now",
    );
    const title = now?.title?.trim();
    const artist = now?.artist?.trim();
    if (title) {
      trackLabel = artist ? `${artist} - ${title}` : title;
    }
  } catch {
    // Fall back to the station title when the controller is unavailable.
  }

  if (format === "xspf") {
    const body = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<playlist version="1" xmlns="http://xspf.org/ns/0/">',
      `  <title>${escapeXml(stationName)}</title>`,
      `  <annotation>${escapeXml(stationDescription)}</annotation>`,
      "  <trackList>",
      "    <track>",
      `      <location>${escapeXml(streamUrl)}</location>`,
      `      <title>${escapeXml(trackLabel)}</title>`,
      `      <annotation>${escapeXml(stationDescription)}</annotation>`,
      `      <image>${escapeXml(artworkUrl)}</image>`,
      "    </track>",
      "  </trackList>",
      "</playlist>",
    ].join("\n");

    return new Response(body, {
      headers: {
        "Content-Type": "application/xspf+xml; charset=utf-8",
        "Content-Disposition": `inline; filename="mr-rassy-live-radio-${quality}.xspf"`,
        "Cache-Control": "public, max-age=60",
        "X-Robots-Tag": "noindex",
      },
    });
  }

  if (format === "pls") {
    const body = [
      "[playlist]",
      "NumberOfEntries=1",
      `File1=${streamUrl}`,
      `Title1=${trackLabel}`,
      `Image1=${artworkUrl}`,
      "Length1=-1",
      "Version=2",
    ].join("\n");

    return new Response(body, {
      headers: {
        "Content-Type": "audio/x-scpls; charset=utf-8",
        "Content-Disposition": `inline; filename="mr-rassy-live-radio-${quality}.pls"`,
        "Cache-Control": "public, max-age=300",
        "X-Robots-Tag": "noindex",
      },
    });
  }

  const body = [
    "#EXTM3U",
    "#EXTENC:utf-8",
    `#EXTINF:-1 tvg-name="${escapeM3uAttribute(stationName)}" tvg-id="mr-rassy-live-radio" tvg-logo="${escapeM3uAttribute(artworkUrl)}" group-title="Mr Rassy Radio",${trackLabel}`,
    `#PLAYLIST:${stationDescription}`,
    `#EXTIMG:${artworkUrl}`,
    streamUrl,
  ].join("\n");

  return new Response(body, {
      headers: {
        "Content-Type": "audio/x-mpegurl; charset=utf-8",
        "Content-Disposition": `inline; filename="mr-rassy-live-radio-${quality}.m3u"`,
        "Cache-Control": "public, max-age=300",
        "X-Robots-Tag": "noindex",
      },
  });
}
