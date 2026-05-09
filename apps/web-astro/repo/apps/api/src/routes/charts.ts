import type { FastifyInstance } from "fastify";
import { authenticateRequest } from "../lib/auth";
import { prisma } from "../lib/prisma";
import { ChartProfileCreateInput } from "../lib/validators";
import { getEngine } from "../lib/engine";
import { resolveTimezoneFromLatLon, encryptString, isEncryptionEnabled, hashObject } from "@astro/utils";

const sanitizeChart = (chart: any) => ({
  id: chart.id,
  brandId: chart.brandId,
  label: chart.label,
  birthDate: chart.birthDate,
  timeUnknown: chart.timeUnknown,
  timezone: chart.timezone,
  locationLabel: chart.locationLabel,
  houseSystem: chart.houseSystem,
  isPrimary: chart.isPrimary,
  autoWeekly: chart.autoWeekly,
  chartJson: chart.chartJson,
  createdAt: chart.createdAt,
  updatedAt: chart.updatedAt,
  readingCount: chart._count?.readings ?? 0,
  contentCount: chart._count?.content ?? 0
});

export const chartsRoutes = async (app: FastifyInstance) => {
  app.get("/", async (request, reply) => {
    try {
      const user = await authenticateRequest(request);
      const charts = await prisma.chartProfile.findMany({
        where: {
          userId: user.id,
          brandId: request.brandId
        },
        include: {
          _count: {
            select: {
              readings: true,
              content: true
            }
          }
        },
        orderBy: [{ isPrimary: "desc" }, { createdAt: "desc" }]
      });
      return { charts: charts.map(sanitizeChart) };
    } catch (error: any) {
      return reply.status(401).send({ error: error.message });
    }
  });

  app.post("/", async (request, reply) => {
    try {
      const user = await authenticateRequest(request);
      const parsed = ChartProfileCreateInput.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten() });
      }

      const data = parsed.data;
      const tz = data.timezone ?? resolveTimezoneFromLatLon(data.lat, data.lon);
      const hasPrimary = await prisma.chartProfile.count({
        where: {
          userId: user.id,
          brandId: request.brandId,
          isPrimary: true
        }
      });
      const makePrimary = data.isPrimary ?? hasPrimary === 0;

      const chartJson = data.chartJson
        ? data.chartJson
        : await getEngine().calculateChart({
            birthDate: data.birthDate,
            birthTime: data.birthTime,
            timeUnknown: data.timeUnknown,
            latitude: data.lat,
            longitude: data.lon,
            timezone: tz
          }, { houseSystem: data.houseSystem });

      const chartHash = hashObject(chartJson);

      const encryptionEnabled = isEncryptionEnabled();
      const birthTimeEnc = !data.timeUnknown && data.birthTime && encryptionEnabled
        ? encryptString(data.birthTime)
        : null;
      const latEnc = encryptionEnabled ? encryptString(String(data.lat)) : null;
      const lonEnc = encryptionEnabled ? encryptString(String(data.lon)) : null;

      const chart = await prisma.chartProfile.create({
        data: {
          userId: user.id,
          brandId: request.brandId,
          label: data.label,
          birthDate: data.birthDate,
          birthTimeEnc,
          timeUnknown: data.timeUnknown ?? false,
          latEnc,
          lonEnc,
          timezone: tz,
          locationLabel: data.locationLabel,
          houseSystem: data.houseSystem,
          chartHash,
          chartJson,
          isPrimary: makePrimary
        },
        include: {
          _count: {
            select: {
              readings: true,
              content: true
            }
          }
        }
      });

      if (makePrimary) {
        await prisma.chartProfile.updateMany({
          where: {
            userId: user.id,
            brandId: request.brandId,
            NOT: {
              id: chart.id
            }
          },
          data: {
            isPrimary: false
          }
        });
      }

      return { chart: sanitizeChart(chart) };
    } catch (error: any) {
      return reply.status(400).send({ error: error.message });
    }
  });

  app.post("/:id/primary", async (request, reply) => {
    try {
      const user = await authenticateRequest(request);
      const { id } = request.params as { id: string };
      const chart = await prisma.chartProfile.findFirst({
        where: {
          id,
          userId: user.id,
          brandId: request.brandId
        }
      });
      if (!chart) {
        return reply.status(404).send({ error: "Chart not found." });
      }

      await prisma.$transaction([
        prisma.chartProfile.updateMany({
          where: {
            userId: user.id,
            brandId: request.brandId
          },
          data: { isPrimary: false }
        }),
        prisma.chartProfile.update({
          where: { id },
          data: { isPrimary: true }
        })
      ]);

      return { ok: true };
    } catch (error: any) {
      return reply.status(400).send({ error: error.message });
    }
  });

  app.delete("/:id", async (request, reply) => {
    try {
      const user = await authenticateRequest(request);
      const { id } = request.params as { id: string };
      await prisma.chartProfile.deleteMany({
        where: {
          id,
          userId: user.id,
          brandId: request.brandId
        }
      });
      return { ok: true };
    } catch (error: any) {
      return reply.status(400).send({ error: error.message });
    }
  });
};
