import type { AdventureSummary, GpsPoint, Workout } from "@jogmania/shared";
import type { AdventureSession } from "@jogmania/api-client";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { computeSegmentStats, formatDuration, SegmentDefinition } from "@/lib/metrics";

type WorkoutDetail = Workout & { gps_points: GpsPoint[]; route_id?: string | null };

function buildSegments(adventure: AdventureSummary | null, totalDistance: number): SegmentDefinition[] {
  if (adventure?.segments?.length) {
    return adventure.segments.map((segment, idx) => ({
      index: idx,
      start_m: segment.distance_start_m,
      end_m: Math.min(totalDistance, segment.distance_end_m),
      label: segment.chapter_title ?? `Chapter ${idx + 1}`,
      biome: segment.biome,
      hazards: segment.hazards,
      loot: segment.loot
    }));
  }
  if (!Number.isFinite(totalDistance) || totalDistance <= 0) return [];
  const checkpointSize = 600;
  const chapterCount = Math.max(1, Math.ceil(totalDistance / checkpointSize));
  return Array.from({ length: chapterCount }, (_, index) => ({
    index,
    start_m: checkpointSize * index,
    end_m: Math.min(totalDistance, checkpointSize * (index + 1)),
    label: chapterCount === 1 ? "One Big Adventure" : index === 0 ? "The First Clue" : index === chapterCount - 1 ? "The Grand Finale" : `Field Chapter ${index + 1}`
  }));
}

export function CourseReplay({
  run,
  adventure,
  attempts,
  story
}: {
  run: WorkoutDetail;
  adventure: AdventureSummary | null;
  attempts: WorkoutDetail[];
  story?: AdventureSession | null;
}) {
  const totalDistance = Number.isFinite(run.distance_m) ? run.distance_m : 0;
  const segments = buildSegments(adventure, totalDistance);
  const segmentStats = computeSegmentStats(run.gps_points || [], segments);
  const souvenirs = adventure?.collectibles ?? [];
  const visitCount = Math.max(1, attempts.length);
  const foundMoments = story?.event_log ?? [];

  const momentIcon = (visualKey?: string) => {
    switch (visualKey) {
      case "marquee": return "✨";
      case "token": return "🪙";
      case "mouse": return "🐭";
      case "fox": return "🦊";
      case "moth": return "🦋";
      case "flower":
      case "garden": return "🌼";
      case "kite":
      case "bridge": return "🪁";
      case "arcade": return "🕹️";
      default: return "✦";
    }
  };

  return (
    <Card className="p-6 jm-holo">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="jm-kicker">Trail Story</p>
          <h3 className="font-display text-2xl">{adventure?.title ?? story?.cartridge?.title ?? "A little world in the open air"}</h3>
          <p className="mt-1 text-sm text-jm-muted">A route-sized story that gets a little more familiar every time you return.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge tone="cyan">{visitCount} {visitCount === 1 ? "visit" : "visits"}</Badge>
          {story ? <Badge tone={story.cartridge.intelligence === "mastra" ? "magenta" : "slate"}>{story.cartridge.intelligence === "mastra" ? "Worldkeeper story" : "Arcade story"}</Badge> : null}
        </div>
      </div>

      {story?.recap && typeof story.recap.story === "string" ? (
        <div className="mt-5 rounded-2xl border border-neon-yellow/25 bg-gradient-to-br from-[#25133a] to-[#071f2b] p-5">
          <p className="font-pixel text-neon-yellow text-xs">{String(story.recap.headline ?? "A postcard from the trail")}</p>
          <p className="mt-3 text-sm leading-6 text-white/85">{story.recap.story}</p>
          {typeof story.recap.evidence_label === "string" ? <p className="mt-3 text-xs text-neon-cyan">Jogmania noticed: {story.recap.evidence_label}</p> : null}
          {typeof story.recap.next_hook === "string" ? <p className="mt-2 text-xs text-neon-pink">Next time: {story.recap.next_hook}</p> : null}
        </div>
      ) : adventure?.scenes?.[0] ? (
        <div className="mt-5 rounded-2xl border border-white/10 bg-black/25 p-4 text-sm text-white/80">{adventure.scenes[0]}</div>
      ) : null}

      {foundMoments.length > 0 ? (
        <div className="mt-5 rounded-2xl border border-neon-cyan/20 bg-neon-cyan/5 p-4">
          <p className="jm-kicker">Little moments from the run</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {foundMoments.map((moment) => {
              const visualKey = story?.cartridge.events.find((event) => event.id === moment.id)?.visual_key;
              return <span key={moment.id} className="jm-chip border-neon-cyan/15 text-neon-cyan">
                <span aria-hidden="true" className="mr-1">{momentIcon(visualKey)}</span>{moment.title}
              </span>;
            })}
          </div>
        </div>
      ) : null}

      <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-3">
        {segments.map((segment, index) => {
          const stat = segmentStats[index];
          const span = Math.max(0, segment.end_m - segment.start_m);
          const decoration = souvenirs[index % Math.max(1, souvenirs.length)];
          return (
            <div key={`${segment.label}-${segment.start_m}`} className="relative overflow-hidden rounded-2xl border border-white/10 bg-jm-surface/80 p-4">
              <div className="absolute -right-3 -top-3 h-16 w-16 rounded-full bg-neon-cyan/10 blur-xl" />
              <p className="relative text-[10px] uppercase tracking-[0.25em] text-jm-cyan">{segment.biome ?? segment.label}</p>
              <p className="relative mt-2 font-display text-xl text-white">{segment.label}</p>
              <p className="relative mt-2 text-xs text-jm-muted">{Math.round(segment.start_m)}–{Math.round(segment.end_m)} m of your real route</p>
              <p className="relative mt-1 text-xs text-jm-muted">{formatDuration(stat?.duration_s ?? 0)} together outside</p>
              {decoration ? <p className="relative mt-3 rounded-full border border-neon-yellow/20 bg-black/20 px-3 py-1 text-[11px] text-neon-yellow">✦ {decoration}</p> : null}
              {!decoration && span > 0 ? <p className="relative mt-3 text-[11px] text-jm-muted">A new detail will appear on your next visit.</p> : null}
            </div>
          );
        })}
        {segments.length === 0 ? <p className="text-sm text-jm-muted">This postcard is still waiting for a route trace.</p> : null}
      </div>

      {story?.world_change && typeof story.world_change.title === "string" ? (
        <div className="mt-5 flex items-center gap-3 rounded-xl border border-neon-green/20 bg-neon-green/5 p-4">
          <span aria-hidden="true" className="text-2xl">💡</span>
          <div>
            <p className="text-sm text-neon-green">{story.world_change.title}</p>
            <p className="mt-1 text-xs text-jm-muted">The arcade remembers this run.</p>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
