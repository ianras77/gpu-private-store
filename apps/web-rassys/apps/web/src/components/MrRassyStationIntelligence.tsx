"use client";

import Link from "next/link";
import useSWR from "swr";
import { ArrowUpRight, BarChart3, BookOpen, Disc3, Sparkles, type LucideIcon } from "lucide-react";
import type { ListeningRoomPayload } from "../lib/media-controller";
import { useRadioHome } from "../lib/radio-home";

type PlayStats = {
  totalPlays: number;
  recentPlays: number;
  totalMinutes: number;
  topTracks: Array<{ trackId: string; title?: string | null; artist?: string | null; plays: number; minutes: number }>;
  topArtists: Array<{ artist?: string | null; plays: number }>;
};

const fetcher = (url: string) => fetch(url, { cache: "no-store" }).then((response) => {
  if (!response.ok) throw new Error(`station_intelligence_${response.status}`);
  return response.json();
});

const countBy = (items: string[]) => Array.from(items.reduce((counts, item) => {
  const key = item.trim();
  if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
  return counts;
}, new Map<string, number>()).entries()).sort((a, b) => b[1] - a[1]).slice(0, 4);

const trackKey = (track: { title?: string; artist?: string; id?: string }) => track.id ?? `${track.artist}-${track.title}`;

