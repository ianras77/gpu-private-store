"use client";

import useSWR from "swr";
import { AudioShelfPlayer, type AudioShelfItem, type AudioShelfSection } from "./AudioShelfPlayer";
import { type LibraryTrack, type ListeningRoomPayload } from "../lib/media-controller";

const fetcher = (url: string) =>
  fetch(url, { cache: "no-store" }).then(async (res) => {
    if (!res.ok) {
      throw new Error(`library_fetch_failed_${res.status}`);
    }
    return res.json();
  });

type ListeningTrack = LibraryTrack;

const formatDuration = (seconds?: number) => {
  if (!seconds || seconds <= 0) return null;
  const minutes = Math.round(seconds / 60);
  return `${minutes} min`;
};

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const buildCounts = (values: string[]) => {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([value, count]) => ({ value, count }))
    .sort((left, right) => {
      if (right.count !== left.count) return right.count - left.count;
      return left.value.localeCompare(right.value);
    });
};

const toShelfItem = (track: ListeningTrack, description?: string): AudioShelfItem => ({
  id: track.id,
  title: track.title,
  subtitle: `${track.artist}${track.album ? ` · ${track.album}` : ""}`,
  description:
    description ??
    track.genres?.slice(0, 2).join(" / ") ??
    "Pulled straight from the shelves at home.",
  streamUrl: track.streamUrl,
  artworkUrl: track.albumArtUrl,
  meta: [track.year, formatDuration(track.duration), track.qualityLabel]
    .filter(Boolean)
    .join(" · "),
  badges: [
    track.lossless ? "Lossless" : null,
    track.bitsPerSample && track.bitsPerSample > 16
      ? `${track.bitsPerSample}-bit`
      : null,
    track.sampleRate && track.sampleRate > 48000
      ? `${(track.sampleRate / 1000).toFixed(0)}kHz`
      : null,
  ]
    .filter(Boolean)
    .slice(0, 3) as string[],
});

const pickStarterShelf = (items: ListeningTrack[], limit: number) => {
  const seenArtists = new Set<string>();
  const starter: ListeningTrack[] = [];

  for (const track of items) {
    const artistKey = track.artist?.trim().toLowerCase();
    if (!artistKey || seenArtists.has(artistKey)) continue;
    if (!track.albumArtUrl && !track.lossless) continue;
    seenArtists.add(artistKey);
    starter.push(track);
    if (starter.length >= limit) break;
  }

  return starter;
};

