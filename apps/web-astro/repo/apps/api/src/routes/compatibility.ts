import type { FastifyInstance } from "fastify";
import { CompatibilityRequestInput } from "../lib/validators";
import { BRANDS } from "@astro/brands";
import { generateCompatibilityReading } from "@astro/reading-core";
import { NatalChartSchema } from "@astro/astro-core";
import type { NatalChart } from "@astro/astro-core";
import { createCache, hashObject } from "@astro/utils";
import {
  appendLoreAudit,
  buildAuditEntry,
  buildLoreQuery,
  renderLoreContext,
  retrieveEsotericaLore
} from "../lib/esoterica";

export const compatibilityRoutes = async (app: FastifyInstance) => {
  app.post(
    "/natal",
    {
      config: {
        rateLimit: {
          max: 20,
          timeWindow: "1 minute"
        }
      }
    },
    async (request, reply) => {
      const parsed = CompatibilityRequestInput.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten() });
      }

      const brand = BRANDS[parsed.data.brandId];
      const chartAValidation = NatalChartSchema.safeParse(parsed.data.chartAJson);
      const chartBValidation = NatalChartSchema.safeParse(parsed.data.chartBJson);
      if (!chartAValidation.success) {
        return reply.status(400).send({ error: chartAValidation.error.flatten() });
      }
      if (!chartBValidation.success) {
        return reply.status(400).send({ error: chartBValidation.error.flatten() });
      }

      const chartA = chartAValidation.data as NatalChart;
      const chartB = chartBValidation.data as NatalChart;

      const cache = createCache();
      const loreQuery = [
        "Compatibility focus: synastry, relational dynamics, harmony, friction.",
        "Person A chart:",
        buildLoreQuery(chartA, brand),
        "Person B chart:",
        buildLoreQuery(chartB, brand)
      ]
        .filter(Boolean)
        .join("\n");
      const loreChunks = await retrieveEsotericaLore(loreQuery, 4, brand.id);
      const loreContext = renderLoreContext(loreChunks);
      const chartHash = hashObject({
        chartA: chartAValidation.data,
        chartB: chartBValidation.data
      });
      await appendLoreAudit(
        buildAuditEntry({
          brandId: brand.id,
          chartHash,
          query: loreQuery,
          chunks: loreChunks
        })
      );

      const reading = await generateCompatibilityReading({
        chartA,
        chartB,
        brand,
        length: parsed.data.length,
        preferences: {
          ...parsed.data.preferences,
          lore: loreContext
        },
        cache
      });

      return { reading };
    }
  );
};
