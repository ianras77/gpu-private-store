import type { AdventureSummary, GpsPoint, Route, Workout } from "@jogmania/shared";

export type AuthResponse = {
  access_token?: string | null;
  token_type?: "bearer";
  requires_verification?: boolean;
  message?: string | null;
};

export type User = {
  id: string;
  email: string;
  created_at: string;
};

export type DeviceRegisterPayload = {
  platform: string;
  device_id: string;
  name?: string | null;
  companion_device_id?: string | null;
  metadata_json?: Record<string, unknown> | null;
};

export type Device = {
  id: string;
  platform: string;
  device_id: string;
  name?: string | null;
  companion_device_id?: string | null;
  metadata_json?: Record<string, unknown> | null;
  created_at: string;
  last_seen_at: string;
  last_sync_at?: string | null;
};

export type WorkoutCreatePayload = {
  source: "ios" | "watch" | string;
  started_at: string;
  ended_at: string;
  duration_s: number;
  distance_m: number;
  avg_pace_s_per_km: number;
  calories_kcal?: number | null;
  avg_hr?: number | null;
  elevation_gain_m?: number | null;
  route_id?: string | null;
  device_id?: string | null;
  raw_payload_json?: Record<string, unknown> | null;
  gps_points: Array<{
    lat: number;
    lon: number;
    altitude_m?: number | null;
    timestamp: string;
    accuracy_m?: number | null;
  }>;
};

export type WorkoutDetail = Workout & {
  gps_points: GpsPoint[];
  route_id?: string | null;
};

export type RouteDetail = Route & {
  instances: Array<{
    id: string;
    workout_id: string;
    instance_seed: number;
    difficulty: number;
    created_at: string;
  }>;
  workouts: Workout[];
};

export type Reward = {
  id: string;
  type: string;
  payload_json: Record<string, unknown>;
  earned_at: string;
};

export type InventoryItem = {
  id: string;
  item_key: string;
  quantity: number;
  updated_at: string;
};

export type PartyMember = {
  id: string;
  name: string;
  role: string;
  created_at: string;
};

export type World = {
  id: string;
  name: string;
  theme: string;
  seed: number;
  route_id?: string | null;
  state_json: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type WorldEvent = {
  id: string;
  title: string;
  payload_json: Record<string, unknown>;
  created_at: string;
  workout_id?: string | null;
};

export type Party = {
  id: string;
  name: string;
  created_at: string;
  members: PartyMember[];
  world?: World | null;
};

export type PartyCreatePayload = {
  name: string;
  world_name?: string | null;
  world_theme?: string | null;
  members?: Array<{ name: string; role: string }>;
};

export type ApiClientOptions = {
  baseUrl: string;
  token?: string | null;
  fetchFn?: typeof fetch;
};

export class ApiClient {
  private baseUrl: string;
  private token?: string | null;
  private fetchFn: typeof fetch;

  constructor(opts: ApiClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, "");
    this.token = opts.token;
    this.fetchFn = opts.fetchFn ?? fetch;
  }

  setToken(token?: string | null) {
    this.token = token;
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers ?? {});
    headers.set("Content-Type", "application/json");
    if (this.token) {
      headers.set("Authorization", `Bearer ${this.token}`);
    }

    const res = await this.fetchFn(`${this.baseUrl}${path}`, {
      ...init,
      headers,
      credentials: "include"
    });

    if (!res.ok) {
      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        const data = await res.json();
        if (data?.detail) {
          if (Array.isArray(data.detail)) {
            const detail = data.detail as Array<{ msg?: string }>;
            const message = detail
              .map((item) => item.msg ?? "")
              .filter((msg): msg is string => Boolean(msg))
              .join(", ");
            throw new Error(message || `Request failed: ${res.status}`);
          }
          throw new Error(data.detail);
        }
        throw new Error(JSON.stringify(data));
      }
      const text = await res.text();
      throw new Error(text || `Request failed: ${res.status}`);
    }

    if (res.status === 204) {
      return undefined as T;
    }

    return (await res.json()) as T;
  }

  register(email: string, password: string) {
    return this.request<AuthResponse>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password })
    });
  }

  login(email: string, password: string) {
    return this.request<AuthResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password })
    });
  }

  logout() {
    return this.request<void>("/auth/logout", {
      method: "POST"
    });
  }

  verifyEmail(token: string) {
    const encoded = encodeURIComponent(token);
    return this.request<{ status: string }>(`/auth/verify?token=${encoded}`);
  }

  me() {
    return this.request<User>("/me");
  }

  listDevices() {
    return this.request<Device[]>("/devices");
  }

  registerDevice(payload: DeviceRegisterPayload) {
    return this.request<Device>("/devices/register", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }

  createWorkout(payload: WorkoutCreatePayload) {
    return this.request<WorkoutDetail>("/workouts", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }

  listWorkouts() {
    return this.request<Workout[]>("/workouts");
  }

  getWorkout(id: string) {
    return this.request<WorkoutDetail>(`/workouts/${id}`);
  }

  listRoutes() {
    return this.request<Route[]>("/routes");
  }

  getRoute(id: string) {
    return this.request<RouteDetail>(`/routes/${id}`);
  }

  renameRoute(id: string, name: string) {
    return this.request<Route>(`/routes/${id}/rename`, {
      method: "POST",
      body: JSON.stringify({ name })
    });
  }

  activateRoute(id: string) {
    return this.request<Route>(`/routes/${id}/activate`, {
      method: "POST"
    });
  }

  listParties() {
    return this.request<Party[]>("/parties");
  }

  createParty(payload: PartyCreatePayload) {
    return this.request<Party>("/parties", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }

  getParty(id: string) {
    return this.request<Party>(`/parties/${id}`);
  }

  addPartyMember(id: string, name: string, role: string) {
    return this.request<PartyMember>(`/parties/${id}/members`, {
      method: "POST",
      body: JSON.stringify({ name, role })
    });
  }

  enterWorld(partyId: string, routeId: string) {
    return this.request<World>(`/parties/${partyId}/world/enter`, {
      method: "POST",
      body: JSON.stringify({ route_id: routeId })
    });
  }

  playWorld(partyId: string, workoutId: string) {
    return this.request<WorldEvent>(`/parties/${partyId}/world/play`, {
      method: "POST",
      body: JSON.stringify({ workout_id: workoutId })
    });
  }

  listWorldEvents(partyId: string) {
    return this.request<WorldEvent[]>(`/parties/${partyId}/world/events`);
  }

  getAdventuresByWorkout(workoutId: string) {
    return this.request<AdventureSummary>(`/adventures/by-workout/${workoutId}`);
  }

  getAdventuresByRoute(routeId: string) {
    return this.request<AdventureSummary[]>(`/adventures/by-route/${routeId}`);
  }

  getRewards() {
    return this.request<Reward[]>("/rewards");
  }

  getInventory() {
    return this.request<InventoryItem[]>("/inventory");
  }

  exportWorkout(workoutId: string) {
    return this.request<{ url: string }>(`/exports/workout/${workoutId}`, {
      method: "POST"
    });
  }
}
