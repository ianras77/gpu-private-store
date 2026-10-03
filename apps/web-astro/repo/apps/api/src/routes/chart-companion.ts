import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { NatalChartSchema, type NatalChart } from "@astro/astro-core";
import { buildChartFactGraph } from "@astro/astro-analysis";
import { chartCompanionV1Workflow } from "@astro/astro-intelligence";
import { hashObject } from "@astro/utils";
import { authenticateRequest } from "../lib/auth";
import { prisma } from "../lib/prisma";

const CreateThread = z.object({ chartProfileId: z.string().min(1), brandId: z.string().min(1), memoryEnabled: z.boolean().default(true) });
const Message = z.object({ content: z.string().trim().min(1).max(8_000) });
const StoredTurn = z.object({ id: z.string(), role: z.enum(["user", "assistant"]), content: z.string().max(8_000), createdAt: z.string(), factRefs: z.array(z.string()).optional() });

export const chartCompanionRoutes = async (app: FastifyInstance) => {
  app.get("/threads", async (request) => {
    const user = await authenticateRequest(request);
    const conversations = await prisma.astroConversation.findMany({ where: { userId: user.id, brandId: request.brandId }, orderBy: { updatedAt: "desc" }, select: { id: true, chartProfileId: true, brandId: true, threadId: true, memoryEnabled: true, createdAt: true, updatedAt: true } });
    return { conversations };
  });

  app.get("/threads/:id", async (request, reply) => {
    const user = await authenticateRequest(request);
    const id = (request.params as { id: string }).id;
    const conversation = await prisma.astroConversation.findFirst({ where: { id, userId: user.id }, select: { id: true, chartProfileId: true, brandId: true, threadId: true, memoryEnabled: true, messages: true, createdAt: true, updatedAt: true } });
    if (!conversation) return reply.status(404).send({ error: "Chart companion thread not found." });
    const messages = conversation.memoryEnabled && Array.isArray(conversation.messages)
      ? conversation.messages.flatMap((item) => { const parsed = StoredTurn.safeParse(item); return parsed.success ? [parsed.data] : []; })
      : [];
    return { conversation: { ...conversation, messages } };
  });

  app.post("/threads", async (request, reply) => {
    const user = await authenticateRequest(request);
    const parsed = CreateThread.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });
    if (parsed.data.brandId !== request.brandId) return reply.status(400).send({ error: "Chart Companion must use the active brand." });
    if (parsed.data.chartProfileId) {
      const owned = await prisma.chartProfile.findFirst({ where: { id: parsed.data.chartProfileId, userId: user.id, brandId: parsed.data.brandId } });
      if (!owned) return reply.status(404).send({ error: "Chart not found." });
    }
    const threadId = randomUUID();
    const conversation = await prisma.astroConversation.create({ data: { userId: user.id, chartProfileId: parsed.data.chartProfileId, brandId: parsed.data.brandId, resourceId: user.id, threadId, memoryEnabled: parsed.data.memoryEnabled } });
    return reply.status(201).send({ conversation });
  });

  app.post("/threads/:id/messages", async (request, reply) => {
    const user = await authenticateRequest(request);
    const parsed = Message.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });
    const id = (request.params as { id: string }).id;
    const conversation = await prisma.astroConversation.findFirst({ where: { id, userId: user.id } });
    if (!conversation) return reply.status(404).send({ error: "Chart companion thread not found." });
    if (!conversation.chartProfileId) return reply.status(400).send({ error: "A saved chart is required for Chart Companion." });
    const chartProfile = await prisma.chartProfile.findFirst({ where: { id: conversation.chartProfileId, userId: user.id, brandId: conversation.brandId } });
    if (!chartProfile) return reply.status(404).send({ error: "Chart not found." });
    const chart = NatalChartSchema.parse(chartProfile.chartJson) as NatalChart;
    const graph = buildChartFactGraph(chart, hashObject(chartProfile.chartJson));
    try {
      const previousTurns = conversation.memoryEnabled && Array.isArray(conversation.messages)
        ? conversation.messages.flatMap((item) => { const parsedTurn = StoredTurn.safeParse(item); return parsedTurn.success ? [{ role: parsedTurn.data.role, content: parsedTurn.data.content }] : []; }).slice(-12)
        : [];
      const workflowRun = await chartCompanionV1Workflow.createRun({ runId: randomUUID(), resourceId: user.id });
      const result = await workflowRun.start({ inputData: { graph, question: parsed.data.content, history: previousTurns, brandId: conversation.brandId, sessionId: `companion:${conversation.threadId}` } });
      if (result.status !== "success") throw new Error("Chart Companion workflow did not complete successfully.");
      const companion = result.result;
      const createdAt = new Date().toISOString();
      const userTurn = { id: randomUUID(), role: "user" as const, content: parsed.data.content, createdAt };
      const assistantTurn = { id: randomUUID(), role: "assistant" as const, content: companion.answer, createdAt, factRefs: companion.factRefs };
      if (conversation.memoryEnabled) {
        const currentTurns = Array.isArray(conversation.messages)
          ? conversation.messages.flatMap((item) => { const parsedTurn = StoredTurn.safeParse(item); return parsedTurn.success ? [parsedTurn.data] : []; })
          : [];
        await prisma.astroConversation.update({ where: { id }, data: { updatedAt: new Date(), messages: [...currentTurns, userTurn, assistantTurn].slice(-24) as any } });
      } else {
        await prisma.astroConversation.update({ where: { id }, data: { updatedAt: new Date() } });
      }
      return { threadId: conversation.threadId, answer: companion.answer, factRefs: companion.factRefs, messages: conversation.memoryEnabled ? [...previousTurns, { role: "user", content: parsed.data.content }, { role: "assistant", content: companion.answer, factRefs: companion.factRefs }] : undefined, metadata: { agent: "chart-companion-v1", tools: companion.toolCalls, mode: companion.mode, memoryUsed: conversation.memoryEnabled && previousTurns.length > 0, model: companion.model, latencyMs: companion.latencyMs, traceId: companion.traceId } };
    } catch {
      return reply.status(503).send({ error: "Chart Companion is temporarily unavailable.", code: "RASSYMIND_UNAVAILABLE" });
    }
  });

  app.patch("/threads/:id/memory", async (request, reply) => {
    const user = await authenticateRequest(request);
    const parsed = z.object({ enabled: z.boolean() }).safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });
    const id = (request.params as { id: string }).id;
    const conversation = await prisma.astroConversation.findFirst({ where: { id, userId: user.id } });
    if (!conversation) return reply.status(404).send({ error: "Chart companion thread not found." });
    const updated = await prisma.astroConversation.update({ where: { id }, data: { memoryEnabled: parsed.data.enabled, ...(!parsed.data.enabled ? { messages: [] } : {}) } });
    return { conversation: updated };
  });

  app.delete("/threads/:id", async (request, reply) => {
    const user = await authenticateRequest(request);
    const id = (request.params as { id: string }).id;
    const conversation = await prisma.astroConversation.findFirst({ where: { id, userId: user.id } });
    if (!conversation) return reply.status(404).send({ error: "Chart companion thread not found." });
    await prisma.astroConversation.delete({ where: { id } });
    return reply.status(204).send();
  });
};
