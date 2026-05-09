import { BRANDS, type BrandId } from "@astro/brands";
import type { NatalChart } from "@astro/astro-core";
import {
  generateReading,
  generateWeeklyContent,
  type GenerateReadingResult,
  type GenerateWeeklyContentResult,
  type ReadingLength
} from "@astro/reading-core";
import { createCache } from "@astro/utils";
import { prisma } from "./prisma";

const cache = createCache();

const startOfUtcWeek = (input = new Date()) => {
  const date = new Date(Date.UTC(input.getUTCFullYear(), input.getUTCMonth(), input.getUTCDate()));
  const day = date.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + diff);
  date.setUTCHours(0, 0, 0, 0);
  return date;
};

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

const serializeContentEntry = (entry: any) => ({
  id: entry.id,
  brandId: entry.brandId,
  kind: entry.kind,
  status: entry.status,
  slug: entry.slug,
  title: entry.title,
  excerpt: entry.excerpt,
  body: entry.bodyJson,
  meta: entry.meta,
  weekOf: entry.weekOf,
  publishedAt: entry.publishedAt,
  createdAt: entry.createdAt,
  chartProfileId: entry.chartProfileId
});

const requireBrand = (brandId: string) => {
  const brand = BRANDS[brandId as BrandId];
  if (!brand) {
    throw new Error(`Unknown brand: ${brandId}`);
  }
  return brand;
};

const getOwnedChart = async (userId: string, chartProfileId: string, brandId: string) => {
  const chart = await prisma.chartProfile.findFirst({
    where: {
      id: chartProfileId,
      userId,
      brandId
    }
  });
  if (!chart) {
    throw new Error("Chart not found.");
  }
  return chart;
};

const saveNatalReading = async (params: {
  userId: string;
  chart: any;
  brandId: string;
  length: ReadingLength;
  result: GenerateReadingResult;
}) => {
  const reading = await prisma.reading.create({
    data: {
      chartProfileId: params.chart.id,
      brandId: params.brandId,
      kind: "natal",
      length: params.length,
      title: params.result.reading.title,
      excerpt: params.result.reading.excerpt,
      readingJson: params.result.reading,
      provider: params.result.meta.provider,
      model: params.result.meta.model,
      isFallback: params.result.meta.usedFallback
    }
  });

  const entry = await prisma.contentEntry.upsert({
    where: {
      userId_brandId_slug: {
        userId: params.userId,
        brandId: params.brandId,
        slug: `initial-${params.chart.id}`
      }
    },
    update: {
      title: params.result.reading.title,
      excerpt: params.result.reading.excerpt,
      bodyJson: params.result.reading,
      readingId: reading.id,
      meta: {
        provider: params.result.meta.provider,
        model: params.result.meta.model,
        isFallback: params.result.meta.usedFallback,
        length: params.length
      }
    },
    create: {
      userId: params.userId,
      chartProfileId: params.chart.id,
      readingId: reading.id,
      brandId: params.brandId,
      kind: "initial-report",
      slug: `initial-${params.chart.id}`,
      title: params.result.reading.title,
      excerpt: params.result.reading.excerpt,
      bodyJson: params.result.reading,
      meta: {
        provider: params.result.meta.provider,
        model: params.result.meta.model,
        isFallback: params.result.meta.usedFallback,
        length: params.length
      }
    }
  });

  return entry;
};

export const createInitialReport = async (params: {
  userId: string;
  chartProfileId: string;
  brandId: string;
  length: ReadingLength;
  force?: boolean;
}) => {
  const brand = requireBrand(params.brandId);
  const chart = await getOwnedChart(params.userId, params.chartProfileId, params.brandId);

  if (!params.force) {
    const existing = await prisma.contentEntry.findUnique({
      where: {
        userId_brandId_slug: {
          userId: params.userId,
          brandId: params.brandId,
          slug: `initial-${chart.id}`
        }
      }
    });
    if (existing) return serializeContentEntry(existing);
  }

  const result = await generateReading({
    chart: chart.chartJson as NatalChart,
    brand,
    length: params.length,
    cache
  });

  const entry = await saveNatalReading({
    userId: params.userId,
    chart,
    brandId: params.brandId,
    length: params.length,
    result
  });

  return serializeContentEntry(entry);
};

