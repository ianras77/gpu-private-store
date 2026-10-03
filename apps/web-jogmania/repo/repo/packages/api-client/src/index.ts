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

export type CourseChapter = {
  visits_required: number;
  title: string;
  story: string;
  keepsake: string;
  keepsake_icon: string;
  item_key: string;
  unlocked: boolean;
};

export type CourseMastery = {
  route_id: string;
  route_name: string;
  visits: number;
  level: number;
  title: string;
  progress_percent: number;
  next_chapter?: CourseChapter | null;
  chapters: CourseChapter[];
};

export type WorldDecorationSlot =
  | "roof-left" | "roof-center" | "roof-right"
  | "window-left" | "window-right" | "garden-left" | "garden-center" | "garden-right";

export type ArcadeDecoration = {
  slot: WorldDecorationSlot;
  item_key: "lantern-arch" | "prize-fox" | "star-bunting" | "flower-pot" | "neon-puddle";
  title: string;
  icon: string;
  owned_by_me: boolean;
  placed_at: string;
};

export type ArcadeDecorationChoice = {
  key: ArcadeDecoration["item_key"];
  title: string;
  icon: string;
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

export type AdventureEvent = {
  id: string;
  trigger_kind: "distance" | "elapsed";
  trigger_value: number;
  kind: "discovery" | "companion" | "collectible" | "chapter" | "finish";
  title: string;
  message: string;
  visual_key: string;
  haptic: "tap" | "success" | "celebration";
};

export type AdventureCartridge = {
  id: string;
  title: string;
  world_name: string;
  course_name: string;
  intent: "easy" | "steady" | "explore" | "repeat" | "surprise";
  opening_line: string;
  finish_line: string;
  events: AdventureEvent[];
  reward_preview: string;
  target_distance_m: number;
  haptics_enabled: boolean;
  health_data_enabled: boolean;
  intelligence: "mastra" | "fallback";
  runner_snapshot: Record<string, unknown>;
};

export type RunnerPreferences = {
  adventure_tone: "silly" | "storybook" | "mystery";
  run_intention: "easy" | "steady" | "explore" | "repeat" | "surprise";
  haptics_enabled: boolean;
  health_data_enabled: boolean;
  story_feedback: "default" | "more_grounded" | "more_silly" | "shorter";
};

export type ProgressionLedgerEntry = {
  id: string;
  workout_id: string;
  ledger_version: number;
  reason_code: string;
  sparks: number;
  payload_json: Record<string, unknown>;
  created_at: string;
};

export type RunnerProfile = {
  preferences: RunnerPreferences;
  snapshot: Record<string, unknown>;
};

export type AdventureSession = {
  id: string;
  route_id?: string | null;
  status: string;
  cartridge: AdventureCartridge;
  event_log: Array<{ id: string; title: string; kind: string }>;
  recap: Record<string, unknown>;
  world_change: Record<string, unknown>;
  workout_id?: string | null;
  created_at: string;
};

export type AdventureWorld = {
  id?: string;
  name: string;
  chapter: string;
  theme?: string;
  player_level?: number;
  sparks?: number;
  next_level_sparks?: number;
  arcade: {
    runs?: number;
    lights?: string[];
    chapter_lights?: string[];
    last_light?: string;
    next_surprise?: string;
    [key: string]: unknown;
  };
  decorations?: ArcadeDecoration[];
  decoration_slots?: WorldDecorationSlot[];
  decoration_catalog?: ArcadeDecorationChoice[];
  decoration_tokens?: number;
  recent_adventures?: AdventureSession[];
};

export type Party = {
  id: string;
  name: string;
  invite_code: string;
  is_worldkeeper: boolean;
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

  getCourseMastery(id: string) {
    return this.request<CourseMastery>(`/routes/${id}/mastery`);
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

  joinParty(inviteCode: string, displayName: string) {
    return this.request<Party>("/parties/join", {
      method: "POST",
      body: JSON.stringify({ invite_code: inviteCode, display_name: displayName })
    });
  }

  leaveParty(id: string) {
    return this.request<{ left: boolean }>(`/parties/${id}/leave`, { method: "DELETE" });
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

  getRunnerProfile() {
    return this.request<RunnerProfile>("/adventure/profile");
  }

  updateRunnerProfile(payload: Partial<RunnerPreferences>) {
    return this.request<RunnerProfile>("/adventure/profile", {
      method: "PUT",
      body: JSON.stringify(payload)
    });
  }

  clearRunnerMemory() {
    return this.request<{ cleared: boolean }>("/adventure/profile", { method: "DELETE" });
  }

  submitAdventureFeedback(sessionId: string, payload: { felt_personal: boolean; style_correction: RunnerPreferences["story_feedback"] }) {
    return this.request<{ saved: boolean; story_feedback: RunnerPreferences["story_feedback"] }>(`/adventure/sessions/${sessionId}/feedback`, {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }

  createAdventureCartridge(routeId: string, intent: RunnerPreferences["run_intention"] = "surprise") {
    return this.request<AdventureCartridge>("/adventure/cartridges", {
      method: "POST",
      body: JSON.stringify({ route_id: routeId, intent })
    });
  }

  getAdventureSession(id: string) {
    return this.request<AdventureSession>(`/adventure/sessions/${id}`);
  }

  getAdventureWorld() {
    return this.request<AdventureWorld>("/adventure/world");
  }

  placeWorldDecoration(slot: WorldDecorationSlot, itemKey: ArcadeDecoration["item_key"]) {
    return this.request<ArcadeDecoration>("/adventure/world/decorations", {
      method: "POST",
      body: JSON.stringify({ slot, item_key: itemKey })
    });
  }

  removeWorldDecoration(slot: WorldDecorationSlot) {
    return this.request<{ removed: boolean; returned_tokens: number }>(`/adventure/world/decorations/${slot}`, {
      method: "DELETE"
    });
  }

  getRewards() {
    return this.request<Reward[]>("/rewards");
  }

  getInventory() {
    return this.request<InventoryItem[]>("/inventory");
  }

  getProgressionLedger() {
    return this.request<ProgressionLedgerEntry[]>("/progression/ledger");
  }

  exportWorkout(workoutId: string) {
    return this.request<{ url: string }>(`/exports/workout/${workoutId}`, {
      method: "POST"
    });
  }
}
