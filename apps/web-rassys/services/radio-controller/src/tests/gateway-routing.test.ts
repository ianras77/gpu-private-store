import { describe, expect, it } from "vitest";
import { resolveDJGateway } from "../dj/gateway-routing";

describe("Mr Rassy DJ gateway routing", () => {
  it("sends canonical mode to Mastra with its internal service token", () => {
    expect(resolveDJGateway({
      requireCanonical: true,
      intelligenceUrl: "http://rassy-intelligence:1866/",
      internalToken: "mastra-service-token",
      legacyUrl: "http://legacy-edge:8844",
      legacyApiKey: "legacy-api-key",
    })).toEqual({ ok: true, baseUrl: "http://rassy-intelligence:1866", token: "mastra-service-token", source: "mastra" });
  });

  it("fails visibly instead of silently using a legacy model gateway", () => {
    expect(resolveDJGateway({ requireCanonical: true, legacyUrl: "http://legacy-edge:8844", legacyApiKey: "legacy-api-key" }))
      .toEqual({ ok: false, reason: "canonical_url_missing" });
    expect(resolveDJGateway({ requireCanonical: true, intelligenceUrl: "http://rassy-intelligence:1866", legacyUrl: "http://legacy-edge:8844" }))
      .toEqual({ ok: false, reason: "canonical_token_missing" });
  });

  it("retains the explicit legacy route only when canonical mode is disabled", () => {
    expect(resolveDJGateway({ requireCanonical: false, legacyUrl: "http://legacy-edge:8844/", legacyApiKey: "legacy-api-key" }))
      .toEqual({ ok: true, baseUrl: "http://legacy-edge:8844", token: "legacy-api-key", source: "rassymind" });
  });

  it("keeps Mastra's internal token paired with its URL when compatibility mode points there", () => {
    expect(resolveDJGateway({
      requireCanonical: false,
      intelligenceUrl: "http://rassy-intelligence:1866/",
      internalToken: "mastra-service-token",
      legacyUrl: "http://rassy-intelligence:1866",
      legacyApiKey: "unrelated-model-key",
    })).toEqual({ ok: true, baseUrl: "http://rassy-intelligence:1866", token: "mastra-service-token", source: "mastra" });
  });
});
