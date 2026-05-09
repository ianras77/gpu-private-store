import Redis from "ioredis";
import { serverConfig } from "./server-config";

const redis = new Redis(serverConfig.REDIS_URL, {
  maxRetriesPerRequest: 2,
  lazyConnect: true,
  enableOfflineQueue: false
});

redis.on("error", () => {
  // Avoid noisy "Unhandled error event" logs when Redis isn't reachable.
});
const memoryStore = new Map<string, { count: number; resetAt: number }>();

const memoryRateLimit = (key: string, limit: number, windowSeconds: number) => {
  const now = Date.now();
  const windowMs = windowSeconds * 1000;

  for (const [entryKey, entry] of memoryStore.entries()) {
    if (entry.resetAt <= now) {
      memoryStore.delete(entryKey);
    }
  }

  const existing = memoryStore.get(key);
  if (!existing || existing.resetAt <= now) {
    memoryStore.set(key, { count: 1, resetAt: now + windowMs });
    return {
      allowed: true,
      remaining: Math.max(0, limit - 1),
      source: "memory"
    };
  }

  existing.count += 1;
  memoryStore.set(key, existing);
  return {
    allowed: existing.count <= limit,
    remaining: Math.max(0, limit - existing.count),
    source: "memory"
  };
};

export const rateLimit = async (key: string, limit: number, windowSeconds: number) => {
  try {
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, windowSeconds);
    }
    return {
      allowed: count <= limit,
      remaining: Math.max(0, limit - count),
      source: "redis"
    };
  } catch {
    return memoryRateLimit(key, limit, windowSeconds);
  }
};
