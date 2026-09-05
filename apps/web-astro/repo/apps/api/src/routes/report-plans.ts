import type { FastifyInstance } from "fastify";
import { NatalChartSchema, type NatalChart } from "@astro/astro-core";
import { buildChartFactGraph } from "@astro/astro-analysis";
import { planLifeHandbook } from "@astro/astro-intelligence";
import { LifeHandbookPlanRequestInput } from "../lib/validators";

export const reportPlanRoutes = async (app: FastifyInstance) => {
  app.post("/life-handbook", async (request, reply) => {
    const parsed = LifeHandbookPlanRequestInput.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });
    const chart = NatalChartSchema.safeParse(parsed.data.chartJson);
    if (!chart.success) return reply.status(400).send({ error: "Invalid chart payload.", issues: chart.error.issues });
    const graph = buildChartFactGraph(chart.data as NatalChart, "request");
    const context = parsed.data.context.map((item) => ({ ...item, sensitivity: item.sensitivity ?? "ordinary" as const }));
    return { plan: planLifeHandbook({ graph, context, frameworks: parsed.data.frameworks }), factGraph: graph };
  });
};
