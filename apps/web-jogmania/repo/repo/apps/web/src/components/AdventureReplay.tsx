import type { AdventureSummary } from "@jogmania/shared";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

export function AdventureReplay({ adventure }: { adventure: AdventureSummary }) {
  return (
    <Card className="p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="jm-kicker">Course Replay</p>
          <h3 className="font-display text-xl">{adventure.title}</h3>
        </div>
        <Badge tone={adventure.boss_moment ? "magenta" : "cyan"}>
          Seed {adventure.seed}
        </Badge>
      </div>
      <div className="mt-4 flex flex-wrap gap-2 text-xs">
        <span className="jm-chip text-jm-acid">Obstacle {adventure.obstacle_density}</span>
        <span className="jm-chip text-jm-cyan">{adventure.scenes[0] ?? "Unknown scene"}</span>
        {adventure.boss_moment && <span className="jm-chip text-jm-magenta">Boss Moment</span>}
      </div>
      <div className="mt-6 jm-track md:grid-cols-3">
        {adventure.segments.map((segment, index) => (
          <div key={`${segment.distance_start_m}-${index}`} className="jm-track-segment">
            <div className="p-4 bg-jm-surface/90 rounded-xl border border-white/10">
              <p className="text-[0.55rem] uppercase tracking-[0.3em] text-jm-cyan">{segment.biome}</p>
              <p className="text-sm text-jm-text mt-2">
                {segment.distance_start_m.toFixed(0)}m - {segment.distance_end_m.toFixed(0)}m
              </p>
              <div className="mt-3 flex flex-wrap gap-2 text-[0.65rem] text-jm-muted">
                {segment.hazards.slice(0, 2).map((hazard) => (
                  <span key={hazard} className="jm-chip text-jm-magenta">{hazard}</span>
                ))}
                {segment.loot.slice(0, 1).map((loot) => (
                  <span key={loot} className="jm-chip text-jm-acid">{loot}</span>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-5 flex flex-wrap gap-2 text-xs text-jm-muted">
        {adventure.collectibles.map((item) => (
          <span key={item} className="jm-chip text-jm-magenta">
            {item}
          </span>
        ))}
      </div>
    </Card>
  );
}
