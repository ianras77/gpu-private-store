const publicApiBase = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "").replace(/\/$/, "");
const internalApiBase = (process.env.API_INTERNAL_BASE_URL ?? "http://bat-api:8000").replace(/\/$/, "");

// Keep browser traffic on the web app's own `/api/v1` proxy so rebuilt settings
// don't depend on a baked client-side API host.
export const apiBase = "";

function resolveApiBase(): string {
  return typeof window === "undefined" ? internalApiBase || publicApiBase : "";
}

function joinApiUrl(base: string, path: string): string {
  if (!base) {
    return path;
  }
  return `${base.replace(/\/$/, "")}${path}`;
}

export async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(joinApiUrl(resolveApiBase(), path), { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`API request failed: ${response.status}`);
  }
  return (await response.json()) as T;
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(joinApiUrl(resolveApiBase(), path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`API request failed: ${response.status}`);
  }
  return (await response.json()) as T;
}

export function safeDate(value?: string): string {
  if (!value) {
    return "-";
  }
  try {
    return new Date(value).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return value;
  }
}

export function safeRelativeDate(value?: string): string {
  if (!value) {
    return "Unknown";
  }
  try {
    const then = new Date(value).getTime();
    const now = Date.now();
    const deltaMinutes = Math.round((then - now) / 60000);
    const absMinutes = Math.abs(deltaMinutes);
    if (absMinutes < 60) {
      return deltaMinutes >= 0 ? `in ${absMinutes}m` : `${absMinutes}m ago`;
    }
    const absHours = Math.round(absMinutes / 60);
    if (absHours < 48) {
      return deltaMinutes >= 0 ? `in ${absHours}h` : `${absHours}h ago`;
    }
    const absDays = Math.round(absHours / 24);
    return deltaMinutes >= 0 ? `in ${absDays}d` : `${absDays}d ago`;
  } catch {
    return value;
  }
}
