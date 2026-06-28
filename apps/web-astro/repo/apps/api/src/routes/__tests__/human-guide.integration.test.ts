import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";

const generateHumanGuide = vi.fn();
const retrieveEsotericaLore = vi.fn();

vi.mock("@astro/reading-core", async () => {
  const actual = await vi.importActual<typeof import("@astro/reading-core")>("@astro/reading-core");
  return {
    ...actual,
    generateHumanGuide
  };
});

vi.mock("../../lib/esoterica", async () => {
  const actual = await vi.importActual<typeof import("../../lib/esoterica")>("../../lib/esoterica");
  return {
    ...actual,
    retrieveEsotericaLore
  };
});

vi.mock("../../lib/prisma", () => ({
  prisma: {
    chartProfile: {
      findFirst: vi.fn()
    },
    reading: {
      create: vi.fn()
    },
    contentEntry: {
      upsert: vi.fn()
    },
    user: {
      findUnique: vi.fn()
    },
    session: {
      findUnique: vi.fn()
    }
  }
}));

const chartJson = {
  points: [{ key: "Sun", type: "planet", degree: 120, sign: "Leo", signDegree: 0, house: 5 }],
  aspects: [],
  meta: {
    timeUnknown: false,
    timezone: "UTC",
    calculatedAt: "2026-01-01T00:00:00.000Z",
    calculationConfidence: "canonical"
  }
};

describe("human guide routes", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    retrieveEsotericaLore.mockResolvedValue([]);

    const { buildServer } = await import("../../server");
    app = buildServer();
    await app.ready();
  });

  afterEach(async () => {
    await app?.close();
    vi.resetModules();
  });

  it("returns a clear API error without calling generation when source provenance is unavailable", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/human-guide/natal",
      headers: {
        "content-type": "application/json",
        "x-request-id": "human-guide-empty-sources"
      },
      payload: {
        chartJson,
        brandId: "jupiterseek"
      }
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      error: {
        code: "SERVICE_UNAVAILABLE",
        message: "Human Guide source provenance is unavailable."
      },
      requestId: "human-guide-empty-sources"
    });
    expect(generateHumanGuide).not.toHaveBeenCalled();
  });
});
