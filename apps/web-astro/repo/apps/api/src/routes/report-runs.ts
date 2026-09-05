import type { FastifyInstance } from "fastify";
import { NatalChartSchema, type NatalChart } from "@astro/astro-core";
import { buildChartFactGraph, buildSynastryFactGraph, TimingFactGraphSchema } from "@astro/astro-analysis";
import { planLifeHandbook, natalReportV2Workflow, compatibilityV1Workflow, weeklyTransitV1Workflow } from "@astro/astro-intelligence";
import { hashObject } from "@astro/utils";
import { authenticateRequest } from "../lib/auth";
import { prisma } from "../lib/prisma";
import { ReportRunCreateInput } from "../lib/validators";

export const reportRunRoutes = async (app: FastifyInstance) => {
  app.post("/", async (request, reply) => {
    const user = await authenticateRequest(request);
    const parsed = ReportRunCreateInput.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });
    const chart = parsed.data.chartJson === undefined ? undefined : NatalChartSchema.safeParse(parsed.data.chartJson);
    if (parsed.data.kind !== "compatibility" && (!chart || !chart.success)) return reply.status(400).send({ error: "Invalid chart payload.", issues: chart && !chart.success ? chart.error.issues : [] });
    if (parsed.data.chartProfileId) {
      const owned = await prisma.chartProfile.findFirst({ where: { id: parsed.data.chartProfileId, userId: user.id, brandId: parsed.data.brandId } });
      if (!owned) return reply.status(404).send({ error: "Chart not found." });
    }
    const chartA = parsed.data.kind === "compatibility" ? NatalChartSchema.safeParse(parsed.data.chartAJson) : undefined;
    const chartB = parsed.data.kind === "compatibility" ? NatalChartSchema.safeParse(parsed.data.chartBJson) : undefined;
    if (parsed.data.kind === "compatibility" && (!chartA?.success || !chartB?.success)) return reply.status(400).send({ error: "Invalid compatibility chart payload." });
    const graph = chart?.success ? buildChartFactGraph(chart.data as NatalChart, hashObject(chart.data)) : undefined;
    const synastry = chartA?.success && chartB?.success ? buildSynastryFactGraph(chartA.data as NatalChart, chartB.data as NatalChart, hashObject(chartA.data), hashObject(chartB.data)) : undefined;
    const timing = parsed.data.kind === "weekly" ? TimingFactGraphSchema.safeParse(parsed.data.timingGraph) : undefined;
    if (parsed.data.kind === "weekly" && (!timing || !timing.success)) return reply.status(400).send({ error: "Invalid timing graph.", issues: timing && !timing.success ? timing.error.issues : [] });
    const plan = graph ? planLifeHandbook({ graph, context: parsed.data.context.map((item) => ({ ...item, sensitivity: item.sensitivity ?? "ordinary" as const })), frameworks: parsed.data.frameworks }) : { planVersion: "life-handbook-v1" as const, depth: "handbook" as const, sections: [{ key: "synthesis", title: parsed.data.kind === "weekly" ? "Weekly transit synthesis" : "Relationship pattern", group: "application" as const, requiredFactCategories: parsed.data.kind === "weekly" ? ["transit" as const] : ["synastry" as const], requiredContext: false, requiredFrameworks: [], order: 10 }], omissions: [] };
    const inputHash = hashObject({ chart: parsed.data.chartJson, chartA: parsed.data.chartAJson, chartB: parsed.data.chartBJson, timing: parsed.data.timingGraph, brandId: parsed.data.brandId, kind: parsed.data.kind, depth: parsed.data.depth, workflowVersion: parsed.data.workflowVersion, context: parsed.data.context.map(({ text: _text, ...item }) => item), frameworks: parsed.data.frameworks });
    const existing = await prisma.reportRun.findFirst({ where: { userId: user.id, idempotencyKey: parsed.data.idempotencyKey } });
    if (existing) return reply.status(200).send({ run: existing, idempotent: true });
    const workflowInput = parsed.data.kind === "compatibility" ? { synastry, reportId: "pending", runId: "pending", brandId: parsed.data.brandId, chartHash: `${hashObject(parsed.data.chartAJson)}:${hashObject(parsed.data.chartBJson)}`, sessionId: `report:${user.id}:${parsed.data.idempotencyKey}`, astrologyProfile: "modern-reflective" } : parsed.data.kind === "weekly" ? { timing: timing?.success ? timing.data : undefined, weekLabel: parsed.data.weekLabel, reportId: "pending", runId: "pending", brandId: parsed.data.brandId, chartHash: hashObject(parsed.data.chartJson), sessionId: `report:${user.id}:${parsed.data.idempotencyKey}`, astrologyProfile: "modern-reflective" } : { graph, plan, reportId: "pending", runId: "pending", brandId: parsed.data.brandId, chartHash: hashObject(chart?.success ? chart.data : {}), sessionId: `report:${user.id}:${parsed.data.idempotencyKey}`, depth: parsed.data.depth, contextSummary: parsed.data.context.filter((item) => item.approvedForSynthesis).map((item) => item.text).join("\n\n") };
    const run = await prisma.reportRun.create({ data: { userId: user.id, chartProfileId: parsed.data.chartProfileId, brandId: parsed.data.brandId, kind: parsed.data.kind, depth: parsed.data.depth, idempotencyKey: parsed.data.idempotencyKey, inputHash, inputJson: workflowInput as any, workflowVersion: parsed.data.workflowVersion, status: "planned", sections: { create: plan.sections.map((section) => ({ sectionKey: section.key, position: section.order, status: "planned", payload: { title: section.title, group: section.group }, factRefs: [] })) } }, include: { sections: true } });
    await prisma.reportRun.update({ where: { id: run.id }, data: { inputJson: { ...workflowInput, reportId: run.id, runId: run.id } as any } });
    return reply.status(202).send({ run, plan, factGraph: graph });
  });

  app.get("/:id", async (request, reply) => {
    const user = await authenticateRequest(request);
    const run = await prisma.reportRun.findFirst({ where: { id: (request.params as { id: string }).id, userId: user.id }, include: { sections: { orderBy: { position: "asc" } }, artifact: true } });
    if (!run) return reply.status(404).send({ error: "Report run not found." });
    return { run };
  });

  app.get("/:id/stream", async (request, reply) => {
    const user = await authenticateRequest(request);
    const id = (request.params as { id: string }).id;
    const owned = await prisma.reportRun.findFirst({ where: { id, userId: user.id } });
    if (!owned) return reply.status(404).send({ error: "Report run not found." });
    reply.hijack();
    const response = reply.raw;
    response.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache, no-transform", connection: "keep-alive", "x-accel-buffering": "no" });
    let closed = false;
    const finish = () => { if (closed) return; closed = true; clearInterval(timer); response.end(); };
    const emit = (event: string, data: unknown) => { if (!closed) response.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); };
    const started = Date.now();
    const poll = async () => {
      if (closed) return;
      const run = await prisma.reportRun.findFirst({ where: { id, userId: user.id }, select: { id: true, status: true, errorClass: true, createdAt: true, updatedAt: true, sections: { select: { sectionKey: true, position: true, status: true }, orderBy: { position: "asc" } } } });
      if (!run) { emit("error", { code: "REPORT_NOT_FOUND" }); finish(); return; }
      emit("progress", { runId: run.id, status: run.status, sections: run.sections });
      if (["completed", "failed", "cancelled"].includes(run.status)) { emit("done", { runId: run.id, status: run.status, errorClass: run.errorClass }); finish(); return; }
      if (Date.now() - started > 10 * 60 * 1000) { emit("error", { code: "STREAM_TIMEOUT" }); finish(); }
    };
    const timer = setInterval(() => { void poll(); }, 1000);
    request.raw.on("close", finish);
    await poll();
  });

  app.post("/:id/execute", async (request, reply) => {
    const user = await authenticateRequest(request);
    const id = (request.params as { id: string }).id;
    const run = await prisma.reportRun.findFirst({ where: { id, userId: user.id }, include: { sections: true } });
    if (!run) return reply.status(404).send({ error: "Report run not found." });
    if (run.status === "cancelled") return reply.status(409).send({ error: "Report run is cancelled." });
    if (run.status === "completed") {
      const existingArtifact = await prisma.reportArtifact.findUnique({ where: { reportRunId: id } });
      return { runId: id, status: "completed", artifact: existingArtifact?.payload ?? null, idempotent: true };
    }
    if (run.status === "running") return reply.status(409).send({ error: "Report run is already executing.", code: "REPORT_ALREADY_RUNNING" });
    await prisma.reportRun.update({ where: { id }, data: { status: "running" } });
    try {
      const workflow = run.kind === "compatibility" ? compatibilityV1Workflow : run.kind === "weekly" ? weeklyTransitV1Workflow : natalReportV2Workflow;
      const workflowRun = await workflow.createRun({ runId: id, resourceId: user.id });
      const result = await workflowRun.start({ inputData: run.inputJson as never });
      if (result.status !== "success") throw new Error("Mastra workflow did not complete successfully.");
      const artifact = result.result;
      await prisma.$transaction([prisma.reportArtifact.upsert({ where: { reportRunId: id }, update: { schemaVersion: artifact.schemaVersion, reportVersion: artifact.reportVersion, title: artifact.cover.title, excerpt: artifact.cover.excerpt, payload: artifact as any, provenance: artifact.provenance as any }, create: { reportRunId: id, schemaVersion: artifact.schemaVersion, reportVersion: artifact.reportVersion, title: artifact.cover.title, excerpt: artifact.cover.excerpt, payload: artifact as any, provenance: artifact.provenance as any } }), prisma.reportRun.update({ where: { id }, data: { status: "completed", traceId: artifact.provenance.traceId } }), ...artifact.sections.map((section: (typeof artifact.sections)[number]) => prisma.reportSection.updateMany({ where: { reportRunId: id, sectionKey: section.key }, data: { status: section.status, payload: section as any, factRefs: section.factRefs as any } }))]);
      return { runId: id, status: "completed", artifact };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Report workflow failed";
      await prisma.reportRun.update({ where: { id }, data: { status: "failed", errorClass: "WORKFLOW_FAILURE", errorMessage: message.slice(0, 500) } });
      return reply.status(502).send({ error: "Report workflow failed.", code: "WORKFLOW_FAILURE", runId: id });
    }
  });

  app.post("/:id/cancel", async (request, reply) => {
    const user = await authenticateRequest(request);
    const id = (request.params as { id: string }).id;
    const run = await prisma.reportRun.findFirst({ where: { id, userId: user.id } });
    if (!run) return reply.status(404).send({ error: "Report run not found." });
    const updated = await prisma.reportRun.update({ where: { id }, data: { status: "cancelled", cancelledAt: new Date() } });
    return { run: updated };
  });

  app.post("/:id/retry", async (request, reply) => {
    const user = await authenticateRequest(request);
    const id = (request.params as { id: string }).id;
    const run = await prisma.reportRun.findFirst({ where: { id, userId: user.id } });
    if (!run) return reply.status(404).send({ error: "Report run not found." });
    if (run.status !== "failed" && run.status !== "cancelled") return reply.status(409).send({ error: "Only failed or cancelled runs can be retried." });
    const updated = await prisma.reportRun.update({ where: { id }, data: { status: "planned", cancelledAt: null, errorClass: null, errorMessage: null } });
    return { run: updated, next: `/v1/report-runs/${id}/execute` };
  });
};
