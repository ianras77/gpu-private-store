import type { FastifyInstance } from "fastify";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { readEsotericaIngestStatus, runEsotericaIngest } from "../lib/esoterica-ingestor";

const resolveAuditPath = (): string => {
  if (process.env.ESOTERICA_AUDIT_LOG_PATH) {
    return process.env.ESOTERICA_AUDIT_LOG_PATH;
  }
  return path.resolve(process.cwd(), ".esoterica-index", "lore-audit.jsonl");
};

const parseToken = (value?: string | string[]) => {
  if (!value) return "";
  if (Array.isArray(value)) return value[0] ?? "";
  return value;
};

const requireAdmin = (request: { headers: Record<string, string | string[] | undefined> }) => {
  const adminToken = process.env.ESOTERICA_ADMIN_TOKEN;
  if (!adminToken) {
    return { ok: false as const, status: 503, body: { error: "Admin token not configured." } };
  }
  const headerToken = parseToken(request.headers["x-admin-token"]);
  const authHeader = parseToken(request.headers["authorization"]);
  const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const provided = headerToken || bearer;
  if (!provided || provided !== adminToken) {
    return { ok: false as const, status: 401, body: { error: "Unauthorized." } };
  }
  return { ok: true as const };
};

const LoreAuditQuery = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional(),
  brandId: z.string().optional()
});

const LoreIngestBody = z
  .object({
    dryRun: z.boolean().optional()
  })
  .optional();

export const loreRoutes = async (app: FastifyInstance) => {
  app.get("/audit", async (request, reply) => {
    const auth = requireAdmin(request);
    if (!auth.ok) return reply.status(auth.status).send(auth.body);

    const parsed = LoreAuditQuery.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    const limit = parsed.data.limit ?? 100;
    const brandId = parsed.data.brandId;

    try {
      const auditPath = resolveAuditPath();
      const raw = await fs.readFile(auditPath, "utf-8");
      const lines = raw.split(/\r?\n/).filter(Boolean);
      const entries = lines
        .slice(-limit * 2)
        .map((line) => {
          try {
            return JSON.parse(line);
          } catch {
            return null;
          }
        })
        .filter(Boolean)
        .filter((entry: any) => (brandId ? entry.brandId === brandId : true))
        .slice(-limit);
      return { entries };
    } catch (error: any) {
      if (error?.code === "ENOENT") {
        return { entries: [] };
      }
      app.log.error(error);
      return reply.status(500).send({ error: "Failed to read audit log." });
    }
  });

  app.get("/status", async (request, reply) => {
    const auth = requireAdmin(request);
    if (!auth.ok) return reply.status(auth.status).send(auth.body);

    try {
      return { status: await readEsotericaIngestStatus() };
    } catch (error) {
      app.log.error(error, "Failed to read lore ingest status.");
      return reply.status(500).send({ error: "Failed to read ingest status." });
    }
  });

  app.post("/ingest", async (request, reply) => {
    const auth = requireAdmin(request);
    if (!auth.ok) return reply.status(auth.status).send(auth.body);

    const parsed = LoreIngestBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }

    try {
      const result = await runEsotericaIngest({
        dryRun: parsed.data?.dryRun
      });
      return { result };
    } catch (error) {
      app.log.error(error, "Failed to run lore ingest.");
      return reply.status(500).send({ error: "Failed to run ingest." });
    }
  });
};
