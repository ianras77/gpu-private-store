import { fetchPodcastShow } from "../../../lib/media-controller";
import { getPublicBaseUrl } from "../../../lib/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const escapeXml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

const toAbsoluteUrl = (baseUrl: string, path: string) => {
  return new URL(path, baseUrl).toString();
};

const toEnclosureType = (episode: { format?: string }) => {
  const format = episode.format?.toLowerCase() ?? "";
  if (format.includes("mp4") || format.includes("m4a")) {
    return "audio/mp4";
  }
  return "audio/mpeg";
};

export async function GET(request: Request) {
  const payload = await fetchPodcastShow().catch(() => null);
  const baseUrl = await getPublicBaseUrl(request);
  const series = payload?.series ?? [];
  const episodes = series
    .flatMap((entry) =>
      entry.episodes.map((episode) => ({
        ...episode,
        seriesTitle: entry.title,
        seriesArtworkUrl: entry.artworkUrl,
      })),
    )
    .filter((episode) => episode.rssReady)
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

  const channelLink = toAbsoluteUrl(baseUrl, "/real-life-bedtime-stories");
  const feedUrl = toAbsoluteUrl(baseUrl, "/real-life-bedtime-stories/feed.xml");
  const imageUrl =
    series.find((entry) => entry.artworkUrl)?.artworkUrl
      ? toAbsoluteUrl(baseUrl, series.find((entry) => entry.artworkUrl)!.artworkUrl!)
      : null;

  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:atom="http://www.w3.org/2005/Atom">',
    "<channel>",
    `  <title>${escapeXml(payload?.show.title ?? "Real Life Bedtime Stories")}</title>`,
    `  <link>${escapeXml(channelLink)}</link>`,
    `  <language>en-us</language>`,
    `  <description>${escapeXml(payload?.show.description ?? "Bedtime stories from a local library.")}</description>`,
    `  <atom:link href="${escapeXml(feedUrl)}" rel="self" type="application/rss+xml" />`,
    `  <itunes:summary>${escapeXml(payload?.show.description ?? "Bedtime stories from a local library.")}</itunes:summary>`,
    `  <itunes:author>${escapeXml("Ian Rasmussen")}</itunes:author>`,
    `  <itunes:explicit>false</itunes:explicit>`,
    `  <itunes:type>episodic</itunes:type>`,
    `  <itunes:subtitle>${escapeXml(payload?.show.subtitle ?? "Books told softly, one chapter at a time.")}</itunes:subtitle>`,
    imageUrl ? `  <itunes:image href="${escapeXml(imageUrl)}" />` : null,
    ...episodes.map((episode) => {
      const enclosureUrl = toAbsoluteUrl(
        baseUrl,
        `/api/podcasts/episodes/${encodeURIComponent(episode.id)}/stream`,
      );
      const episodeImage = episode.artworkUrl
        ? toAbsoluteUrl(
            baseUrl,
            `/api/podcasts/episodes/${encodeURIComponent(episode.id)}/artwork`,
          )
        : episode.seriesArtworkUrl
          ? toAbsoluteUrl(baseUrl, episode.seriesArtworkUrl)
          : null;

      return [
        "  <item>",
        `    <title>${escapeXml(episode.title)}</title>`,
        `    <description>${escapeXml(episode.description ?? `${episode.seriesTitle} episode.`)}</description>`,
        `    <pubDate>${new Date(episode.publishedAt).toUTCString()}</pubDate>`,
        `    <guid>${escapeXml(enclosureUrl)}</guid>`,
        `    <link>${escapeXml(channelLink)}</link>`,
        `    <itunes:author>${escapeXml("Ian Rasmussen")}</itunes:author>`,
        `    <itunes:explicit>false</itunes:explicit>`,
        `    <itunes:episodeType>full</itunes:episodeType>`,
        episode.episodeNumber
          ? `    <itunes:episode>${escapeXml(String(episode.episodeNumber))}</itunes:episode>`
          : null,
        episode.seasonNumber
          ? `    <itunes:season>${escapeXml(String(episode.seasonNumber))}</itunes:season>`
          : null,
        `    <itunes:summary>${escapeXml(episode.description ?? `${episode.seriesTitle} episode.`)}</itunes:summary>`,
        episodeImage ? `    <itunes:image href="${escapeXml(episodeImage)}" />` : null,
        `    <enclosure url="${escapeXml(enclosureUrl)}" length="${escapeXml(String(episode.fileSize ?? 0))}" type="${escapeXml(toEnclosureType(episode))}" />`,
        "  </item>",
      ]
        .filter(Boolean)
        .join("\n");
    }),
    "</channel>",
    "</rss>",
  ]
    .filter(Boolean)
    .join("\n");

  return new Response(body, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
