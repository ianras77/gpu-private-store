import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const escapeXml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

const truncate = (value: string, max: number) => {
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
};

const wrapTitle = (value: string) => {
  const words = truncate(value, 54).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= 18) {
      current = next;
      continue;
    }

    if (current) {
      lines.push(current);
      current = word;
    } else {
      lines.push(word);
      current = "";
    }

    if (lines.length === 2) break;
  }

  if (lines.length < 2 && current) {
    lines.push(current);
  }

  return lines.slice(0, 2);
};

const hueFromSeed = (seed: string) => {
  let total = 0;
  for (let index = 0; index < seed.length; index += 1) {
    total = (total + seed.charCodeAt(index) * (index + 11)) % 360;
  }
  return total;
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const title = (url.searchParams.get("title") ?? "Legacy Selection").trim() || "Legacy Selection";
  const artist = (url.searchParams.get("artist") ?? "Mr Rassy Archive").trim() || "Mr Rassy Archive";

  const hue = hueFromSeed(`${title}:${artist}`);
  const accent = (hue + 52) % 360;
  const titleLines = wrapTitle(title).map(escapeXml);
  const artistLabel = escapeXml(truncate(artist, 42));

  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800" role="img" aria-label="${escapeXml(title)} by ${artistLabel}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="hsl(${hue} 70% 20%)" />
      <stop offset="100%" stop-color="hsl(${accent} 78% 13%)" />
    </linearGradient>
    <filter id="blur">
      <feGaussianBlur stdDeviation="18" />
    </filter>
  </defs>
  <rect width="800" height="800" fill="url(#bg)" />
  <circle cx="660" cy="126" r="144" fill="hsl(${accent} 88% 60%)" fill-opacity="0.28" filter="url(#blur)" />
  <circle cx="170" cy="696" r="210" fill="hsl(${hue} 82% 54%)" fill-opacity="0.24" filter="url(#blur)" />
  <rect x="48" y="48" width="704" height="704" rx="42" fill="#ffffff" fill-opacity="0.08" stroke="#ffffff" stroke-opacity="0.16" />
  <rect x="80" y="92" width="188" height="34" rx="17" fill="#ffffff" fill-opacity="0.12" />
  <text x="106" y="115" fill="#ffffff" fill-opacity="0.86" font-family="Georgia, serif" font-size="18" letter-spacing="0.18em">MR RASSY ARCHIVE</text>
  <text x="80" y="278" fill="#ffffff" font-family="Georgia, serif" font-size="76" font-weight="700">${titleLines[0] ?? "Legacy"}</text>
  ${titleLines[1] ? `<text x="80" y="360" fill="#ffffff" font-family="Georgia, serif" font-size="76" font-weight="700">${titleLines[1]}</text>` : ""}
  <text x="80" y="628" fill="#ffffff" fill-opacity="0.72" font-family="ui-monospace, monospace" font-size="22" letter-spacing="0.12em">LEGACY NOTE ARTWORK</text>
  <text x="80" y="684" fill="#ffffff" font-family="Georgia, serif" font-size="38">${artistLabel}</text>
</svg>`.trim();

  return new NextResponse(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
