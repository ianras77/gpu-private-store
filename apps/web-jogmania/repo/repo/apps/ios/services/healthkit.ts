import * as Location from "expo-location";
import { haversineMeters } from "./geo";

export type LocationPoint = {
  lat: number;
  lon: number;
  altitude_m?: number | null;
  timestamp: string;
  accuracy_m?: number | null;
};

export type WorkoutCapture = {
  started_at: string;
  ended_at: string;
  duration_s: number;
  distance_m: number;
  avg_pace_s_per_km: number;
  calories_kcal?: number | null;
  avg_hr?: number | null;
  elevation_gain_m?: number | null;
  gps_points: LocationPoint[];
};

export type CaptureMode = "gps" | "mock";

export interface HealthKitService {
  getHealthPermission(): Promise<boolean>;
  startWorkout(): Promise<void>;
  stopWorkout(): Promise<void>;
  streamLocationPoints(callback: (point: LocationPoint) => void): () => void;
}

type StreamOptions = {
  accuracyThresholdM: number;
  minDistanceM: number;
  minTimeMs: number;
};

const DEFAULT_STREAM_OPTIONS: StreamOptions = {
  accuracyThresholdM: 35,
  minDistanceM: 3,
  minTimeMs: 1000
};

export class ExpoLocationHealthKitService implements HealthKitService {
  private subscription: Location.LocationSubscription | null = null;
  private lastPoint: LocationPoint | null = null;
  private lastTimestampMs: number | null = null;
  private options: StreamOptions;
  private active = false;

  constructor(options?: Partial<StreamOptions>) {
    this.options = { ...DEFAULT_STREAM_OPTIONS, ...options };
  }

  async getHealthPermission(): Promise<boolean> {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") {
      return false;
    }
    const enabled = await Location.hasServicesEnabledAsync();
    return enabled;
  }

  async startWorkout(): Promise<void> {
    this.lastPoint = null;
    this.lastTimestampMs = null;
    this.active = true;
  }

  async stopWorkout(): Promise<void> {
    this.active = false;
    if (this.subscription) {
      this.subscription.remove();
      this.subscription = null;
    }
  }

  streamLocationPoints(callback: (point: LocationPoint) => void): () => void {
    void this.startStream(callback);
    return () => {
      void this.stopWorkout();
    };
  }

  private async startStream(callback: (point: LocationPoint) => void) {
    if (this.subscription) return;
    const perm = await Location.getForegroundPermissionsAsync();
    if (perm.status !== "granted") {
      const req = await Location.requestForegroundPermissionsAsync();
      if (req.status !== "granted") return;
    }
    const enabled = await Location.hasServicesEnabledAsync();
    if (!enabled || !this.active) return;

    this.subscription = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.BestForNavigation,
        timeInterval: 1000,
        distanceInterval: 1
      },
      (loc) => {
        if (!this.active) return;
        const point: LocationPoint = {
          lat: loc.coords.latitude,
          lon: loc.coords.longitude,
          altitude_m: loc.coords.altitude ?? null,
          timestamp: new Date(loc.timestamp).toISOString(),
          accuracy_m: loc.coords.accuracy ?? null
        };
        if (!this.shouldAccept(point)) {
          return;
        }
        this.lastPoint = point;
        this.lastTimestampMs = new Date(point.timestamp).getTime();
        callback(point);
      }
    );
  }

  private shouldAccept(point: LocationPoint): boolean {
    if (point.accuracy_m != null && point.accuracy_m > this.options.accuracyThresholdM) {
      return false;
    }
    if (!this.lastPoint) return true;
    const dist = haversineMeters(this.lastPoint.lat, this.lastPoint.lon, point.lat, point.lon);
    const lastTs = this.lastTimestampMs ?? new Date(this.lastPoint.timestamp).getTime();
    const dt = new Date(point.timestamp).getTime() - lastTs;
    if (dist < this.options.minDistanceM && dt < this.options.minTimeMs) {
      return false;
    }
    return true;
  }
}

export class MockHealthKitService implements HealthKitService {
  private interval: ReturnType<typeof setInterval> | null = null;
  private points: LocationPoint[] = [];

  async getHealthPermission(): Promise<boolean> {
    return true;
  }

  async startWorkout(): Promise<void> {
    this.points = [];
  }

  async stopWorkout(): Promise<void> {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  streamLocationPoints(callback: (point: LocationPoint) => void): () => void {
    const baseLat = 37.7749;
    const baseLon = -122.4194;
    const baseTime = Date.now() - 40 * 15000;
    let idx = 0;
    this.interval = setInterval(() => {
      const point = {
        lat: baseLat + idx * 0.0003,
        lon: baseLon + idx * 0.0002,
        altitude_m: 12 + idx * 0.3,
        timestamp: new Date(baseTime + idx * 15000).toISOString(),
        accuracy_m: 5
      };
      this.points.push(point);
      callback(point);
      idx += 1;
      if (idx > 40) {
        void this.stopWorkout();
      }
    }, 1000);

    return () => {
      if (this.interval) {
        clearInterval(this.interval);
        this.interval = null;
      }
    };
  }
}

export function resolveCaptureMode(): CaptureMode {
  const raw = process.env.EXPO_PUBLIC_CAPTURE_MODE?.toLowerCase();
  if (raw === "mock" || raw === "gps") return raw;
  return "gps";
}

export function createHealthKitService(mode: CaptureMode = resolveCaptureMode()): HealthKitService {
  return mode === "mock" ? new MockHealthKitService() : new ExpoLocationHealthKitService();
}
