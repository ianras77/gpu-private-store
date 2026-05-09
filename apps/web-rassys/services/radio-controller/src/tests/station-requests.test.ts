import { describe, expect, it, vi } from "vitest";

vi.mock("../redis", () => ({
  redis: {}
}));

import { stationRequestsMatch, type StationRequest } from "../station-requests";

const buildRequest = (overrides: Partial<StationRequest> = {}): StationRequest => ({
  id: overrides.id ?? "request-1",
  kind: overrides.kind ?? "track",
  summary: overrides.summary ?? "Default request",
  listenerMessage: overrides.listenerMessage ?? null,
  trackId: overrides.trackId ?? null,
  trackIds: overrides.trackIds ?? [],
  reason: overrides.reason ?? null,
  response: overrides.response ?? null,
  createdAt: overrides.createdAt ?? 1,
  target: overrides.target ?? null,
  source: overrides.source ?? "chat",
  status: overrides.status ?? "accepted",
  intent: overrides.intent ?? "track"
});

describe("stationRequestsMatch", () => {
  it("keeps distinct broad-lane asks even when they land on the same lead track", () => {
    const existing = buildRequest({
      id: "request-a",
      summary: "I need a worn-out lane tonight",
      listenerMessage: "I need a worn-out lane tonight",
      trackId: "track-17",
      trackIds: ["track-17", "track-23"],
      intent: "mood"
    });
    const candidate = buildRequest({
      id: "request-b",
      summary: "Give me a soft midnight lane with low end",
      listenerMessage: "Give me a soft midnight lane with low end",
      trackId: "track-17",
      trackIds: ["track-17", "track-23"],
      intent: "mood"
    });

    expect(stationRequestsMatch(existing, candidate)).toBe(false);
  });

  it("still collapses duplicate direct track requests", () => {
    const existing = buildRequest({
      id: "request-a",
      summary: "Untitled by AFX",
      listenerMessage: "Can you keep Untitled by AFX on the line?",
      trackId: "track-99",
      trackIds: ["track-99"],
      intent: "track"
    });
    const candidate = buildRequest({
      id: "request-b",
      summary: "Untitled by AFX",
      listenerMessage: "Can you keep that AFX cut on the line?",
      trackId: "track-99",
      trackIds: ["track-99"],
      intent: "track"
    });

    expect(stationRequestsMatch(existing, candidate)).toBe(true);
  });
});
