import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { NatalChartSchema, type NatalChart } from "@astro/astro-core";
import { buildChartFactGraph } from "@astro/astro-analysis";
import { callRassyMind } from "@astro/astro-intelligence";
import { hashObject } from "@astro/utils";
import { authenticateRequest } from "../lib/auth";
import { prisma } from "../lib/prisma";

const CreateThread = z.object({ chartProfileId: z.string().optional(), brandId: z.string().min(1), memoryEnabled: z.boolean().default(true) });
const Message = z.object({ content: z.string().min(1).max(10_000) });

export const chartCompanionRoutes = async (app: FastifyInstance) => {
  app.get("/threads", async (request) => {
    const user = await authenticateRequest(request);
    const conversations = await prisma.astroConversation.findMany({ where: { userId: user.id }, orderBy: { updatedAt: "desc" }, select: { id: true, chartProfileId: true, brandId: true, threadId: true, memoryEnabled: true, createdAt: true, updatedAt: true } });
    return { conversations };
  });

  app.post("/threads", async (request, reply) => {
    const user = await authenticateRequest(request);
    const parsed = CreateThread.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });
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
      const result = await callRassyMind({ lane: "rassy-mind", sessionId: `companion:${conversation.threadId}`, system: "You are Ask Your Chart. Answer only from supplied deterministic chart facts. Use reflective language, do not diagnose or predict guaranteed outcomes, and do not expose private birth details. If the facts do not answer the question, say so.", prompt: JSON.stringify({ question: parsed.data.content, facts: graph.facts }), deadlineMs: 45_000 });
      await prisma.astroConversation.update({ where: { id }, data: { updatedAt: new Date() } });
      return { threadId: conversation.threadId, answer: result.text, factRefs: graph.facts.slice(0, 8).map((fact) => fact.id), metadata: { lane: result.lane, model: result.model, latencyMs: result.latencyMs, traceId: result.traceId } };
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
    const updated = await prisma.astroConversation.update({ where: { id }, data: { memoryEnabled: parsed.data.enabled } });
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
