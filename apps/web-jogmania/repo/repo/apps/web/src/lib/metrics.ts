import type { GpsPoint } from "@jogmania/shared";

export type SegmentDefinition = {
  index: number;
  start_m: number;
  end_m: number;
  label: string;
  biome?: string;
  hazards?: string[];
  loot?: string[];
};

export type SegmentStat = {
  duration_s: number;
  distance_m: number;
  pace_s_per_km: number;
};

const EARTH_RADIUS_M = 6371000;

export function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const dphi = ((lat2 - lat1) * Math.PI) / 180;
  const dlambda = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dphi / 2) ** 2 +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(dlambda / 2) ** 2;
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function normalizeTimestamp(ts: string | Date) {
  if (ts instanceof Date) return ts.getTime();
  const parsed = new Date(ts);
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

export function buildSeries(points: GpsPoint[]) {
  const distances: number[] = [];
  const times: number[] = [];
  let cumulative = 0;
  points.forEach((point, idx) => {
    if (idx === 0) {
      distances.push(0);
      times.push(normalizeTimestamp(point.timestamp));
      return;
    }
    const prev = points[idx - 1];
    cumulative += haversineMeters(prev.lat, prev.lon, point.lat, point.lon);
    distances.push(cumulative);
    times.push(normalizeTimestamp(point.timestamp));
  });
  return { distances, times, totalDistance: cumulative };
}

export function computeSpeedSeries(points: GpsPoint[]) {
  const speeds: number[] = [];
  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1];
    const curr = points[i];
    const dt = (normalizeTimestamp(curr.timestamp) - normalizeTimestamp(prev.timestamp)) / 1000;
    if (!Number.isFinite(dt) || dt <= 0) continue;
    const dist = haversineMeters(prev.lat, prev.lon, curr.lat, curr.lon);
    speeds.push(dist / dt);
  }
  return speeds;
}

export function consistencyScore(speeds: number[]) {
  if (speeds.length < 3) return 0;
  const mean = speeds.reduce((acc, value) => acc + value, 0) / speeds.length;
  if (!Number.isFinite(mean) || mean <= 0) return 0;
  const variance =
    speeds.reduce((acc, value) => acc + (value - mean) ** 2, 0) / speeds.length;
  const std = Math.sqrt(variance);
  const cv = std / mean;
  const score = Math.max(0, Math.min(100, Math.round(100 - cv * 100)));
  return score;
}

function percentile(values: number[], p: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round((p / 100) * (sorted.length - 1))));
  return sorted[idx];
}

export function sprintCount(speeds: number[]) {
  if (speeds.length < 4) return 0;
  const threshold = percentile(speeds, 85);
  return speeds.filter((value) => value >= threshold).length;
}

function timeAtDistance(distances: number[], times: number[], target: number) {
  if (!distances.length) return 0;
  if (target <= 0) return times[0];
  if (target >= distances[distances.length - 1]) return times[times.length - 1];
  for (let i = 1; i < distances.length; i += 1) {
    if (distances[i] >= target) {
      const d0 = distances[i - 1];
      const d1 = distances[i];
      const t0 = times[i - 1];
      const t1 = times[i];
      const span = d1 - d0;
      if (!Number.isFinite(span) || span <= 0) return t1;
      const ratio = (target - d0) / span;
      return t0 + ratio * (t1 - t0);
    }
  }
  return times[times.length - 1];
}

export function computeSegmentStats(points: GpsPoint[], segments: SegmentDefinition[]): SegmentStat[] {
  if (points.length < 2 || segments.length === 0) return [];
  const { distances, times } = buildSeries(points);
  return segments.map((segment) => {
    const startTime = timeAtDistance(distances, times, segment.start_m);
    const endTime = timeAtDistance(distances, times, segment.end_m);
    const duration_s = Math.max(0, (endTime - startTime) / 1000);
    const distance_m = Math.max(0.01, segment.end_m - segment.start_m);
    const pace_s_per_km = distance_m > 0 ? duration_s / (distance_m / 1000) : 0;
    return { duration_s, distance_m, pace_s_per_km };
  });
}

export function pointAtDistance(points: GpsPoint[], target: number) {
  if (points.length < 2) return null;
  const { distances } = buildSeries(points);
  if (!distances.length) return null;
  if (target <= 0) return { lat: points[0].lat, lon: points[0].lon };
  if (target >= distances[distances.length - 1]) {
    const last = points[points.length - 1];
    return { lat: last.lat, lon: last.lon };
  }
  for (let i = 1; i < distances.length; i += 1) {
    if (distances[i] >= target) {
      const prev = points[i - 1];
      const next = points[i];
      const d0 = distances[i - 1];
      const d1 = distances[i];
      const span = d1 - d0;
      const ratio = span > 0 ? (target - d0) / span : 0;
      return {
        lat: prev.lat + (next.lat - prev.lat) * ratio,
        lon: prev.lon + (next.lon - prev.lon) * ratio
      };
    }
  }
  return null;
}

export function formatDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "-";
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.round(seconds % 60);
  return `${minutes}:${remainder.toString().padStart(2, "0")}`;
}

export function formatPace(secondsPerKm: number) {
  if (!Number.isFinite(secondsPerKm) || secondsPerKm <= 0) return "-";
  return `${formatDuration(secondsPerKm)} /km`;
}

export function heartRateZone(avgHr?: number | null) {
  if (!avgHr || !Number.isFinite(avgHr)) {
    return { label: "No HR zone", tone: "slate" as const };
  }
  if (avgHr < 120) return { label: "Zone 1 · Cruise", tone: "cyan" as const };
  if (avgHr < 140) return { label: "Zone 2 · Endurance", tone: "acid" as const };
  if (avgHr < 160) return { label: "Zone 3 · Tempo", tone: "magenta" as const };
  if (avgHr < 175) return { label: "Zone 4 · Threshold", tone: "magenta" as const };
  return { label: "Zone 5 · Max", tone: "magenta" as const };
}
