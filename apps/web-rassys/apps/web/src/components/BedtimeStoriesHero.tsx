"use client";

import useSWR from "swr";
import { BookOpenText, MoonStar, Rss, Sparkles } from "lucide-react";
import { type PodcastShowPayload } from "../lib/media-controller";
import { Button } from "./ui/button";

const fetcher = (url: string) =>
  fetch(url, { cache: "no-store" }).then((res) => res.json());

export function BedtimeStoriesHero() {
  const { data } = useSWR<PodcastShowPayload>("/api/podcasts", fetcher, {
    refreshInterval: 30000,
  });

  const totalSeries = data?.totalSeries ?? 0;
  const totalEpisodes = data?.totalEpisodes ?? 0;
  const rssReady =
    data?.series.reduce(
      (total, series) =>
        total + series.episodes.filter((episode) => episode.rssReady).length,
      0,
    ) ?? 0;
  const featuredSeries = Array.isArray(data?.series)
    ? data.series.slice(0, 3)
    : [];

  return (
    <section className="relative mx-auto max-w-6xl px-6 py-10">
      <div className="relative overflow-hidden rounded-[36px] border border-white/12 bg-[radial-gradient(circle_at_15%_18%,rgba(166,210,255,0.18),transparent_28%),radial-gradient(circle_at_82%_12%,rgba(255,212,163,0.18),transparent_24%),radial-gradient(circle_at_80%_82%,rgba(152,117,255,0.16),transparent_28%),linear-gradient(145deg,rgba(8,10,28,0.96),rgba(18,8,40,0.92))] p-7 shadow-[0_30px_80px_rgba(0,0,0,0.38)] md:p-10">
        <div className="absolute -left-12 top-8 h-40 w-40 rounded-full bg-glow/15 blur-3xl" />
        <div className="absolute right-10 top-6 h-36 w-36 rounded-full bg-laser/10 blur-3xl" />
        <div className="absolute bottom-0 right-1/3 h-48 w-48 rounded-full bg-aurora/18 blur-3xl" />

        <div className="relative grid gap-8 lg:grid-cols-[minmax(0,1.02fr)_minmax(280px,0.92fr)]">
          <div className="min-w-0 space-y-6">
            <div className="inline-flex items-center gap-3 rounded-full border border-white/10 bg-black/25 px-4 py-2 text-[10px] uppercase tracking-[0.34em] text-cloud/66">
              <MoonStar size={14} className="text-laser" />
              Real Life Bedtime Stories
            </div>
            <div>
              <h1 className="max-w-3xl text-4xl font-semibold leading-tight text-white md:text-5xl">
                The bedtime stories I record and keep close.
              </h1>
              <p className="mt-4 max-w-3xl text-base leading-8 text-cloud/78">
                Each book lives in its own folder, each chapter becomes an
                episode, and the whole shelf is here because reading out loud
                matters to me.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-[24px] border border-white/10 bg-black/20 p-4">
                <div className="text-[10px] uppercase tracking-[0.3em] text-cloud/52">
                  Series
                </div>
                <div className="mt-2 text-3xl font-semibold text-white">
                  {totalSeries}
                </div>
              </div>
              <div className="rounded-[24px] border border-white/10 bg-black/20 p-4">
                <div className="text-[10px] uppercase tracking-[0.3em] text-cloud/52">
                  Episodes
                </div>
                <div className="mt-2 text-3xl font-semibold text-white">
                  {totalEpisodes}
                </div>
              </div>
              <div className="rounded-[24px] border border-white/10 bg-black/20 p-4">
                <div className="text-[10px] uppercase tracking-[0.3em] text-cloud/52">
                  RSS-ready
                </div>
                <div className="mt-2 text-3xl font-semibold text-white">
                  {rssReady}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button asChild>
                <a href="#story-shelf">Browse the shelf</a>
              </Button>
              <Button variant="secondary" asChild>
                <a href="/real-life-bedtime-stories/feed.xml">
                  <Rss size={16} />
                  <span className="ml-2">Podcast feed</span>
                </a>
              </Button>
            </div>
          </div>

          <div className="space-y-4">
            {featuredSeries.length ? (
              featuredSeries.map((series, index) => (
                <div
                  key={series.id}
                  className="group relative overflow-hidden rounded-[28px] border border-white/10 bg-black/20 p-5"
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-white/6 via-transparent to-transparent opacity-70" />
                  <div className="relative flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="text-[10px] uppercase tracking-[0.32em] text-cloud/55">
                        On the shelf
                      </div>
                      <div className="mt-3 break-words text-xl font-semibold text-white">
                        {series.title}
                      </div>
                      <p className="mt-2 line-clamp-3 text-sm leading-7 text-cloud/74">
                        {series.description ||
                          `${series.episodeCount} recorded chapters waiting for a quiet night.`}
                      </p>
                    </div>
                    <div className="rounded-full border border-white/10 bg-black/25 p-3 text-glow">
                      {index === 0 ? (
                        <Sparkles size={18} />
                      ) : (
                        <BookOpenText size={18} />
                      )}
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.24em] text-cloud/58">
                    <span className="rave-chip rounded-full px-3 py-2">
                      {series.episodeCount} chapters
                    </span>
                    <span className="rave-chip rounded-full px-3 py-2">
                      Listen here
                    </span>
                    <span className="rave-chip rounded-full px-3 py-2">
                      Podcast feed
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-[28px] border border-dashed border-white/12 bg-black/10 p-6 text-sm text-cloud/66">
                When I add chapters under{" "}
                <code>/media/data/podcasts/&lt;book&gt;/</code>, they show up
                here on the next refresh.
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
