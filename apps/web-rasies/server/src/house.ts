import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { ModelMessage } from "ai";
import { request } from "undici";
import type { Env } from "./env.js";
import { getRassyMindConfig } from "./env.js";
import { createHouseAgent } from "./mastra/index.js";
import { normalizeHouseContext } from "./mastra/policy.js";
import { loadThreadMemory, saveThreadMemory } from "./mastra/memory.js";

const Body = z.object({
  messages: z.array(z.object({ role: z.enum(["user", "assistant", "system"]), content: z.string().max(20000) })).min(1).max(24),
  files: z.array(z.object({ name: z.string().max(160), size: z.number().int().nonnegative().max(200_000), type: z.string().max(120).optional(), content: z.string().max(20_000).optional() })).max(4).optional(),
  threadId: z.string().optional(),
  sessionId: z.string().optional(),
  mode: z.string().optional(),
  webSearchPolicy: z.enum(["auto", "on", "off"]).optional(),
});

const HOUSE_SPOTLIGHT = {
  mood: "The house is open, the lights are on, and House Chat is ready to help.",
  mission: "Pick one useful thing that would make today easier.",
  surprise: "A small, calm plan often beats a heroic one.",
  prompts: ["Plan today", "Find something in the family archive", "Write a family note", "Check the house"],
};

export async function registerHouseRoutes(app: FastifyInstance, env: Env) {
  let agent: ReturnType<typeof createHouseAgent> | undefined;
  const windows = new Map<string, { startedAt: number; count: number }>();
  const getAgent = () => (agent ??= createHouseAgent(env));

  const allow = (key: string) => {
    const now = Date.now();
    const current = windows.get(key);
    if (!current || now - current.startedAt >= 60_000) {
      windows.set(key, { startedAt: now, count: 1 });
      return true;
    }
    if (current.count >= 30) return false;
    current.count += 1;
    return true;
  };

  app.post("/api/house/chat", async (request, reply) => {
    const parsed = Body.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid House Chat request" });
    const rateKey = typeof request.headers["x-forwarded-for"] === "string" ? request.headers["x-forwarded-for"].split(",")[0].trim() : request.ip;
    if (!allow(rateKey)) return reply.code(429).header("retry-after", "60").send({ error: "House Chat rate limit reached" });
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
      const messages = [...await loadThreadMemory(env.MASTRA_DATA_DIR ?? "/data/mastra", context.threadId), ...parsed.data.messages] as ModelMessage[];
      const result = await getAgent().generate(messages, { maxSteps: 5 });
      await saveThreadMemory(env.MASTRA_DATA_DIR ?? "/data/mastra", context.threadId, [...messages, { role: "assistant", content: result.text } as ModelMessage]);
      return { runId: crypto.randomUUID(), threadId: context.threadId, text: result.text, sources: [] };
    } catch (error) {
      request.log.warn({ err: error }, "House Chat unavailable");
      return reply.code(503).send({ error: "House Chat unavailable", threadId: context.threadId });
    }
  });

  app.post("/api/house/chat/stream", async (request, reply) => {
    const parsed = Body.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid House Chat request" });
    const rateKey = typeof request.headers["x-forwarded-for"] === "string" ? request.headers["x-forwarded-for"].split(",")[0].trim() : request.ip;
    if (!allow(rateKey)) return reply.code(429).send({ error: "House Chat rate limit reached" });
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
      const messages = [...await loadThreadMemory(env.MASTRA_DATA_DIR ?? "/data/mastra", context.threadId), ...parsed.data.messages] as ModelMessage[];
      const result = await getAgent().stream(messages, { maxSteps: 5 });
      let fullText = "";
      for await (const delta of result.textStream) { fullText += delta; send("text_delta", { text: delta }); }
      await saveThreadMemory(env.MASTRA_DATA_DIR ?? "/data/mastra", context.threadId, [...messages, { role: "assistant", content: fullText } as ModelMessage]);
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

  app.get("/api/house/spotlight", async () => ({ source: "fallback", ...HOUSE_SPOTLIGHT }));
}
