import Redis from "ioredis";
export const createCache = () => {
    const url = process.env.REDIS_URL;
    let redisInstance = createCache._redis;
    if (!redisInstance && url) {
        redisInstance = new Redis(url);
        createCache._redis = redisInstance;
    }
    const redis = redisInstance ?? null;
    return {
        async get(key) {
            if (!redis)
                return null;
            return redis.get(key);
        },
        async set(key, value, ttlSeconds) {
            if (!redis)
                return;
            if (ttlSeconds) {
                await redis.set(key, value, "EX", ttlSeconds);
            }
            else {
                await redis.set(key, value);
            }
        }
    };
};
