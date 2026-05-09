export type Quest = {
  title: string;
  goal: string;
  reward: string;
  seed: number;
  expires: string;
};

export type Course = {
  id: string;
  name: string;
  description: string;
  distance_km: number;
  theme_key: string;
  best_pace_s_per_km: number | null;
  last_pace_s_per_km: number | null;
  points: number;
};

export type LootItem = {
  name: string;
  rarity: string;
  description: string;
};

export type RunEvent = {
  type: string;
  ts_s: number;
  data?: Record<string, unknown>;
};

export type RunOut = {
  id: string;
  course_id: string | null;
  distance_m: number;
  duration_s: number;
  avg_pace_s_per_km: number;
  points: number;
  improvement_s_per_km: number | null;
  created_at: string | null;
};

export type RunSummary = {
  distance_m: number;
  duration_s: number;
  avg_pace_s_per_km: number;
  events: RunEvent[];
};

export type RunCreate = RunSummary & {
  course_id: string;
  session_points?: number;
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:8000';
const STORAGE_KEY = 'jm_token';
let memoryToken: string | null = null;

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function getStoredToken() {
  if (memoryToken) return memoryToken;
  if (typeof window === 'undefined') return null;
  const token = window.localStorage.getItem(STORAGE_KEY);
  memoryToken = token;
  return token;
}

function setStoredToken(token: string | null) {
  memoryToken = token;
  if (typeof window === 'undefined') return;
  if (token) {
    window.localStorage.setItem(STORAGE_KEY, token);
  } else {
    window.localStorage.removeItem(STORAGE_KEY);
  }
}

export function clearStoredToken() {
  setStoredToken(null);
}

async function apiFetch<T>(
  path: string,
  init?: RequestInit,
  options: { auth?: boolean } = {}
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init?.headers ?? {})
  } as Record<string, string>;
  const useAuth = options.auth ?? true;
  if (useAuth) {
    const token = getStoredToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(`${API_BASE}${path}`, {
    headers,
    ...init
  });
  if (!res.ok) {
    throw new ApiError(res.status, `API ${res.status}`);
  }
  return (await res.json()) as T;
}

export async function login(email: string, password: string) {
  const res = await apiFetch<{ access_token: string }>(
    '/auth/login',
    {
      method: 'POST',
      body: JSON.stringify({ email, password })
    },
    { auth: false }
  );
  setStoredToken(res.access_token);
  return res.access_token;
}

export async function register(email: string, password: string) {
  await apiFetch(
    '/auth/register',
    {
      method: 'POST',
      body: JSON.stringify({ email, password })
    },
    { auth: false }
  );
  return login(email, password);
}

export function logout() {
  clearStoredToken();
}

export function getQuestToday() {
  return apiFetch<Quest>('/quests/today');
}

export function getCourses() {
  return apiFetch<Course[]>('/courses');
}

export function listRuns(courseId?: string) {
  const query = courseId ? `?course_id=${encodeURIComponent(courseId)}` : '';
  return apiFetch<RunOut[]>(`/runs${query}`);
}

export function createRun(payload: RunCreate) {
  return apiFetch<RunOut>('/runs', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export function rollLoot(summary: RunSummary) {
  return apiFetch<{ items: LootItem[] }>('/loot/roll', {
    method: 'POST',
    body: JSON.stringify(summary)
  }).then((res) => res.items);
}
