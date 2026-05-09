import "server-only";

type RateLimitOptions = {
  windowMs: number;
  max: number;
};

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

const store = new Map<string, RateLimitEntry>();

export function rateLimit(key: string, options: RateLimitOptions) {
  const now = Date.now();
  const entry = store.get(key);
  if (!entry || entry.resetAt <= now) {
    const next: RateLimitEntry = { count: 1, resetAt: now + options.windowMs };
    store.set(key, next);
    return { ok: true, remaining: options.max - 1, resetAt: next.resetAt };
  }

  if (entry.count >= options.max) {
    return { ok: false, remaining: 0, resetAt: entry.resetAt };
  }

  entry.count += 1;
  return { ok: true, remaining: options.max - entry.count, resetAt: entry.resetAt };
}
