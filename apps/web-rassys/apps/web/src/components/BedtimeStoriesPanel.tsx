"use client";

import useSWR from "swr";
import { AudioShelfPlayer, type AudioShelfSection } from "./AudioShelfPlayer";
import { type PodcastShowPayload } from "../lib/media-controller";

const fetcher = (url: string) =>
  fetch(url, { cache: "no-store" }).then(async (res) => {
    if (!res.ok) {
      throw new Error(`podcast_fetch_failed_${res.status}`);
    }
    return res.json();
  });

const formatDuration = (seconds?: number) => {
  if (!seconds || seconds <= 0) return null;
  const minutes = Math.round(seconds / 60);
  return `${minutes} min`;
};

export function BedtimeStoriesPanel() {
  const { data, error } = useSWR<PodcastShowPayload>("/api/podcasts", fetcher, {
    refreshInterval: 30000,
  });

  const series = Array.isArray(data?.series) ? data.series : [];

  const sections: AudioShelfSection[] = series.map((entry) => ({
    id: entry.id,
    label: entry.title,
    title: entry.title,
    description:
      entry.description ||
      `${entry.episodeCount} chapters threaded into one quiet, playable series.`,
    items: entry.episodes.map((episode) => ({
      id: episode.id,
      title: episode.title,
      subtitle: entry.title,
      description:
        episode.description ||
        "A recorded chapter from the bedtime shelf, ready to play here.",
      streamUrl: episode.streamUrl,
      artworkUrl: episode.artworkUrl || entry.artworkUrl,
      meta: [
        episode.episodeNumber
          ? `Episode ${String(episode.episodeNumber).padStart(2, "0")}`
          : null,
        formatDuration(episode.duration),
        episode.qualityLabel,
      ]
        .filter(Boolean)
        .join(" · "),
      badges: [
        "Episode",
        episode.rssReady ? "RSS-ready" : null,
        episode.qualityLabel,
      ]
        .filter(Boolean)
        .slice(0, 3) as string[],
    })),
  }));

  return (
    <section id="story-shelf" className="mx-auto max-w-6xl px-6 pb-12">
      <div className="space-y-6">
      {error ? (
        <div className="rave-panel rounded-[24px] border border-comet/30 px-4 py-3 text-sm text-cloud/78">
          The bedtime shelf is still catching up. If I just changed the folders,
          give it a minute.
        </div>
      ) : null}

      <AudioShelfPlayer
        eyebrow="Bedtime Stories"
        title="Quiet chapters, kept together"
        description="Every chapter can play here, and the ones ready for podcast apps flow into the feed too."
        sections={sections}
        emptyState="No bedtime stories have landed here yet. Add folders under /media/data/podcasts and they will show up on the next refresh."
      />
      </div>
    </section>
  );
}
