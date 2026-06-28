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
    generateHumanGuide.mockResolvedValue({
      guide: {
        title: "Human Guide"
      },
      meta: {
        provider: "test",
        model: "test",
        usedFallback: false
      }
    });

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

  it("rejects unsupported persistence fields for generate-only requests", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/human-guide/natal",
      headers: {
        "content-type": "application/json",
        "x-request-id": "human-guide-save-to-feed"
      },
      payload: {
        chartJson,
        brandId: "jupiterseek",
        saveToFeed: true
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: {
        code: "BAD_REQUEST",
        message: "Invalid human guide payload."
      },
      requestId: "human-guide-save-to-feed"
    });
    expect(retrieveEsotericaLore).not.toHaveBeenCalled();
    expect(generateHumanGuide).not.toHaveBeenCalled();
  });

  it("retrieves with the Human Guide policy and returns the generator result", async () => {
    const chunk = {
      id: "hermetic-source",
      source: "hermes.pdf",
      title: "Hermetic Source",
      text: "Hermes teaches microcosm and macrocosm.",
      embedding: [],
      tags: ["source:hermetic"]
    };
    const generatorResult = {
      guide: {
        title: "Human Guide",
        sourceProvenance: [
          {
            title: "Hermetic Source",
            source: "hermes.pdf",
            tags: ["source:hermetic"],
            sections: ["metaFrame", "internalMap", "practicalCounsel"]
          }
        ]
      },
      meta: {
        provider: "test",
        model: "test",
        usedFallback: false
      }
    };
    retrieveEsotericaLore.mockResolvedValue([chunk]);
    generateHumanGuide.mockResolvedValue(generatorResult);

    const response = await app.inject({
      method: "POST",
      url: "/v1/human-guide/natal",
      headers: {
        "content-type": "application/json",
        "x-request-id": "human-guide-happy"
      },
      payload: {
        chartJson,
        brandId: "jupiterseek"
      }
    });

    const { HUMAN_GUIDE_SOURCE_POLICY } = await import("../../lib/esoterica");

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(generatorResult);
    expect(retrieveEsotericaLore).toHaveBeenCalledWith(expect.any(String), 8, undefined, HUMAN_GUIDE_SOURCE_POLICY);
    expect(generateHumanGuide).toHaveBeenCalledWith(
      expect.objectContaining({
        loreContext: expect.stringContaining("Hermetic Source"),
        sourceProvenance: [
          {
            title: "Hermetic Source",
            source: "hermes.pdf",
            tags: ["source:hermetic"],
            sections: ["metaFrame", "internalMap", "practicalCounsel"]
          }
        ]
      })
    );
  });
});
