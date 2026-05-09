import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import sensible from "@fastify/sensible";
import authPlugin from "./plugins/auth";
import talesRoutes from "./routes/tales";
import moderationRoutes from "./routes/moderation";
import imageRoutes from "./routes/images";
import miscRoutes from "./routes/misc";
import leaderboardRoutes from "./routes/leaderboard";

export function buildApp() {
  const app = Fastify({ logger: true });

  app.register(cors, {
    origin: process.env.APP_URL || true,
    credentials: true
  });

  app.register(rateLimit, {
    max: 600,
    timeWindow: "1 minute"
  });

  app.register(multipart, {
    limits: {
      fileSize: 25 * 1024 * 1024
    }
  });

  app.register(sensible);
  app.register(authPlugin);

  app.register(miscRoutes);
  app.register(talesRoutes, { prefix: "/tales" });
  app.register(moderationRoutes, { prefix: "/moderation" });
  app.register(imageRoutes, { prefix: "/images" });
  app.register(leaderboardRoutes, { prefix: "/leaderboard" });

  return app;
}
