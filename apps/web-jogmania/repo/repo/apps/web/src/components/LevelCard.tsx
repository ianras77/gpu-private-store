import Link from "next/link";
import type { Route } from "@jogmania/shared";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

export function LevelCard({
  route
}: {
  route: Route & {
    distance_m?: number | null;
    typical_pace_s_per_km?: number | null;
    frequency?: number | null;
    last_run_at?: string | null;
  };
}) {
  const distanceKm = route.distance_m ? (route.distance_m / 1000).toFixed(2) : "-";
  const pace = route.typical_pace_s_per_km ? `${Math.round(route.typical_pace_s_per_km)} s/km` : "-";
  const lastRun = route.last_run_at ? new Date(route.last_run_at).toLocaleDateString() : "-";
  const progress = Math.min(100, (route.frequency ?? 0) * 18);

  return (
    <Link href={`/routes/${route.id}`} className="group">
      <Card className="p-5 flex flex-col gap-4 border border-white/5 hover:border-jm-cyan/40 hover:shadow-neon transition jm-holo">
        <div className="flex items-center justify-between">
          <div>
            <p className="jm-kicker">Course</p>
            <h3 className="font-display text-xl text-jm-text">{route.name}</h3>
          </div>
          <div className="flex items-center gap-2">
            <Badge tone={route.is_course ? "cyan" : "slate"}>
              {route.is_course ? "Active" : "Inactive"}
            </Badge>
            <Badge tone="magenta">{route.frequency ?? 0} runs</Badge>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="jm-chip text-jm-cyan">Distance {distanceKm} km</span>
          <span className="jm-chip text-jm-acid">Pace {pace}</span>
          <span className="jm-chip text-jm-muted">Last {lastRun}</span>
        </div>
        <div className="jm-meter">
          <span style={{ width: `${progress}%` }} />
        </div>
      </Card>
    </Link>
  );
}
