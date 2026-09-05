import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { ModelMessage } from "ai";
import { request } from "undici";
import type { Env } from "./env.js";
import { getRassyMindConfig } from "./env.js";
import { createHouseAgent } from "./mastra/index.js";
import { normalizeHouseContext } from "./mastra/policy.js";

const Body = z.object({
  messages: z.array(z.object({ role: z.enum(["user", "assistant", "system"]), content: z.string().max(20000) })).min(1).max(24),
  threadId: z.string().optional(),
  sessionId: z.string().optional(),
  mode: z.string().optional(),
  webSearchPolicy: z.enum(["auto", "on", "off"]).optional(),
});

export async function registerHouseRoutes(app: FastifyInstance, env: Env) {
  let agent: ReturnType<typeof createHouseAgent> | undefined;
  const getAgent = () => (agent ??= createHouseAgent(env));

  app.post("/api/house/chat", async (request, reply) => {
    const parsed = Body.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid House Chat request" });
    const context = normalizeHouseContext(parsed.data);
    const latest = parsed.data.messages.at(-1)?.content.toLowerCase() ?? "";
    const direct = latest.includes("big file") || latest.includes("large file")
      ? `For sending a big file, use Send: ${env.SEND_URL}`
      : latest.includes("photos")
        ? `Photos are here: ${env.PHOTOS_URL}`
        : latest.includes("plex")
          ? `Plex is here: ${env.PLEX_URL}. Family access starts at ${env.SIGNUP_URL}`
          : latest.includes("sign up") || latest.includes("signup")
            ? `Family signup is here: ${env.SIGNUP_URL}`
            : latest.includes("minecraft")
              ? `The Minecraft server is ${env.MC_TROUP_SERVER_HOST}; the map is ${env.MC_TROUP_BLUEMAP_URL}`
              : undefined;
    if (direct) return { runId: crypto.randomUUID(), threadId: context.threadId, text: direct, sources: [{ type: "house-directory", title: "Rasies service directory" }] };
    try {
      const messages = parsed.data.messages as ModelMessage[];
      const result = await getAgent().generate(messages, { maxSteps: 5 });
      return { runId: crypto.randomUUID(), threadId: context.threadId, text: result.text, sources: [] };
    } catch (error) {
      request.log.warn({ err: error }, "House Chat unavailable");
      return reply.code(503).send({ error: "House Chat unavailable", threadId: context.threadId });
    }
  });

  app.post("/api/house/chat/stream", async (request, reply) => {
    const parsed = Body.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid House Chat request" });
    const context = normalizeHouseContext(parsed.data);
    reply.hijack();
    reply.raw.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    });
    const send = (event: string, data: unknown) => reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    try {
      send("message_start", { runId: crypto.randomUUID(), threadId: context.threadId });
      const result = await getAgent().stream(parsed.data.messages as ModelMessage[], { maxSteps: 5 });
      for await (const delta of result.textStream) send("text_delta", { text: delta });
      send("message_end", { threadId: context.threadId });
    } catch (error) {
      request.log.warn({ err: error }, "House Chat stream unavailable");
      send("error", { error: "House Chat unavailable" });
    } finally {
      reply.raw.end();
    }
  });

  app.get("/api/house/health", async (_request, reply) => {
    try {
      getAgent();
      const config = getRassyMindConfig(env);
      const headers: Record<string, string> = {};
      if (config.apiKey.trim()) headers.authorization = `Bearer ${config.apiKey}`;
      const res = await request(new URL("/v1/models", config.baseUrl), {
        method: "GET",
        headers,
        headersTimeout: Math.min(config.timeoutMs, 5000),
        bodyTimeout: Math.min(config.timeoutMs, 5000),
      });
      res.body.resume();
      if (res.statusCode >= 400) throw new Error(`RassyMind status ${res.statusCode}`);
      return { ok: true, provider: "rassymind", model: config.model, upstreamStatus: res.statusCode };
    } catch {
      return reply.code(503).send({ ok: false, provider: "rassymind" });
    }
  });
}
