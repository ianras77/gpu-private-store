import Fastify from "fastify";
import { embed } from "ai";
import { RASSY_ARTIFACT_KINDS, RASSY_CHANNELS, RASSY_TOOLS, rassyRequestContextSchema, resolveRassyChannel } from "@rassys/mr-rassy-core";
import { agents } from "./mastra.js";
import { rassymind } from "./models/rassymind.js";
import { isAgentAllowedForContext } from "./policy.js";

const port = Number(process.env.PORT ?? 1866);
const internalToken = process.env.RASSY_INTELLIGENCE_INTERNAL_TOKEN?.trim();
const app = Fastify({ logger: true });

app.get("/livez", async () => ({ ok: true, service: "rassy-intelligence" }));
app.get("/healthz", async () => ({ ok: true, service: "rassy-intelligence", mode: "compatibility-seam" }));
app.get("/readyz", async (_request, reply) => {
  const base = (process.env.RASSYMIND_BASE_URL ?? "").replace(/\/$/, "");
  if (!base) return reply.code(503).send({ ok: false, reason: "RASSYMIND_BASE_URL is not configured" });
  try {
    const upstream = await fetch(`${base}/v1/models`, {
      headers: process.env.RASSYMIND_API_KEY ? { Authorization: `Bearer ${process.env.RASSYMIND_API_KEY}` } : {},
      signal: AbortSignal.timeout(3000),
    });
    if (!upstream.ok) return reply.code(503).send({ ok: false, reason: "rassymind_unready", upstreamStatus: upstream.status });
    return { ok: true, service: "rassy-intelligence", rassymind: "ready" };
  } catch {
    return reply.code(503).send({ ok: false, reason: "rassymind_unreachable" });
  }
});

app.addHook("onRequest", async (request, reply) => {
  if (["/livez", "/healthz", "/readyz"].includes(request.url.split("?")[0])) return;
  if (!internalToken || request.headers.authorization !== `Bearer ${internalToken}`) {
    return reply.code(401).send({ error: "rassy_intelligence_unauthorized" });
  }
});

