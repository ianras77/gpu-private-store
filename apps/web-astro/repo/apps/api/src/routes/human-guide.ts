import type { FastifyInstance } from "fastify";
import { NatalChartSchema } from "@astro/astro-core";
import type { NatalChart } from "@astro/astro-core";
import { BRANDS } from "@astro/brands";
import { generateHumanGuide } from "@astro/reading-core";
import { HumanGuideRequestInput } from "../lib/validators";
import {
  HUMAN_GUIDE_SOURCE_POLICY,
  buildLoreQuery,
  retrieveEsotericaLore,
  renderLoreContext
} from "../lib/esoterica";
import { ApiError, sendApiError } from "../lib/http-errors";
import { enforceRateLimit } from "../lib/rate-limit";

export const humanGuideRoutes = async (app: FastifyInstance) => {
  app.post("/natal", async (request, reply) => {
    const limited = await enforceRateLimit({
      request,
      reply,
      scope: "human-guide",
      max: Number(process.env.HUMAN_GUIDE_RATE_LIMIT_MAX ?? 10),
      windowMs: Number(process.env.HUMAN_GUIDE_RATE_LIMIT_WINDOW_MS ?? 60_000)
    });
    if (limited) return limited;

    const parsed = HumanGuideRequestInput.safeParse(request.body);
    if (!parsed.success) {
      return sendApiError(
        reply,
        request.id,
        new ApiError("BAD_REQUEST", "Invalid human guide payload.", {
          statusCode: 400,
          issues: parsed.error.issues
        }),
        request.log
      );
    }

    request.brandId = parsed.data.brandId;
    const brand = BRANDS[parsed.data.brandId];
    const chartValidation = NatalChartSchema.safeParse(parsed.data.chartJson);
    if (!chartValidation.success) {
      return sendApiError(
        reply,
        request.id,
        new ApiError("BAD_REQUEST", "Invalid chart payload.", {
          statusCode: 400,
          issues: chartValidation.error.issues
        }),
        request.log
      );
    }

    try {
      const chart = chartValidation.data as NatalChart;
      const query = buildLoreQuery(chart, brand);
      const chunks = await retrieveEsotericaLore(query, 8, undefined, HUMAN_GUIDE_SOURCE_POLICY);
      if (!chunks.length) {
        return sendApiError(
          reply,
          request.id,
          new ApiError("SERVICE_UNAVAILABLE", "Human Guide source provenance is unavailable.", {
            statusCode: 503,
            retryable: true
          }),
          request.log
        );
      }

      const loreContext = renderLoreContext(chunks);
      const sourceProvenance = chunks.map((chunk) => ({
        title: chunk.title ?? "Untitled source",
        source: chunk.source,
        tags: chunk.tags ?? [],
        sections: ["metaFrame", "internalMap", "practicalCounsel"]
      }));

      const result = await generateHumanGuide({
        chart,
        brand,
        loreContext,
        sourceProvenance
      });

      return result;
    } catch (error) {
      return sendApiError(reply, request.id, error, request.log);
    }
  });
};
