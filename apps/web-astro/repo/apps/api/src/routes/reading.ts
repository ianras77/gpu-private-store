import type { FastifyInstance } from "fastify";
import { ReadingRequestInput } from "../lib/validators";
import { BRANDS } from "@astro/brands";
import { generateReading } from "@astro/reading-core";
import { NatalChartSchema } from "@astro/astro-core";
import type { NatalChart } from "@astro/astro-core";
import { createCache, hashObject } from "@astro/utils";
import { prisma } from "../lib/prisma";
import { authenticateRequest } from "../lib/auth";
import {
  appendLoreAudit,
  buildAuditEntry,
  buildLoreQuery,
  renderLoreContext,
  retrieveEsotericaLore
} from "../lib/esoterica";
import { buildRitualCalendarFacts } from "../lib/ritual-calendar";
import { enforceRateLimit } from "../lib/rate-limit";
import { ApiError, sendApiError } from "../lib/http-errors";

export const readingRoutes = async (app: FastifyInstance) => {
  app.post("/natal", async (request, reply) => {
    const limited = await enforceRateLimit({
      request,
      reply,
      scope: "reading",
      max: Number(process.env.READING_RATE_LIMIT_MAX ?? 20),
      windowMs: Number(process.env.READING_RATE_LIMIT_WINDOW_MS ?? 60_000)
    });
    if (limited) return limited;

    const parsed = ReadingRequestInput.safeParse(request.body);
    if (!parsed.success) {
      return sendApiError(
        reply,
        request.id,
        new ApiError("BAD_REQUEST", "Invalid reading payload.", {
          statusCode: 400,
          issues: parsed.error.issues
        }),
        request.log
      );
    }
    request.brandId = parsed.data.brandId;

    try {
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
      const chart = chartValidation.data as NatalChart;
      const cache = createCache();
      const loreQuery = buildLoreQuery(chart, brand);
      const loreChunks = await retrieveEsotericaLore(loreQuery, 4, brand.id);
      const loreContext = renderLoreContext(loreChunks);
      const calendarFacts = await buildRitualCalendarFacts(
        chart,
        parsed.data.length === "short" ? 5 : parsed.data.length === "standard" ? 7 : 10
      );
      const chartHash = hashObject(chart);
      await appendLoreAudit(
        buildAuditEntry({
          brandId: brand.id,
          chartHash,
          query: loreQuery,
          chunks: loreChunks
        })
      );
      const reading = await generateReading({
        chart,
        brand,
        length: parsed.data.length,
        preferences: {
          ...parsed.data.preferences,
          lore: loreContext,
          calendar: calendarFacts
        },
        cache
      });

      if (parsed.data.chartProfileId) {
        const user = await authenticateRequest(request);
        const chart = await prisma.chartProfile.findFirst({
          where: {
            id: parsed.data.chartProfileId,
            userId: user.id,
            brandId: parsed.data.brandId
          }
        });
        if (!chart) {
          return reply.status(404).send({ error: "Chart not found." });
        }
        const savedReading = await prisma.reading.create({
          data: {
            chartProfileId: parsed.data.chartProfileId,
            brandId: parsed.data.brandId,
            kind: "natal",
            length: parsed.data.length,
            title: reading.reading.title,
            excerpt: reading.reading.excerpt,
            readingJson: reading.reading,
            provider: reading.meta.provider,
            model: reading.meta.model,
            isFallback: reading.meta.usedFallback
          }
        });

        if (parsed.data.saveToFeed) {
          await prisma.contentEntry.upsert({
            where: {
              userId_brandId_slug: {
                userId: user.id,
                brandId: parsed.data.brandId,
                slug: `initial-${chart.id}`
              }
            },
            update: {
              title: reading.reading.title,
              excerpt: reading.reading.excerpt,
              bodyJson: reading.reading,
              readingId: savedReading.id,
              meta: {
                provider: reading.meta.provider,
                model: reading.meta.model,
                isFallback: reading.meta.usedFallback,
                length: parsed.data.length
              }
            },
            create: {
              userId: user.id,
              chartProfileId: chart.id,
              readingId: savedReading.id,
              brandId: parsed.data.brandId,
              kind: "initial-report",
              slug: `initial-${chart.id}`,
              title: reading.reading.title,
              excerpt: reading.reading.excerpt,
              bodyJson: reading.reading,
              meta: {
                provider: reading.meta.provider,
                model: reading.meta.model,
                isFallback: reading.meta.usedFallback,
                length: parsed.data.length
              }
            }
          });
        }
      }

      return reading;
    } catch (error) {
      return sendApiError(reply, request.id, error, request.log);
    }
  });
};