export function ListeningRoomPanel() {
  const { data, error } = useSWR<ListeningRoomPayload>(
    "/api/library?limit=100&offset=0",
    fetcher,
    {
      refreshInterval: 30000,
    },
  );

  const items = Array.isArray(data?.items) ? data.items : [];
  const hiResItems = items.filter(
    (track) =>
      Boolean(track.lossless) &&
      ((track.bitsPerSample ?? 0) > 16 || (track.sampleRate ?? 0) > 48000),
  );
  const starterShelf = pickStarterShelf(items, 24);
  const topGenres = buildCounts(items.flatMap((track) => track.genres ?? []))
    .filter((facet) => facet.count >= 14)
    .slice(0, 3);
  const topArtists = buildCounts(
    items
      .map((track) => track.artist?.trim())
      .filter((value): value is string => Boolean(value)),
  )
    .filter((facet) => facet.count >= 6)
    .slice(0, 2);

  const genreSections: AudioShelfSection[] = topGenres.map((facet) => ({
    id: `genre-${slugify(facet.value)}`,
    label: facet.value,
    title: `${facet.value} I keep close`,
    description: `A run through the ${facet.value.toLowerCase()} records that stay within reach around here.`,
    items: items
      .filter((track) =>
        (track.genres ?? []).some(
          (genre) => genre.toLowerCase() === facet.value.toLowerCase(),
        ),
      )
      .slice(0, 36)
      .map((track) =>
        toShelfItem(
          track,
          `${track.genres?.slice(0, 2).join(" / ") ?? facet.value} from the shelves at home.`,
        ),
      ),
  }));

  const artistSections: AudioShelfSection[] = topArtists.map((facet) => ({
    id: `artist-${slugify(facet.value)}`,
    label: facet.value,
    title: `${facet.value} on the shelf`,
    description: `${facet.count} tracks from ${facet.value} already sitting close at hand.`,
    items: items
      .filter((track) => track.artist?.trim().toLowerCase() === facet.value.toLowerCase())
      .slice(0, 24)
      .map((track) =>
        toShelfItem(
          track,
          `One more turn with ${facet.value}, straight out of the shelves.`,
        ),
      ),
  }));

  const sections: AudioShelfSection[] = [
    ...(starterShelf.length
      ? [
          {
            id: "start-here",
            label: "Start Here",
            title: "Where I would start",
            description:
              "If you just want to click into the shelves and let something take hold, begin here.",
            items: starterShelf.map((track) =>
              toShelfItem(
                track,
                "A good first place to start if you are just stepping into the room.",
              ),
            ),
          },
        ]
      : []),
    ...(hiResItems.length
      ? [
          {
            id: "hi-res",
            label: "Good Headphones",
            title: "The shelf I use when I really want to listen",
            description:
              "Lossless cuts and higher-resolution files from the records that deserve a little more quiet around them.",
            items: hiResItems.slice(0, 36).map((track) =>
              toShelfItem(
                track,
                track.genres?.slice(0, 2).join(" / ") ??
                  "The kind of record that opens up when I slow down for it.",
              ),
            ),
          },
        ]
      : []),
    ...genreSections,
    ...artistSections,
    {
      id: "all",
      label: "All Music",
      title: "Everything on the shelves",
      description:
        "The full run of music behind the station, opened up when I want to move through it on my own terms.",
      items: items.map((track) =>
        toShelfItem(
          track,
          track.genres?.slice(0, 2).join(" / ") ??
            "Straight from the shelves at home.",
        ),
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {error ? (
        <div className="rave-panel rounded-[24px] border border-comet/30 px-4 py-3 text-sm text-cloud/78">
          The listening room is still catching up. If I just changed the
          shelves, give it a moment.
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rave-chip rounded-[26px] p-5">
          <div className="text-[10px] uppercase tracking-[0.32em] text-cloud/55">
            Tracks on the shelves
          </div>
          <div className="mt-3 text-3xl font-semibold text-white">
            {data?.stats?.totalTracks ?? items.length ?? 0}
          </div>
          <p className="mt-2 text-sm leading-6 text-cloud/74">
            The same library that feeds the station, opened up for slower time.
          </p>
        </div>
        <div className="rave-chip rounded-[26px] p-5">
          <div className="text-[10px] uppercase tracking-[0.32em] text-cloud/55">
            Lossless cuts
          </div>
          <div className="mt-3 text-3xl font-semibold text-white">
            {data?.stats?.losslessTracks ??
              items.filter((track) => track.lossless).length}
          </div>
          <p className="mt-2 text-sm leading-6 text-cloud/74">
            Records I can stay with a little longer when I want them closer to
            the source.
          </p>
        </div>
        <div className="rave-chip rounded-[26px] p-5">
          <div className="text-[10px] uppercase tracking-[0.32em] text-cloud/55">
            High-res shelf
          </div>
          <div className="mt-3 text-3xl font-semibold text-white">
            {data?.stats?.highResTracks ?? hiResItems.length}
          </div>
          <p className="mt-2 text-sm leading-6 text-cloud/74">
            The part of the room that sounds best when everything else quiets
            down.
          </p>
        </div>
      </div>

      {(topGenres.length > 0 || topArtists.length > 0) && (
        <div className="rave-panel rounded-[28px] p-5">
          <div className="text-[10px] uppercase tracking-[0.32em] text-cloud/55">
            Good ways in
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {topGenres.map((facet) => (
              <span
                key={facet.value}
                className="rave-chip rounded-full px-3 py-2 text-[11px] uppercase tracking-[0.2em] text-cloud/72"
              >
                {facet.value} · {facet.count}
              </span>
            ))}
            {topArtists.map((facet) => (
              <span
                key={facet.value}
                className="rave-chip rounded-full px-3 py-2 text-[11px] uppercase tracking-[0.2em] text-cloud/72"
              >
                {facet.value} · {facet.count}
              </span>
            ))}
          </div>
        </div>
      )}

      <AudioShelfPlayer
        eyebrow="Listening Room"
        title="Stay with the music a little longer"
        description="Sometimes I want the station. Sometimes I want to pick a shelf, press play, and let one record keep the room for a while."
        sections={sections}
        emptyState="Nothing on this shelf matches that search yet."
        maxVisibleItems={3}
      />
    </div>
  );
}