export const createWeeklyUpdate = async (params: {
  userId: string;
  chartProfileId: string;
  brandId: string;
  force?: boolean;
}) => {
  const brand = requireBrand(params.brandId);
  const chart = await getOwnedChart(params.userId, params.chartProfileId, params.brandId);
  const weekOfDate = startOfUtcWeek();
  const weekOf = weekOfDate.toISOString().slice(0, 10);
  const slug = `weekly-${weekOf}-${chart.id.slice(0, 8)}`;

  if (!params.force) {
    const existing = await prisma.contentEntry.findUnique({
      where: {
        userId_brandId_slug: {
          userId: params.userId,
          brandId: params.brandId,
          slug
        }
      }
    });
    if (existing) return serializeContentEntry(existing);
  }

  const previousEntries = await prisma.contentEntry.findMany({
    where: {
      userId: params.userId,
      brandId: params.brandId,
      chartProfileId: chart.id
    },
    orderBy: { publishedAt: "desc" },
    take: 3,
    select: {
      title: true,
      excerpt: true
    }
  });

  const result: GenerateWeeklyContentResult = await generateWeeklyContent({
    chart: chart.chartJson as NatalChart,
    brand,
    weekOf,
    previousEntries,
    cache
  });

  const entry = await prisma.contentEntry.upsert({
    where: {
      userId_brandId_slug: {
        userId: params.userId,
        brandId: params.brandId,
        slug
      }
    },
    update: {
      title: result.entry.title,
      excerpt: result.entry.excerpt,
      bodyJson: result.entry,
      weekOf: weekOfDate,
      publishedAt: new Date(),
      meta: {
        provider: result.meta.provider,
        model: result.meta.model,
        isFallback: result.meta.usedFallback
      }
    },
    create: {
      userId: params.userId,
      chartProfileId: chart.id,
      brandId: params.brandId,
      kind: "weekly-update",
      slug,
      title: result.entry.title,
      excerpt: result.entry.excerpt,
      bodyJson: result.entry,
      weekOf: weekOfDate,
      meta: {
        provider: result.meta.provider,
        model: result.meta.model,
        isFallback: result.meta.usedFallback
      }
    }
  });

  return serializeContentEntry(entry);
};

export const listUserContent = async (params: {
  userId: string;
  brandId: string;
  limit?: number;
}) => {
  const entries = await prisma.contentEntry.findMany({
    where: {
      userId: params.userId,
      brandId: params.brandId
    },
    orderBy: { publishedAt: "desc" },
    take: params.limit ?? 20
  });

  return entries.map(serializeContentEntry);
};

export const runWeeklyContentEngine = async (params?: {
  brandId?: string;
  limit?: number;
}) => {
  const charts = await prisma.chartProfile.findMany({
    where: {
      autoWeekly: true,
      isPrimary: true,
      ...(params?.brandId ? { brandId: params.brandId } : {})
    },
    orderBy: { updatedAt: "desc" },
    take: params?.limit ?? Number(process.env.CONTENT_ENGINE_BATCH_SIZE ?? 20)
  });

  let generated = 0;
  let skipped = 0;
  let failed = 0;

  for (const chart of charts) {
    const job = await prisma.contentJob.create({
      data: {
        userId: chart.userId,
        chartProfileId: chart.id,
        brandId: chart.brandId,
        kind: "weekly-update",
        status: "running",
        startedAt: new Date(),
        requestJson: {
          chartProfileId: chart.id,
          brandId: chart.brandId
        }
      }
    });

    try {
      const weekOf = startOfUtcWeek().toISOString().slice(0, 10);
      const slug = `weekly-${weekOf}-${chart.id.slice(0, 8)}`;
      const existing = await prisma.contentEntry.findUnique({
        where: {
          userId_brandId_slug: {
            userId: chart.userId,
            brandId: chart.brandId,
            slug
          }
        }
      });

      if (existing) {
        skipped += 1;
        await prisma.contentJob.update({
          where: { id: job.id },
          data: {
            status: "skipped",
            completedAt: new Date(),
            contentEntryId: existing.id,
            resultJson: {
              slug,
              skipped: true
            }
          }
        });
        continue;
      }

      const entry = await createWeeklyUpdate({
        userId: chart.userId,
        chartProfileId: chart.id,
        brandId: chart.brandId
      });

      generated += 1;
      await prisma.contentJob.update({
        where: { id: job.id },
        data: {
          status: "completed",
          completedAt: new Date(),
          contentEntryId: entry.id,
          resultJson: entry
        }
      });
    } catch (error: any) {
      failed += 1;
      await prisma.contentJob.update({
        where: { id: job.id },
        data: {
          status: "failed",
          completedAt: new Date(),
          error: error?.message ?? "Unknown error"
        }
      });
    }
  }

  return {
    ok: true,
    processed: charts.length,
    generated,
    skipped,
    failed
  };
};

export const buildContentJobLabel = (entry: { title: string; brandId: string }) =>
  slugify(`${entry.brandId}-${entry.title}`);
