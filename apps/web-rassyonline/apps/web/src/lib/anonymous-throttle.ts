import { createHash } from "node:crypto";

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 5;
const buckets = new Map<string, { startedAt: number; count: number }>();

function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const address = forwarded || request.headers.get("x-real-ip") || "unknown";
  const userAgent = request.headers.get("user-agent") || "unknown";
  return createHash("sha256").update(`${address}\n${userAgent}`).digest("hex");
}

export function checkAnonymousThrottle(request: Request, now = Date.now()): { allowed: boolean; retryAfter: number } {
  const key = clientKey(request);
  const current = buckets.get(key);
  if (!current || now - current.startedAt >= WINDOW_MS) {
    buckets.set(key, { startedAt: now, count: 1 });
    return { allowed: true, retryAfter: 0 };
  }
  if (current.count < MAX_REQUESTS) {
    current.count += 1;
    return { allowed: true, retryAfter: 0 };
  }
  return { allowed: false, retryAfter: Math.max(1, Math.ceil((WINDOW_MS - (now - current.startedAt)) / 1000)) };
}

