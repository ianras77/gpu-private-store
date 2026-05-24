import type { AdventureSummary, GpsPoint, Workout } from "@jogmania/shared";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { SpeedGraph } from "@/components/SpeedGraph";
import {
  computeSegmentStats,
  computeSpeedSeries,
  consistencyScore,
  formatDuration,
  formatPace,
  heartRateZone,
  sprintCount,
  SegmentDefinition
} from "@/lib/metrics";

type WorkoutDetail = Workout & { gps_points: GpsPoint[]; route_id?: string | null };

function buildSegments(adventure: AdventureSummary | null, totalDistance: number): SegmentDefinition[] {
  if (adventure?.segments?.length) {
    return adventure.segments.map((segment, idx) => ({
      index: idx,
      start_m: segment.distance_start_m,
      end_m: Math.min(totalDistance, segment.distance_end_m),
      label: `Segment ${idx + 1}`,
      biome: segment.biome,
      hazards: segment.hazards,
      loot: segment.loot
    }));
  }
  if (!Number.isFinite(totalDistance) || totalDistance <= 0) {
    return [];
  }
  const step = totalDistance / 3;
  return Array.from({ length: 3 }, (_, idx) => ({
    index: idx,
    start_m: step * idx,
    end_m: step * (idx + 1),
    label: `Segment ${idx + 1}`
  }));
}

