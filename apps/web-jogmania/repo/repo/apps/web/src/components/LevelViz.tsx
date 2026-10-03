import type { AdventureSummary } from "@jogmania/shared";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

export function LevelViz({ adventure }: { adventure: AdventureSummary | null }) {
  if (!adventure) {
    return (
      <Card className="p-6">
        <h4 className="font-display text-lg">Trail Storybook</h4>
        <p className="text-sm text-jm-muted mt-2">Your first visit will fill this trail with little surprises.</p>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between">
        <h4 className="font-display text-lg">Little worlds along this trail</h4>
        <Badge tone="cyan">Retro Map</Badge>
      </div>
      <div className="mt-6 jm-track md:grid-cols-3">
        {adventure.segments.map((segment, idx) => (
          <div key={`${segment.distance_start_m}-${idx}`} className="jm-track-segment">
            <div className="p-3 rounded-xl bg-jm-surface/90 text-xs border border-white/10">
              <p className="text-jm-cyan uppercase tracking-[0.25em] text-[0.55rem]">{segment.biome}</p>
              <p className="text-jm-muted mt-2">{segment.loot?.slice(0, 2).join(" · ") || "A new surprise is waiting to be found."}</p>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
