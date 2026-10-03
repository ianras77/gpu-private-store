import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";

const mocks = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
  conversation: {
    findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn()
  },
  chartProfile: { findFirst: vi.fn() },
  workflowCreateRun: vi.fn()
}));

vi.mock("../../lib/auth", () => ({ authenticateRequest: mocks.authenticateRequest }));
vi.mock("../../lib/prisma", () => ({ prisma: { astroConversation: mocks.conversation, chartProfile: mocks.chartProfile } }));
vi.mock("@astro/astro-intelligence", () => ({ chartCompanionV1Workflow: { createRun: mocks.workflowCreateRun } }));

import { chartCompanionRoutes } from "../chart-companion";

const chart = {
  points: [{ key: "Moon", type: "planet", degree: 120, sign: "Leo", signDegree: 0 }],
  aspects: [],
  meta: { timeUnknown: true, timezone: "UTC", calculatedAt: "2026-01-01T00:00:00.000Z" }
};

const conversation = {
  id: "conversation-1", userId: "user-1", chartProfileId: "chart-1", brandId: "jupiterseek",
  resourceId: "user-1", threadId: "thread-1", memoryEnabled: true, messages: [],
  createdAt: new Date("2026-01-01T00:00:00.000Z"), updatedAt: new Date("2026-01-01T00:00:00.000Z")
};

describe("Chart Companion routes", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.authenticateRequest.mockResolvedValue({ id: "user-1", email: "listener@example.test" });
    mocks.chartProfile.findFirst.mockResolvedValue({ id: "chart-1", chartJson: chart });
    mocks.conversation.create.mockResolvedValue(conversation);
    mocks.conversation.findFirst.mockResolvedValue(conversation);
    mocks.conversation.update.mockResolvedValue(conversation);
    mocks.workflowCreateRun.mockResolvedValue({ start: vi.fn().mockResolvedValue({ status: "success", result: { answer: "Your Moon is in Leo.", factRefs: ["placement:moon"], toolCalls: ["get-chart-facts"], mode: "model", model: "rassy-mind", latencyMs: 42 } }) });

    app = Fastify({ logger: false });
    app.addHook("onRequest", async (request) => { request.brandId = "jupiterseek"; });
    app.register(chartCompanionRoutes, { prefix: "/v1/chart-companion" });
    await app.ready();
  });

  afterEach(async () => { await app.close(); });

  it("persists owner-scoped thread turns and returns the tool trace", async () => {
    const created = await app.inject({
      method: "POST", url: "/v1/chart-companion/threads",
      payload: { chartProfileId: "chart-1", brandId: "jupiterseek", memoryEnabled: true }
    });
    expect(created.statusCode).toBe(201);

    const response = await app.inject({
      method: "POST", url: "/v1/chart-companion/threads/conversation-1/messages",
      payload: { content: "What does my Moon placement suggest?" }
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().answer).toBe("Your Moon is in Leo.");
    expect(response.json().metadata.tools).toEqual(["get-chart-facts"]);
    const savedTurns = mocks.conversation.update.mock.calls[0]?.[0]?.data.messages as Array<{ role: string; factRefs?: string[] }> | undefined;
    expect(savedTurns?.map((turn) => turn.role)).toEqual(["user", "assistant"]);
    expect(savedTurns?.[1]?.factRefs).toEqual(["placement:moon"]);
  });

  it("rejects charts from another brand and deletes stored history when memory is disabled", async () => {
    const foreignBrand = await app.inject({
      method: "POST", url: "/v1/chart-companion/threads",
      payload: { chartProfileId: "chart-1", brandId: "oracleveil", memoryEnabled: true }
    });
    expect(foreignBrand.statusCode).toBe(400);

    mocks.conversation.findFirst.mockResolvedValue({ ...conversation, messages: [{ id: "old", role: "user", content: "old context", createdAt: new Date().toISOString() }] });
    const response = await app.inject({
      method: "PATCH", url: "/v1/chart-companion/threads/conversation-1/memory",
      payload: { enabled: false }
    });
    expect(response.statusCode).toBe(200);
    expect(mocks.conversation.update.mock.calls.at(-1)?.[0].data).toMatchObject({ memoryEnabled: false, messages: [] });
  });
});
