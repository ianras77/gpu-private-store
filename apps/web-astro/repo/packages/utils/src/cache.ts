import Redis from "ioredis";

export interface Cache {
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string, ttlSeconds?: number) => Promise<void>;
}

export const createCache = (): Cache => {
  const url = process.env.REDIS_URL;
  let redisInstance = (createCache as any)._redis as Redis | null | undefined;
  if (!redisInstance && url) {
    redisInstance = new Redis(url);
    (createCache as any)._redis = redisInstance;
  }
  const redis = redisInstance ?? null;

  return {
    async get(key) {
      if (!redis) return null;
      return redis.get(key);
    },
    async set(key, value, ttlSeconds) {
      if (!redis) return;
      if (ttlSeconds) {
        await redis.set(key, value, "EX", ttlSeconds);
      } else {
        await redis.set(key, value);
      }
    }
  };
};