export function CourseReplay({
  run,
  adventure,
  attempts
}: {
  run: WorkoutDetail;
  adventure: AdventureSummary | null;
  attempts: WorkoutDetail[];
}) {
  const totalDistance = Number.isFinite(run.distance_m) ? run.distance_m : 0;
  const segments = buildSegments(adventure, totalDistance);
  const segmentStats = computeSegmentStats(run.gps_points || [], segments);
  const previousStats = attempts
    .filter((attempt) => attempt.id !== run.id)
    .map((attempt) => computeSegmentStats(attempt.gps_points || [], segments));

  const bestPrev = segments.map((_, idx) => {
    const paces = previousStats
      .map((stats) => stats[idx]?.pace_s_per_km)
      .filter((pace): pace is number => Number.isFinite(pace));
    return paces.length ? Math.min(...paces) : null;
  });

  const scoredSegments = segments.map((segment, idx) => {
    const stat = segmentStats[idx];
    const baseline = bestPrev[idx];
    if (!stat) {
      return {
        ...segment,
        paceLabel: "-",
        durationLabel: "-",
        deltaLabel: "Baseline pending",
        points: 0,
        improved: false,
        hazardClear: false,
        improvementPct: 0
      };
    }
    if (!baseline) {
      return {
        ...segment,
        paceLabel: formatPace(stat.pace_s_per_km),
        durationLabel: formatDuration(stat.duration_s),
        deltaLabel: "Set baseline",
        points: 0,
        improved: false,
        hazardClear: false,
        improvementPct: 0
      };
    }
    const delta = baseline - stat.pace_s_per_km;
    const improvement = delta / baseline;
    const points = improvement > 0 ? Math.round(improvement * 200) : 0;
    const hazardClear = improvement >= 0.05;
    return {
      ...segment,
      paceLabel: formatPace(stat.pace_s_per_km),
      durationLabel: formatDuration(stat.duration_s),
      deltaLabel: delta > 0 ? `Faster by ${Math.round(delta)} s/km` : "No gain",
      points,
      improved: improvement > 0,
      hazardClear,
      improvementPct: Math.max(0, Math.round(improvement * 100))
    };
  });

  const improvedCount = scoredSegments.filter((segment) => segment.improved).length;
  const hazardClears = scoredSegments.filter((segment) => segment.hazardClear).length;
  let streak = 0;
  let bestStreak = 0;
  scoredSegments.forEach((segment) => {
    if (segment.improved) {
      streak += 1;
      bestStreak = Math.max(bestStreak, streak);
    } else {
      streak = 0;
    }
  });
  const streakBonus = bestStreak >= 2 ? (bestStreak - 1) * 30 : 0;
  const hazardBonus = hazardClears * 40;
  const basePoints = segments.length * 50;
  const speedPoints = scoredSegments.reduce((acc, segment) => acc + segment.points, 0);

  const hrZone = heartRateZone(run.avg_hr);
  const hrBonus =
    !run.avg_hr || !Number.isFinite(run.avg_hr)
      ? 0
      : run.avg_hr < 120
        ? 0
        : run.avg_hr < 140
          ? 20
          : run.avg_hr < 160
            ? 50
            : run.avg_hr < 175
              ? 80
              : 120;
  const speedSeries = computeSpeedSeries(run.gps_points || []);
  const flowScore = Math.round(consistencyScore(speedSeries));
  const flowBonus = flowScore >= 85 ? 120 : flowScore >= 70 ? 60 : 0;
  const sprints = Math.max(0, Math.round(sprintCount(speedSeries) / 3));
  const totalPoints = basePoints + speedPoints + hazardBonus + streakBonus + hrBonus + flowBonus;
  const featureNumber = (key: string) => {
    const value = adventure?.route_features?.[key];
    return typeof value === "number" && Number.isFinite(value) ? value : 0;
  };
  const detectedFeatures = [
    { label: "Climbs", value: featureNumber("climb_count") },
    { label: "Turns", value: featureNumber("turn_count") },
    { label: "Pulse Gates", value: featureNumber("high_hr_moments") },
    { label: "Sprint Gates", value: featureNumber("pace_surge_count") }
  ].filter((feature) => feature.value > 0);
  const rank =
    totalPoints >= 700 ? "S" : totalPoints >= 550 ? "A" : totalPoints >= 400 ? "B" : "C";
  const momentum = segments.length
    ? Math.min(100, Math.round(flowScore * 0.6 + (improvedCount / segments.length) * 40))
    : 0;
  const comboMeter = segments.length ? Math.round((bestStreak / segments.length) * 100) : 0;
  const hazardRate = segments.length ? Math.round((hazardClears / segments.length) * 100) : 0;

  return (
    <Card className="p-6 jm-holo">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <p className="jm-kicker">Course Replay</p>
          <h3 className="font-display text-2xl">{adventure?.title ?? "Adventure Course"}</h3>
          <p className="text-xs text-jm-muted mt-1">Gamified splits, hazards, and performance flow.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Badge tone={hrZone.tone}>{hrZone.label}</Badge>
          <Badge tone={totalPoints > 0 ? "magenta" : "slate"}>+{totalPoints} pts</Badge>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-[auto_1fr] gap-6">
        <div className="jm-score-orb jm-spark">
          <div className="text-center">
            <div className="jm-rank">{rank}</div>
            <div className="text-xs text-jm-muted uppercase tracking-[0.3em]">Rank</div>
            <div className="mt-2 text-sm text-jm-cyan">{totalPoints} pts</div>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between text-xs text-jm-muted">
              <span>Momentum</span>
              <span>{momentum}%</span>
            </div>
            <div className="jm-meter mt-2">
              <span style={{ width: `${momentum}%` }} />
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between text-xs text-jm-muted">
              <span>Combo Chain</span>
              <span>x{bestStreak}</span>
            </div>
            <div className="jm-meter mt-2">
              <span style={{ width: `${comboMeter}%` }} />
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between text-xs text-jm-muted">
              <span>Pitfall Clears</span>
              <span>{hazardRate}%</span>
            </div>
            <div className="jm-meter mt-2">
              <span style={{ width: `${hazardRate}%` }} />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="p-3 rounded-xl bg-jm-surface/90 border border-white/10">
              <p className="jm-kicker">Flow</p>
              <p className="font-display text-xl text-jm-cyan mt-2">{flowScore}</p>
              <p className="text-xs text-jm-muted mt-1">Bonus +{flowBonus}</p>
            </div>
            <div className="p-3 rounded-xl bg-jm-surface/90 border border-white/10">
              <p className="jm-kicker">Sprint Bursts</p>
              <p className="font-display text-xl text-jm-acid mt-2">{sprints}</p>
              <p className="text-xs text-jm-muted mt-1">Speed spikes</p>
            </div>
            <div className="p-3 rounded-xl bg-jm-surface/90 border border-white/10">
              <p className="jm-kicker">Pitfall Clears</p>
              <p className="font-display text-xl text-jm-magenta mt-2">{hazardClears}</p>
              <p className="text-xs text-jm-muted mt-1">Bonus +{hazardBonus}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6">
        <SpeedGraph speeds={speedSeries} />
      </div>

      <div className="mt-5 flex flex-wrap gap-2 text-[0.65rem] text-jm-muted">
        <span className="jm-chip text-jm-cyan">Split Gains {improvedCount}/{segments.length}</span>
        <span className="jm-chip text-jm-magenta">Combo x{bestStreak}</span>
        <span className="jm-chip text-jm-acid">Hazard Bonus +{hazardBonus}</span>
        <span className="jm-chip text-jm-muted">HR Bonus +{hrBonus}</span>
        <span className="jm-chip text-jm-cyan">Base {basePoints}</span>
        <span className="jm-chip text-jm-acid">Speed +{speedPoints}</span>
        {detectedFeatures.map((feature) => (
          <span key={feature.label} className="jm-chip text-jm-magenta">
            {feature.label} {feature.value}
          </span>
        ))}
      </div>

      {adventure?.collectibles?.length ? (
        <div className="mt-4 flex flex-wrap gap-2 text-[0.65rem] text-jm-muted">
          {adventure.collectibles.map((item) => (
            <span key={item} className="jm-chip text-jm-magenta">Loot · {item}</span>
          ))}
        </div>
      ) : null}

      <div className="mt-6 jm-track md:grid-cols-3">
        {scoredSegments.map((segment) => (
          <div key={`${segment.label}-${segment.start_m}`} className="jm-track-segment">
            <div className="p-4 bg-jm-surface/90 rounded-xl border border-white/10">
              <p className="text-[0.55rem] uppercase tracking-[0.3em] text-jm-cyan">
                {segment.biome ?? segment.label}
              </p>
              <p className="text-sm text-jm-text mt-2">
                {segment.paceLabel} · {segment.durationLabel}
              </p>
              <p className="text-xs text-jm-muted mt-2">{segment.deltaLabel}</p>
              <div className="mt-3">
                <div className="flex items-center justify-between text-[0.55rem] uppercase tracking-[0.3em] text-jm-muted">
                  <span>Boost</span>
                  <span>{segment.improvementPct}%</span>
                </div>
                <div className="jm-meter mt-2">
                  <span style={{ width: `${segment.improvementPct}%` }} />
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-[0.6rem] text-jm-muted">
                {segment.hazards?.slice(0, 2).map((hazard) => (
                  <span key={hazard} className="jm-chip text-jm-magenta">{hazard}</span>
                ))}
                {segment.loot?.slice(0, 1).map((loot) => (
                  <span key={loot} className="jm-chip text-jm-acid">{loot}</span>
                ))}
                {segment.hazardClear && <span className="jm-chip text-jm-acid">Hazard Clear</span>}
                {segment.points > 0 && <span className="jm-chip text-jm-cyan">+{segment.points} pts</span>}
              </div>
            </div>
          </div>
        ))}
        {segments.length === 0 && (
          <p className="text-sm text-jm-muted">Run data will appear once GPS points are available.</p>
        )}
      </div>
    </Card>
  );
}
