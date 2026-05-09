import type { FastifyInstance } from "fastify";
import { authenticateRequest } from "../lib/auth";
import {
  createInitialReport,
  createWeeklyUpdate,
  listUserContent,
  runWeeklyContentEngine
} from "../lib/content-engine";
import { ContentFeedQuery, InitialReportInput, WeeklyContentInput } from "../lib/validators";

const parseToken = (value?: string | string[]) => {
  if (!value) return "";
  if (Array.isArray(value)) return value[0] ?? "";
  return value;
};

export const contentRoutes = async (app: FastifyInstance) => {
  app.get("/content/feed", async (request, reply) => {
    try {
      const user = await authenticateRequest(request);
      const parsed = ContentFeedQuery.safeParse(request.query);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten() });
      }
      const entries = await listUserContent({
        userId: user.id,
        brandId: request.brandId,
        limit: parsed.data.limit
      });
      return { entries };
    } catch (error: any) {
      return reply.status(401).send({ error: error.message });
    }
  });

  app.post("/content/initial-report", async (request, reply) => {
    try {
      const user = await authenticateRequest(request);
      const parsed = InitialReportInput.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten() });
      }
      if (parsed.data.brandId !== request.brandId) {
        return reply.status(400).send({ error: "Brand mismatch." });
      }
      const entry = await createInitialReport({
        userId: user.id,
        chartProfileId: parsed.data.chartProfileId,
        brandId: parsed.data.brandId,
        length: parsed.data.length,
        force: parsed.data.force
      });
      return { entry };
    } catch (error: any) {
      return reply.status(400).send({ error: error.message });
    }
  });

  app.post("/content/weekly-update", async (request, reply) => {
    try {
      const user = await authenticateRequest(request);
      const parsed = WeeklyContentInput.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten() });
      }
      if (parsed.data.brandId !== request.brandId) {
        return reply.status(400).send({ error: "Brand mismatch." });
      }
      const entry = await createWeeklyUpdate({
        userId: user.id,
        chartProfileId: parsed.data.chartProfileId,
        brandId: parsed.data.brandId,
        force: parsed.data.force
      });
      return { entry };
    } catch (error: any) {
      return reply.status(400).send({ error: error.message });
    }
  });

  app.post("/content/engine/run", async (request, reply) => {
    const adminToken = process.env.CONTENT_ENGINE_ADMIN_TOKEN;
    if (!adminToken) {
      return reply.status(503).send({ error: "Content engine admin token not configured." });
    }

    const headerToken = parseToken(request.headers["x-admin-token"]);
    const authHeader = parseToken(request.headers["authorization"]);
    const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    const provided = headerToken || bearer;
    if (!provided || provided !== adminToken) {
      return reply.status(401).send({ error: "Unauthorized." });
    }

    const result = await runWeeklyContentEngine({
      brandId: request.brandId
    });
    return result;
  });
};
