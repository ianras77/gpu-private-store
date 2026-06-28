import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";

const readEsotericaIngestStatus = vi.fn();
const runEsotericaIngest = vi.fn();

vi.mock("../../lib/esoterica-ingestor", () => ({
  readEsotericaIngestStatus,
  runEsotericaIngest
}));

const ENV_KEYS = ["ESOTERICA_ADMIN_TOKEN"] as const;

const envSnapshot = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]])) as Record<
  string,
  string | undefined
>;

const restoreEnv = () => {
  for (const key of ENV_KEYS) {
    const value = envSnapshot[key];
    if (typeof value === "undefined") {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
};

describe("lore routes integration", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    restoreEnv();
    readEsotericaIngestStatus.mockResolvedValue({
      updatedAt: "2026-06-28T00:00:00.000Z",
      lastResult: {
        dryRun: false,
        filesDiscovered: 1,
        chunksEmbedded: 2
      }
    });
    runEsotericaIngest.mockResolvedValue({
      dryRun: true,
      filesDiscovered: 1,
      filesPlanned: 1,
      chunksPlanned: 2,
      chunksEmbedded: 0
    });

    const { buildServer } = await import("../../server");
    app = buildServer();
    await app.ready();
  });

  afterEach(async () => {
    await app?.close();
    restoreEnv();
    vi.resetModules();
  });

  it("returns 503 for status when admin token is missing", async () => {
    delete process.env.ESOTERICA_ADMIN_TOKEN;

    const response = await app.inject({
      method: "GET",
      url: "/v1/lore/status"
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ error: "Admin token not configured." });
    expect(readEsotericaIngestStatus).not.toHaveBeenCalled();
  });

  it("returns 401 for status when token is wrong", async () => {
    process.env.ESOTERICA_ADMIN_TOKEN = "correct-token";

    const response = await app.inject({
      method: "GET",
      url: "/v1/lore/status",
      headers: {
        "x-admin-token": "wrong-token"
      }
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: "Unauthorized." });
    expect(readEsotericaIngestStatus).not.toHaveBeenCalled();
  });

  it("returns ingest status for a good token", async () => {
    process.env.ESOTERICA_ADMIN_TOKEN = "correct-token";

    const response = await app.inject({
      method: "GET",
      url: "/v1/lore/status",
      headers: {
        authorization: "Bearer correct-token"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: {
        lastResult: {
          filesDiscovered: 1,
          chunksEmbedded: 2
        }
      }
    });
    expect(readEsotericaIngestStatus).toHaveBeenCalledOnce();
  });

  it("runs dry-run ingestion for a good token", async () => {
    process.env.ESOTERICA_ADMIN_TOKEN = "correct-token";

    const response = await app.inject({
      method: "POST",
      url: "/v1/lore/ingest",
      headers: {
        "content-type": "application/json",
        "x-admin-token": "correct-token"
      },
      payload: {
        dryRun: true
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      result: {
        dryRun: true,
        filesDiscovered: 1,
        chunksPlanned: 2
      }
    });
    expect(runEsotericaIngest).toHaveBeenCalledWith({ dryRun: true });
  });
});