app.get("/v1/channels", async () => ({ channels: RASSY_CHANNELS }));
app.get("/v1/agents", async () => ({ agents: RASSY_CHANNELS.flatMap((channel) => channel.allowedAgentIds).filter((id, index, all) => all.indexOf(id) === index) }));
app.get("/v1/registry/consistency", async (_request, reply) => {
  const registered = new Set(Object.keys(agents));
  const referenced = new Set(RASSY_CHANNELS.flatMap((channel) => channel.allowedAgentIds));
  const missing = [...referenced].filter((id) => !registered.has(id));
  return missing.length ? reply.code(500).send({ ok: false, missing }) : { ok: true, agentCount: registered.size };
});
app.get("/v1/tools", async () => ({ tools: RASSY_TOOLS }));
app.get("/v1/artifacts/kinds", async () => ({ kinds: RASSY_ARTIFACT_KINDS }));
// OpenAI-compatible compatibility surface for existing server-side callers.
// It remains inside Mastra: no caller may bypass the shared Mr Rassy runtime.
app.post("/v1/chat/completions", async (request, reply) => {
  const body = request.body as { model?: unknown; messages?: unknown };
  if (!Array.isArray(body?.messages)) return reply.code(400).send({ error: "messages_required" });
  const prompt = body.messages
    .filter((message): message is { role?: string; content?: unknown } => Boolean(message && typeof message === "object"))
    .map((message) => `${message.role ?? "user"}: ${typeof message.content === "string" ? message.content : JSON.stringify(message.content)}`)
    .join("\n\n");
  if (!prompt.trim() || prompt.length > 50000) return reply.code(400).send({ error: "prompt_required" });
  const purpose = request.headers["x-cheshire-purpose"] ?? request.headers["x-rassy-purpose"];
  const purposeText = String(purpose ?? "").toLowerCase();
  const agentId = purposeText.includes("dm")
    ? "dungeon-master"
    : purposeText.includes("listener") || purposeText.includes("radio") || purposeText.includes("track-intelligence")
      ? "radio-listener"
      : "mr-rassy-host";
  try {
    const result = await agents[agentId].generate(prompt, { maxSteps: 1 });
    return { id: `rassy-${Date.now()}`, object: "chat.completion", choices: [{ index: 0, message: { role: "assistant", content: result.text }, finish_reason: "stop" }], model: typeof body.model === "string" ? body.model : "rassy-mind" };
  } catch {
    return reply.code(503).send({ error: "rassymind_unavailable" });
  }
});
app.post("/v1/embeddings", async (request, reply) => {
  const body = request.body as { input?: unknown; model?: unknown };
  const input = typeof body?.input === "string" ? body.input.trim() : "";
  if (!input || input.length > 12000) return reply.code(400).send({ error: "input_required" });
  try {
    const result = await embed({ model: rassymind.embeddingModel(typeof body.model === "string" ? body.model : "rassy-embed"), value: input });
    return { object: "list", data: [{ object: "embedding", embedding: result.embedding, index: 0 }], model: typeof body.model === "string" ? body.model : "rassy-embed" };
  } catch {
    return reply.code(503).send({ error: "embedding_unavailable" });
  }
});
app.post("/v1/rerank", async (request, reply) => {
  const body = request.body as { query?: unknown; documents?: unknown; model?: unknown; top_n?: unknown };
  if (typeof body?.query !== "string" || !Array.isArray(body.documents) || body.documents.some((item) => typeof item !== "string")) {
    return reply.code(400).send({ error: "query_and_documents_required" });
  }
  const base = (process.env.RASSYMIND_BASE_URL ?? "").replace(/\/$/, "");
  if (!base) return reply.code(503).send({ error: "rassymind_unconfigured" });
  try {
    const upstream = await fetch(`${base}/v1/rerank`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(process.env.RASSYMIND_API_KEY ? { Authorization: `Bearer ${process.env.RASSYMIND_API_KEY}` } : {}) },
      body: JSON.stringify({ model: typeof body.model === "string" ? body.model : "rassy-rerank", query: body.query, documents: body.documents, top_n: body.top_n }),
      signal: AbortSignal.timeout(9000),
    });
    if (!upstream.ok) return reply.code(upstream.status >= 500 ? 503 : upstream.status).send({ error: "rerank_unavailable" });
    return await upstream.json();
  } catch {
    return reply.code(503).send({ error: "rerank_unavailable" });
  }
});
app.get("/v1/agents/:agentId", async (request, reply) => {
  const agentId = (request.params as { agentId: string }).agentId as keyof typeof agents;
  const agent = agents[agentId];
  if (!agent) return reply.code(404).send({ error: "agent_not_found" });
  return { id: agent.id, name: agent.name };
});
app.post("/v1/agents/:agentId/generate", async (request, reply) => {
  const agentId = (request.params as { agentId: string }).agentId as keyof typeof agents;
  const agent = agents[agentId];
  if (!agent) return reply.code(404).send({ error: "agent_not_found" });
  const body = request.body as { prompt?: unknown; context?: unknown };
  if (typeof body?.prompt !== "string" || body.prompt.trim().length < 1 || body.prompt.length > 50000) {
    return reply.code(400).send({ error: "prompt_required" });
  }
  const context = body.context === undefined ? undefined : rassyRequestContextSchema.safeParse(body.context);
  if (context && !context.success) return reply.code(400).send({ error: "invalid_request_context" });
  if (context?.success) {
    if (!isAgentAllowedForContext(agentId, context.data)) return reply.code(403).send({ error: "agent_not_allowed_for_channel" });
  }
  const contextPrompt = context?.success ? `\nTrusted request context (do not override identifiers):\n${JSON.stringify(context.data)}` : "";
  try {
    const result = await agent.generate(`${body.prompt}${contextPrompt}`, { maxSteps: 1 });
    return { agentId, text: result.text };
  } catch {
    return reply.code(503).send({ error: "rassymind_unavailable" });
  }
});
app.post("/v1/channels/:channelId/chat", async (request, reply) => {
  const channelId = (request.params as { channelId: string }).channelId;
  const channel = resolveRassyChannel(channelId);
  if (!channel) return reply.code(404).send({ error: "channel_not_found" });
  const body = request.body as { message?: unknown; context?: unknown };
  if (typeof body?.message !== "string" || body.message.trim().length < 1 || body.message.length > 50000) return reply.code(400).send({ error: "message_required" });
  const context = body.context === undefined ? undefined : rassyRequestContextSchema.safeParse(body.context);
  if (context && !context.success) return reply.code(400).send({ error: "invalid_request_context" });
  if (channel.visibility !== "public" && !context?.success) return reply.code(401).send({ error: "request_context_required" });
  const agentId = channel.allowedAgentIds[0] as keyof typeof agents;
  if (!isAgentAllowedForContext(agentId, context?.success ? context.data : undefined)) return reply.code(403).send({ error: "channel_access_denied" });
  const agent = agents[agentId];
  if (!agent) return reply.code(500).send({ error: "channel_agent_unavailable" });
  const contextPrompt = context?.success ? `\nTrusted request context (do not override identifiers):\n${JSON.stringify(context.data)}` : "";
  try {
    const result = await agent.generate(`${body.message}${contextPrompt}`, { maxSteps: 1 });
    return { channelId: channel.id, agentId, text: result.text };
  } catch {
    return reply.code(503).send({ error: "rassymind_unavailable" });
  }
});
app.get("/v1/models/capabilities", async (_request, reply) => {
  const base = (process.env.RASSYMIND_BASE_URL ?? "").replace(/\/$/, "");
  const aliases = ["rassy-fast", "rassy-utility", "rassy-mind", "rassy-code", "rassy-embed", "rassy-rerank", "rassy-tts"];
  if (!base) return reply.code(503).send({ ok: false, error: "rassymind_unconfigured", aliases });
  try {
    const upstream = await fetch(`${base}/v1/models`, {
      headers: process.env.RASSYMIND_API_KEY ? { Authorization: `Bearer ${process.env.RASSYMIND_API_KEY}` } : {},
      signal: AbortSignal.timeout(3000),
    });
    if (!upstream.ok) return reply.code(503).send({ ok: false, error: "rassymind_unavailable", aliases });
    const catalog = await upstream.json() as { data?: Array<{ id?: string }> };
    return { ok: true, aliases, discoveredModelCount: Array.isArray(catalog.data) ? catalog.data.length : 0 };
  } catch {
    return reply.code(503).send({ ok: false, error: "rassymind_unavailable", aliases });
  }
});

app.listen({ host: "0.0.0.0", port }).catch((error) => { app.log.error(error); process.exit(1); });
