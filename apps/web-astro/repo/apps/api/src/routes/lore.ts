import type { FastifyInstance } from "fastify";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

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

const LoreAuditQuery = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional(),
  brandId: z.string().optional()
});

export const loreRoutes = async (app: FastifyInstance) => {
  app.get("/audit", async (request, reply) => {
    const adminToken = process.env.ESOTERICA_ADMIN_TOKEN;
    if (!adminToken) {
      return reply.status(503).send({ error: "Admin token not configured." });
    }
    const headerToken = parseToken(request.headers["x-admin-token"]);
    const authHeader = parseToken(request.headers["authorization"]);
    const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    const provided = headerToken || bearer;
    if (!provided || provided !== adminToken) {
      return reply.status(401).send({ error: "Unauthorized." });
    }

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
};
