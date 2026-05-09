import type { FastifyBaseLogger, FastifyReply, FastifyRequest } from "fastify";
import { createCache } from "@astro/utils";
import { DEFAULT_BRAND_ID, toBrandId } from "./brand";
import { ApiError, sendApiError } from "./http-errors";

type StoreKind = "redis" | "memory";

type CounterState = {
  count: number;
  resetAt: number;
};

const MEMORY_MAX = Number(process.env.RATE_LIMIT_MEMORY_MAX ?? 5_000);

class HybridRateLimiter {
  private memory = new Map<string, CounterState>();

  private cache = createCache();

  private redisConfigured = Boolean(process.env.REDIS_URL);

  private redisWarningLogged = false;

  private memoryWarningLogged = false;

  constructor(private readonly logger: FastifyBaseLogger) {}

  private touchMemory(key: string, value: CounterState) {
    this.memory.delete(key);
    this.memory.set(key, value);
    if (this.memory.size > MEMORY_MAX) {
      const oldest = this.memory.keys().next().value;
      if (oldest) this.memory.delete(oldest);
    }
  }

  private consumeMemory(key: string, max: number, windowMs: number) {
    const now = Date.now();
    const hit = this.memory.get(key);
    let state: CounterState;
    if (!hit || hit.resetAt <= now) {
      state = { count: 1, resetAt: now + windowMs };
    } else {
      state = { count: hit.count + 1, resetAt: hit.resetAt };
    }
    this.touchMemory(key, state);
    return {
      allowed: state.count <= max,
      remaining: Math.max(0, max - state.count),
      resetAt: state.resetAt,
      store: "memory" as StoreKind
    };
  }

  private async consumeRedis(key: string, max: number, windowMs: number) {
    const now = Date.now();
    const raw = await this.cache.get(key);
    const parsed = raw ? (JSON.parse(raw) as CounterState) : null;
    let state: CounterState;
    if (!parsed || parsed.resetAt <= now) {
      state = { count: 1, resetAt: now + windowMs };
    } else {
      state = { count: parsed.count + 1, resetAt: parsed.resetAt };
    }
    const ttlSeconds = Math.max(1, Math.ceil((state.resetAt - now) / 1000));
    await this.cache.set(key, JSON.stringify(state), ttlSeconds);
    this.touchMemory(key, state);
    return {
      allowed: state.count <= max,
      remaining: Math.max(0, max - state.count),
      resetAt: state.resetAt,
      store: "redis" as StoreKind
    };
  }

  async consume(key: string, max: number, windowMs: number) {
    if (this.redisConfigured) {
      try {
        return await this.consumeRedis(key, max, windowMs);
      } catch (error) {
        if (!this.redisWarningLogged) {
          this.logger.warn(
            {
              err: error,
              key
            },
            "Redis rate-limit storage unavailable. Falling back to in-memory counters."
          );
          this.redisWarningLogged = true;
        }
      }
    } else if (!this.memoryWarningLogged) {
      this.logger.warn("REDIS_URL is not set. Using in-memory rate limiter.");
      this.memoryWarningLogged = true;
    }
    return this.consumeMemory(key, max, windowMs);
  }
}

const limiterByScope = new Map<string, HybridRateLimiter>();

const bodyBrandId = (body: unknown) => {
  if (!body || typeof body !== "object") return undefined;
  const candidate = (body as Record<string, unknown>).brandId;
  return toBrandId(candidate);
};

export const getRateLimitIdentity = (request: FastifyRequest) => {
  const ip = request.ip || "unknown";
  const brandId = bodyBrandId(request.body) ?? request.brandId ?? DEFAULT_BRAND_ID;
  return { ip, brandId };
};

export const enforceRateLimit = async ({
  request,
  reply,
  scope,
  max,
  windowMs
}: {
  request: FastifyRequest;
  reply: FastifyReply;
  scope: string;
  max: number;
  windowMs: number;
}) => {
  const limiter = limiterByScope.get(scope) ?? new HybridRateLimiter(request.log);
  limiterByScope.set(scope, limiter);
  const { ip, brandId } = getRateLimitIdentity(request);
  const key = `rate:${scope}:${brandId}:${ip}`;
  const result = await limiter.consume(key, max, windowMs);

  reply.header("x-ratelimit-limit", String(max));
  reply.header("x-ratelimit-remaining", String(result.remaining));
  reply.header("x-ratelimit-reset", String(Math.ceil(result.resetAt / 1000)));

  if (!result.allowed) {
    return sendApiError(
      reply,
      request.id,
      new ApiError("RATE_LIMITED", "Rate limit exceeded.", {
        statusCode: 429,
        details: {
          scope,
          brandId,
          ip,
          store: result.store
        }
      }),
      request.log
    );
  }

  return null;
};
