import Image from "next/image";
import Link from "next/link";
import { fetchPodcastShow } from "../lib/media-controller";

const formatDuration = (seconds?: number) => {
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds <= 0) {
    return null;
  }
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${minutes.toString().padStart(2, "0")}m`;
  }
  return `${Math.max(1, minutes)}m`;
};

export async function BedtimeStoriesTeaser() {
  const payload = await fetchPodcastShow().catch(() => null);
  const episodes =
    payload?.series
      ?.flatMap((series) =>
        series.episodes.map((episode) => ({
          ...episode,
          seriesTitle: series.title,
          artworkUrl: episode.artworkUrl ?? series.artworkUrl,
        })),
      )
      .sort(
        (left, right) =>
          new Date(right.publishedAt).getTime() -
          new Date(left.publishedAt).getTime(),
      )
      .slice(0, 3) ?? [];

  if (episodes.length === 0) {
    return null;
  }

  const [lead, ...rest] = episodes;

  return (
    <section className="mx-auto max-w-6xl px-6 py-8">
      <div className="rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(255,230,109,0.1),transparent_28%),radial-gradient(circle_at_88%_12%,rgba(66,245,255,0.12),transparent_30%),linear-gradient(155deg,rgba(10,13,28,0.94),rgba(24,11,43,0.88))] p-5 shadow-[0_24px_70px_rgba(0,0,0,0.3)] md:p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-2xl">
            <div className="text-[11px] uppercase tracking-[0.34em] text-cloud/56">
              Real Life Bedtime Stories
            </div>
            <h2 className="mt-3 text-2xl font-semibold text-white md:text-3xl">
              Quiet chapters, close at hand.
            </h2>
          </div>
          <Link
            href="/real-life-bedtime-stories"
            className="rounded-full border border-white/12 bg-white/6 px-4 py-2 text-[11px] uppercase tracking-[0.22em] text-cloud/74 transition hover:text-white"
          >
            Step into the shelf
          </Link>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1.12fr)_minmax(0,0.88fr)]">
          <Link
            href="/real-life-bedtime-stories"
            className="group overflow-hidden rounded-[26px] border border-white/10 bg-black/20"
          >
            <div className="grid gap-4 p-4 sm:grid-cols-[160px_minmax(0,1fr)] sm:p-5">
              <div className="relative aspect-square overflow-hidden rounded-[22px] border border-white/10 bg-white/6">
                {lead.artworkUrl ? (
                  <Image
                    src={lead.artworkUrl}
                    alt={lead.title}
                    fill
                    className="object-cover transition duration-500 group-hover:scale-[1.04]"
                    sizes="(max-width: 640px) 100vw, 160px"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center bg-[linear-gradient(160deg,rgba(255,230,109,0.2),rgba(66,245,255,0.16),rgba(255,79,216,0.16))] text-3xl font-semibold text-white">
                    B
                  </div>
                )}
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-cloud/54">
                  <span>{lead.seriesTitle}</span>
                  {formatDuration(lead.duration) ? (
                    <span>{formatDuration(lead.duration)}</span>
                  ) : null}
                </div>
                <div className="mt-3 text-xl font-semibold text-white">
                  {lead.title}
                </div>
                <div className="mt-3 line-clamp-3 text-sm leading-7 text-cloud/74">
                  {lead.description ||
                    "A chapter from the shelf, ready to play softly and stay close."}
                </div>
              </div>
            </div>
          </Link>

          <div className="grid gap-3">
            {rest.map((episode) => (
              <Link
                key={episode.id}
                href="/real-life-bedtime-stories"
                className="group grid gap-3 rounded-[24px] border border-white/10 bg-black/18 p-4 transition hover:border-white/16 hover:bg-black/24 sm:grid-cols-[88px_minmax(0,1fr)]"
              >
                <div className="relative aspect-square overflow-hidden rounded-[18px] border border-white/10 bg-white/6">
                  {episode.artworkUrl ? (
                    <Image
                      src={episode.artworkUrl}
                      alt={episode.title}
                      fill
                      className="object-cover transition duration-500 group-hover:scale-[1.04]"
                      sizes="88px"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center bg-[linear-gradient(160deg,rgba(255,230,109,0.18),rgba(255,79,216,0.14),rgba(66,245,255,0.12))] text-xl font-semibold text-white">
                      B
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <div className="text-[10px] uppercase tracking-[0.22em] text-cloud/54">
                    {episode.seriesTitle}
                  </div>
                  <div className="mt-2 text-sm font-semibold leading-6 text-white">
                    {episode.title}
                  </div>
                  <div className="mt-2 text-xs text-cloud/66">
                    {formatDuration(episode.duration) ?? "Ready to play"}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
