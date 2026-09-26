import Redis from "ioredis";
import { config } from "./config";

export const redis = new Redis(config.REDIS_URL, {
  maxRetriesPerRequest: 5,
  // Pure unit tests import helpers that share this singleton; do not open a
  // real socket merely because a helper's dependency graph includes Redis.
  lazyConnect: process.env.NODE_ENV === "test"
});