export function MrRassyStationIntelligence() {
  const { data: home } = useRadioHome();
  const { data: library } = useSWR<ListeningRoomPayload>("/api/library?limit=100&offset=0", fetcher, { refreshInterval: 30000 });
  const { data: playStats } = useSWR<PlayStats>("/api/radio/stats", fetcher, { refreshInterval: 60000 });
  const items = library?.items ?? [];
  const note = home?.latestNote;
  const recommendationSource = note?.setlist?.length ? note.setlist : home?.status?.feedbackTop ?? [];
  const recommendations = recommendationSource.map((track) => ({
    id: "trackId" in track ? track.trackId : track.id,
    title: track.title,
    artist: track.artist,
    album: "album" in track ? track.album : undefined,
  })).filter((track, index, list) => trackKey(track) && list.findIndex((candidate) => trackKey(candidate) === trackKey(track)) === index).slice(0, 4);
  const artists = countBy(items.map((track) => track.artist));
  const genres = countBy(items.flatMap((track) => track.genres ?? []));
  const plays = playStats?.totalPlays ?? home?.status?.playCount ?? home?.status?.plays;
  const requestLine = home?.status?.requestLineItems?.slice(0, 4) ?? [];
  const statCards: Array<{ label: string; value?: number | null; detail: string; Icon: LucideIcon }> = [
    { label: "Library", value: library?.stats?.totalTracks ?? library?.total, detail: "tracks in the room", Icon: Disc3 },
    { label: "Lossless", value: library?.stats?.losslessTracks, detail: "closer to the source", Icon: Sparkles },
    { label: "Plays", value: plays, detail: plays == null ? "play history not reported" : "station plays", Icon: BarChart3 },
    { label: "Fresh notes", value: home?.notes?.length, detail: "recent booth dispatches", Icon: BookOpen },
  ];

  return <section className="station-intelligence mt-6 space-y-4" aria-label="Mr Rassy station intelligence">
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
      <div><div className="eyebrow"><Sparkles size={13} className="mr-2 inline text-glow" /> The booth below the booth</div><h2 className="section-title mt-2 text-3xl sm:text-4xl">What Mr Rassy is making of the room.</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-cloud/68">Recommendations, patterns, and the living record of the station — pulled from the same shelves and set notes that shape the show.</p></div>
      <Link href="/mr-rassy/library" className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-glow">Open the archive <ArrowUpRight size={14} /></Link>
    </div>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {statCards.map(({ label, value, detail, Icon }) => <div key={label} className="rave-chip rounded-[22px] p-4"><Icon size={16} className="text-glow" /><div className="mt-3 text-2xl font-semibold text-white">{value == null ? "—" : String(value)}</div><div className="text-[10px] uppercase tracking-[0.2em] text-cloud/55">{label}</div><div className="mt-1 text-xs text-cloud/55">{label === "Plays" && playStats ? `${playStats.recentPlays} in the last 30 days` : detail}</div></div>)}
    </div>
    <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
      <div className="rave-panel rounded-[26px] p-5"><div className="eyebrow">Mr Rassy recommends</div><h3 className="mt-2 text-xl font-semibold text-white">The next records he would put in your hands.</h3><div className="mt-4 grid gap-3 sm:grid-cols-2">{recommendations.length ? recommendations.map((track) => <Link href={track.id ? `/mr-rassy/track/${encodeURIComponent(track.id)}` : "/mr-rassy/library"} key={trackKey(track)} className="group rounded-2xl border border-white/10 bg-white/[0.035] p-4 transition hover:border-glow/50"><div className="flex items-center justify-between gap-2"><span className="text-[10px] uppercase tracking-[0.18em] text-glow">Recommendation</span><span className="text-[10px] text-cloud/40">{track.id ? "Trackbook" : "Live set"}</span></div><div className="mt-3 text-sm font-semibold text-white group-hover:text-glow">{track.title}</div><div className="mt-1 text-xs text-cloud/60">{track.artist}{track.album ? ` · ${track.album}` : ""}</div></Link>) : <div className="text-sm text-cloud/60">The booth is still assembling the next recommendation. Check back when the set has a little more shape.</div>}</div></div>
      <div className="rave-panel rounded-[26px] p-5"><div className="eyebrow">The shape of the shelves</div><div className="mt-4 space-y-4"><div><div className="text-[10px] uppercase tracking-[0.18em] text-cloud/45">Artists Mr Rassy keeps reaching for</div><div className="mt-2 flex flex-wrap gap-2">{artists.length ? artists.map(([artist, count]) => <span key={artist} className="rave-chip rounded-full px-3 py-2 text-xs text-cloud/78">{artist} <span className="text-glow">{count}</span></span>) : <span className="text-sm text-cloud/55">Shelf data is catching up.</span>}</div></div><div><div className="text-[10px] uppercase tracking-[0.18em] text-cloud/45">Genres in the current collection</div><div className="mt-2 flex flex-wrap gap-2">{genres.length ? genres.map(([genre, count]) => <span key={genre} className="rave-chip rounded-full px-3 py-2 text-xs text-cloud/78">{genre} <span className="text-comet">{count}</span></span>) : <span className="text-sm text-cloud/55">No genre signal yet.</span>}</div></div></div></div>
    </div>
    {playStats?.topTracks?.length ? <div className="rave-panel rounded-[26px] p-5"><div className="eyebrow">Most played</div><h3 className="mt-2 text-xl font-semibold text-white">The records listeners keep coming back to.</h3><div className="mt-4 grid gap-3 md:grid-cols-2">{playStats.topTracks.map((track, index) => <Link key={track.trackId} href={`/mr-rassy/track/${encodeURIComponent(track.trackId)}`} className="group flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.035] p-4"><span className="font-display text-2xl text-glow/70">{String(index + 1).padStart(2, "0")}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-white group-hover:text-glow">{track.title ?? "Untitled record"}</span><span className="mt-1 block truncate text-xs text-cloud/60">{track.artist ?? "Unknown artist"}</span></span><span className="text-right text-[10px] uppercase tracking-[0.16em] text-cloud/45"><span className="block text-glow">{track.plays} plays</span><span className="mt-1 block">{track.minutes} min</span></span></Link>)}</div>{playStats.topArtists?.length ? <div className="mt-5 border-t border-white/10 pt-4"><div className="text-[10px] uppercase tracking-[0.18em] text-cloud/45">Artists with the most air time</div><div className="mt-2 flex flex-wrap gap-2">{playStats.topArtists.map((artist) => <span key={artist.artist ?? "unknown"} className="rave-chip rounded-full px-3 py-2 text-xs text-cloud/78">{artist.artist ?? "Unknown artist"} <span className="text-comet">{artist.plays}</span></span>)}</div></div> : null}</div> : null}
    {requestLine.length ? <div className="rave-panel rounded-[26px] p-5"><div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-end"><div><div className="eyebrow">The request line</div><h3 className="mt-2 text-xl font-semibold text-white">Things people have put in his hands.</h3></div><span className="text-[10px] uppercase tracking-[0.18em] text-cloud/45">persisted station memory</span></div><div className="mt-4 grid gap-3 md:grid-cols-2">{requestLine.map((request) => <div key={request.id} className="rounded-2xl border border-white/10 bg-white/[0.035] p-4"><div className="flex items-center justify-between gap-3"><span className="text-[10px] uppercase tracking-[0.18em] text-glow">{request.status ?? "received"}</span><span className="text-[10px] text-cloud/40">{new Date(request.createdAt).toLocaleDateString()}</span></div><p className="mt-3 text-sm leading-6 text-white">{request.listenerMessage ?? request.summary}</p>{request.response ? <p className="mt-2 text-xs leading-5 text-cloud/62">{request.response}</p> : null}{request.tracks?.length ? <div className="mt-3 text-[10px] uppercase tracking-[0.16em] text-cloud/45">{request.tracks.slice(0, 2).map((track) => `${track.title} · ${track.artist}`).join(" / ")}</div> : null}</div>)}</div></div> : null}
    {note?.boothDossier?.intro || note?.script ? <div className="rave-panel rounded-[26px] p-5"><div className="eyebrow">A note from the live set</div><p className="mt-3 max-w-4xl text-base leading-8 text-cloud/82">{note.boothDossier?.intro ?? note.script}</p>{note.boothDossier?.deepCut ? <p className="mt-3 text-sm leading-6 text-cloud/60"><span className="text-glow">Deep cut:</span> {note.boothDossier.deepCut}</p> : null}</div> : null}
  </section>;
}
