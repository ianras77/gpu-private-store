import { describe, expect, it } from "vitest";
import { requestCanonicalListener } from "../dj/canonical-listener";

describe("canonical radio listener connection", () => {
  it("reports missing canonical configuration without trying a legacy endpoint", async () => {
    const noUrl = await requestCanonicalListener({ prompt: "hello", internalToken: "token" });
    const noToken = await requestCanonicalListener({ prompt: "hello", baseUrl: "http://intelligence" });
    expect(noUrl).toEqual({ ok: false, reason: "url_missing" });
    expect(noToken).toEqual({ ok: false, reason: "token_missing" });
  });

  it("calls the registered radio-listener agent and returns its text", async () => {
    let requestedUrl = "";
    let requestedAuthorization = "";
    const result = await requestCanonicalListener({
      baseUrl: "http://intelligence/",
      internalToken: " private-token ",
      prompt: "station prompt",
      fetcher: async (input, init) => {
        requestedUrl = String(input);
        requestedAuthorization = new Headers(init?.headers).get("authorization") ?? "";
        return Response.json({ agentId: "radio-listener", text: "{\\\"reply\\\":\\\"A warm late set.\\\"}" });
      },
    });
    expect(requestedUrl).toBe("http://intelligence/v1/agents/radio-listener/generate");
    expect(requestedAuthorization).toBe("Bearer private-token");
    expect(result).toEqual({ ok: true, text: "{\\\"reply\\\":\\\"A warm late set.\\\"}" });
  });

  it("classifies HTTP, empty, malformed, and timed out responses for the circuit breaker", async () => {
    const base = { baseUrl: "http://intelligence", internalToken: "token", prompt: "hello" };
    const httpFailure = await requestCanonicalListener({ ...base, fetcher: async () => new Response(null, { status: 503 }) });
    const empty = await requestCanonicalListener({ ...base, fetcher: async () => Response.json({ text: "  " }) });
    const malformed = await requestCanonicalListener({ ...base, fetcher: async () => new Response("bad json") });
    const timedOut = await requestCanonicalListener({
      ...base,
      timeoutMs: 5,
      fetcher: async (_input, init) => new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
      }),
    });
    expect(httpFailure).toEqual({ ok: false, reason: "http_error", status: 503 });
    expect(empty).toEqual({ ok: false, reason: "empty_response" });
    expect(malformed).toEqual({ ok: false, reason: "invalid_response" });
    expect(timedOut).toEqual({ ok: false, reason: "timeout" });
  });
});
