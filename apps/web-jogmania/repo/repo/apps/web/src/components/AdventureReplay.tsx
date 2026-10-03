import type { AdventureSummary } from "@jogmania/shared";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

export function AdventureReplay({ adventure }: { adventure: AdventureSummary }) {
  return (
    <Card className="p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="jm-kicker">Trail Storybook</p>
          <h3 className="font-display text-xl">{adventure.title}</h3>
        </div>
        <Badge tone="cyan">{adventure.scenes[0] ?? "A route-sized story"}</Badge>
      </div>
      <div className="mt-6 jm-track md:grid-cols-3">
        {adventure.segments.map((segment, index) => (
          <div key={`${segment.distance_start_m}-${index}`} className="jm-track-segment">
            <div className="p-4 bg-jm-surface/90 rounded-xl border border-white/10">
              <p className="text-[0.55rem] uppercase tracking-[0.3em] text-jm-cyan">{segment.biome}</p>
              <p className="text-sm text-neon-yellow mt-2">{segment.chapter_title ?? `Chapter ${index + 1}`}</p>
              <p className="text-sm text-jm-text mt-2">
                {segment.distance_start_m.toFixed(0)}m - {segment.distance_end_m.toFixed(0)}m
              </p>
              <div className="mt-3 flex flex-wrap gap-2 text-[0.65rem] text-jm-muted">
                {segment.hazards.slice(0, 1).map((neighbor) => (
                  <span key={neighbor} className="jm-chip text-jm-magenta">Met {neighbor}</span>
                ))}
                {segment.loot.slice(0, 1).map((souvenir) => (
                  <span key={souvenir} className="jm-chip text-jm-acid">Found {souvenir}</span>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-5 flex flex-wrap gap-2 text-xs text-jm-muted">
        {adventure.collectibles.map((item) => (
          <span key={item} className="jm-chip text-jm-magenta">{item}</span>
        ))}
      </div>
    </Card>
  );
}
