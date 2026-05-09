import { Queue, type ConnectionOptions } from "bullmq";
import IORedis from "ioredis";

const connection = new IORedis(process.env.REDIS_URL || "redis://localhost:6379", {
  maxRetriesPerRequest: null
}) as unknown as ConnectionOptions;

export const moderationQueue = new Queue("moderation", { connection });
export const hotScoreQueue = new Queue("hotScore", { connection });
export const imageQueue = new Queue("image", { connection });
