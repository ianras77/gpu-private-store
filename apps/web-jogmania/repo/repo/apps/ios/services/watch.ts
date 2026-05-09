import type { LocationPoint, WorkoutCapture } from "./healthkit";
import { elevationGainMeters, haversineMeters } from "./geo";

export type WatchWorkoutPayload = WorkoutCapture & {
  source: "watch";
  raw_payload_json?: Record<string, unknown> | null;
};

function summarizePoints(points: LocationPoint[]) {
  if (points.length < 2) {
    return {
      started_at: new Date().toISOString(),
      ended_at: new Date().toISOString(),
      duration_s: 1,
      distance_m: 0,
      avg_pace_s_per_km: 0,
      elevation_gain_m: 0
    };
  }

  const started_at = points[0].timestamp;
  const ended_at = points[points.length - 1].timestamp;
  const duration_s = Math.max(
    1,
    Math.round((new Date(ended_at).getTime() - new Date(started_at).getTime()) / 1000)
  );
  let distance_m = 0;
  for (let i = 1; i < points.length; i += 1) {
    distance_m += haversineMeters(
      points[i - 1].lat,
      points[i - 1].lon,
      points[i].lat,
      points[i].lon
    );
  }
  const avg_pace_s_per_km = distance_m > 0 ? duration_s / (distance_m / 1000) : 0;
  const elevation_gain_m = elevationGainMeters(points);

  return { started_at, ended_at, duration_s, distance_m, avg_pace_s_per_km, elevation_gain_m };
}

function mockWatchPoints(count = 36): LocationPoint[] {
  const baseLat = 37.7812;
  const baseLon = -122.4042;
  const baseTime = Date.now() - count * 12000;
  const points: LocationPoint[] = [];
  for (let idx = 0; idx < count; idx += 1) {
    points.push({
      lat: baseLat + idx * 0.00025,
      lon: baseLon + idx * 0.00018,
      altitude_m: 18 + idx * 0.25,
      timestamp: new Date(baseTime + idx * 12000).toISOString(),
      accuracy_m: 6
    });
  }
  return points;
}

export function buildMockWatchWorkout(): WatchWorkoutPayload {
  const points = mockWatchPoints();
  const summary = summarizePoints(points);

  return {
    source: "watch",
    ...summary,
    calories_kcal: 280,
    avg_hr: 148,
    gps_points: points,
    raw_payload_json: {
      capture_mode: "watch_sim",
      point_count: points.length
    }
  };
}
