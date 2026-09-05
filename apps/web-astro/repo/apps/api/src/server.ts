import "dotenv/config";
import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import { geoRoutes } from "./routes/geo";
import { chartRoutes } from "./routes/chart";
import { readingRoutes } from "./routes/reading";
import { compatibilityRoutes } from "./routes/compatibility";
import { meRoutes } from "./routes/me";
import { chartsRoutes } from "./routes/charts";
import { accountRoutes } from "./routes/account";
import { loreRoutes } from "./routes/lore";
import { humanGuideRoutes } from "./routes/human-guide";
import { authRoutes } from "./routes/auth";
import { contentRoutes } from "./routes/content";
import { reportPlanRoutes } from "./routes/report-plans";
import { reportRunRoutes } from "./routes/report-runs";
import { reportRoutes } from "./routes/reports";
import { chartCompanionRoutes } from "./routes/chart-companion";
import { inferBrandId } from "./lib/brand";
import { sendApiError } from "./lib/http-errors";
import { getGeoProviderHealth } from "./lib/geo";
import { runEsotericaIngest } from "./lib/esoterica-ingestor";

let esotericaRefreshing = false;

const runEsotericaRefresh = async (logger: ReturnType<typeof Fastify>["log"]) => {
  if (esotericaRefreshing) return;
  esotericaRefreshing = true;
  try {
    const result = await runEsotericaIngest({
      writeJsonl: process.env.ESOTERICA_WRITE_JSONL === "1"
    });
    logger.info(
      {
        filesDiscovered: result.filesDiscovered,
        filesChanged: result.filesChanged,
        filesSkipped: result.filesSkipped,
        filesFailed: result.filesFailed,
        chunksEmbedded: result.chunksEmbedded,
        chunksUpserted: result.chunksUpserted,
        collection: result.collection
      },
      "Esoterica index refresh complete."
    );
  } catch (error) {
    logger.error(error, "Esoterica index refresh failed.");
  } finally {
    esotericaRefreshing = false;
  }
};

const scheduleEsotericaRefresh = (logger: ReturnType<typeof Fastify>["log"]) => {
  if (process.env.ESOTERICA_AUTO_REFRESH !== "1") return;
  const hours = Number(process.env.ESOTERICA_REFRESH_HOURS ?? 24);
  const intervalMs = Math.max(1, hours) * 60 * 60 * 1000;
  if (process.env.ESOTERICA_REFRESH_ON_START === "1") {
    void runEsotericaRefresh(logger);
  }
  setInterval(() => {
    void runEsotericaRefresh(logger);
  }, intervalMs);
};

export const buildServer = () => {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? "info"
    },
    requestIdHeader: "x-request-id",
    genReqId: (request) => {
      const incoming = request.headers["x-request-id"];
      if (typeof incoming === "string" && incoming.trim()) return incoming;
      if (Array.isArray(incoming) && incoming[0]?.trim()) return incoming[0];
      return randomUUID();
    }
  });

  app.register(cors, {
    origin: true
  });

  app.register(helmet);

  app.addHook("onRequest", async (request, reply) => {
    request.brandId = inferBrandId(request.headers);
    reply.header("x-request-id", request.id);
    reply.header("x-brand-id", request.brandId);
  });

  app.addHook("onResponse", async (request, reply) => {
    request.log.info(
      {
        requestId: request.id,
        brandId: request.brandId,
        route: request.routeOptions.url,
        method: request.method,
        statusCode: reply.statusCode,
        elapsedMs: reply.elapsedTime
      },
      "Request completed."
    );
  });

  app.setErrorHandler((error, request, reply) => {
    sendApiError(reply, request.id, error, request.log);
  });

  app.register(geoRoutes, { prefix: "/v1/geo" });
  app.register(chartRoutes, { prefix: "/v1/chart" });
  app.register(readingRoutes, { prefix: "/v1/reading" });
  app.register(compatibilityRoutes, { prefix: "/v1/compatibility" });
  app.register(meRoutes, { prefix: "/v1" });
  app.register(chartsRoutes, { prefix: "/v1/charts" });
  app.register(accountRoutes, { prefix: "/v1" });
  app.register(loreRoutes, { prefix: "/v1/lore" });
  app.register(humanGuideRoutes, { prefix: "/v1/human-guide" });
  app.register(authRoutes, { prefix: "/v1" });
  app.register(contentRoutes, { prefix: "/v1" });
  app.register(reportPlanRoutes, { prefix: "/v1/report-plans" });
  app.register(reportRunRoutes, { prefix: "/v1/report-runs" });
  app.register(reportRoutes, { prefix: "/v1/reports" });
  app.register(chartCompanionRoutes, { prefix: "/v1/chart-companion" });

  app.get("/health", async (request) => ({
    ok: true,
    uptimeSeconds: process.uptime(),
    version: process.env.APP_VERSION ?? process.env.npm_package_version ?? "0.1.0",
    requestId: request.id
  }));

  app.get("/health/providers", async (request) => ({
    ok: true,
    requestId: request.id,
    providers: getGeoProviderHealth(app.log)
  }));

  app.get("/healthz", async () => ({ ok: true }));

  return app;
};

export const startServer = async () => {
  const app = buildServer();
  const port = Number(process.env.PORT ?? 4020);
  const host = process.env.HOST ?? "0.0.0.0";

  await app.listen({ port, host });
  scheduleEsotericaRefresh(app.log);
  return app;
};

if (require.main === module) {
  startServer().catch((error: unknown) => {
    // eslint-disable-next-line no-console
    console.error(error);
    process.exit(1);
  });
}
