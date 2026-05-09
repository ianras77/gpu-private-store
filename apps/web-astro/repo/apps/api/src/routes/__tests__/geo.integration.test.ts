import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildServer } from "../../server";
import { resetGeoForTests } from "../../lib/geo";

const ENV_KEYS = [
  "NODE_ENV",
  "MAPBOX_TOKEN",
  "OPENCAGE_KEY",
  "NOMINATIM_USER_AGENT",
  "NOMINATIM_CONTACT_EMAIL",
  "GEO_PROVIDER_ALLOW_NOMINATIM_IN_PROD",
  "GEO_FALLBACK_ON_EMPTY_RESULTS",
  "REDIS_URL"
] as const;

const envSnapshot = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]])) as Record<string, string | undefined>;

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

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json"
    }
  });

describe("geo routes integration", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    resetGeoForTests();
    restoreEnv();

    process.env.NODE_ENV = "development";
    process.env.GEO_PROVIDER_ALLOW_NOMINATIM_IN_PROD = "0";
    process.env.GEO_FALLBACK_ON_EMPTY_RESULTS = "0";
    delete process.env.REDIS_URL;

    app = buildServer();
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    resetGeoForTests();
    restoreEnv();
  });

  it("returns candidates from mapbox and keeps compatibility results", async () => {
    process.env.MAPBOX_TOKEN = "mapbox-token";
    delete process.env.OPENCAGE_KEY;
    process.env.NOMINATIM_USER_AGENT = "astro-test/1.0";
    process.env.NOMINATIM_CONTACT_EMAIL = "astro@example.com";
    resetGeoForTests();

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = input.toString();
        if (url.includes("api.mapbox.com")) {
          return jsonResponse({
            features: [
              {
                id: "place.1",
                text: "New York",
                place_name: "New York, New York, United States",
                center: [-74.006, 40.7128],
                relevance: 0.99,
                context: [
                  { id: "region.1", text: "New York" },
                  { id: "country.1", text: "United States", short_code: "us" }
                ]
              }
            ]
          });
        }
        throw new Error(`Unexpected URL ${url}`);
      })
    );

    const response = await app.inject({
      method: "POST",
      url: "/v1/geo/resolve",
      headers: {
        "content-type": "application/json",
        "x-request-id": "req-mapbox-1",
        "x-brand-id": "saturnseer"
      },
      payload: {
        query: "New York",
        limit: 5,
        locale: "en"
      }
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.brandId).toBe("saturnseer");
    expect(body.meta.providerUsed).toBe("mapbox");
    expect(body.candidates.length).toBeGreaterThan(0);
    expect(body.candidates[0].timezone).toBe("America/New_York");
    expect(body.results[0].name).toBe(body.candidates[0].label);
    expect(response.headers["x-request-id"]).toBe("req-mapbox-1");
  });

  it("exposes provider diagnostics without leaking API keys", async () => {
    process.env.MAPBOX_TOKEN = "mapbox-secret-token";
    process.env.OPENCAGE_KEY = "opencage-secret-token";
    process.env.NOMINATIM_USER_AGENT = "astro-test/1.0";
    process.env.NOMINATIM_CONTACT_EMAIL = "astro@example.com";
    resetGeoForTests();

    const response = await app.inject({
      method: "GET",
      url: "/health/providers"
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(Array.isArray(body.providers)).toBe(true);
    const mapbox = body.providers.find((provider: any) => provider.id === "mapbox");
    expect(mapbox?.configured).toBe(true);
    expect(mapbox?.enabled).toBe(true);
    expect(JSON.stringify(body)).not.toContain("mapbox-secret-token");
    expect(JSON.stringify(body)).not.toContain("opencage-secret-token");
  });

  it("falls back to nominatim in development when paid providers are not configured", async () => {
    delete process.env.MAPBOX_TOKEN;
    delete process.env.OPENCAGE_KEY;
    process.env.NOMINATIM_USER_AGENT = "astro-test/1.0";
    process.env.NOMINATIM_CONTACT_EMAIL = "astro@example.com";
    resetGeoForTests();

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = input.toString();
        if (url.includes("/search")) {
          return jsonResponse([
            {
              place_id: 22,
              display_name: "London, Greater London, England, United Kingdom",
              lat: "51.5072",
              lon: "-0.1276",
              importance: 0.9,
              address: {
                city: "London",
                state: "England",
                country: "United Kingdom",
                country_code: "gb"
              }
            }
          ]);
        }
        throw new Error(`Unexpected URL ${url}`);
      })
    );

    const response = await app.inject({
      method: "POST",
      url: "/v1/geo/resolve",
      headers: {
        "content-type": "application/json"
      },
      payload: {
        query: "London",
        limit: 5
      }
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.meta.providerUsed).toBe("nominatim");
    expect(body.candidates[0].label.toLowerCase()).toContain("london");
    expect(body.candidates[0].timezone).toBe("Europe/London");
  });

  it("returns GEO_NO_RESULTS with 200 when provider has no candidates", async () => {
    process.env.MAPBOX_TOKEN = "mapbox-token";
    delete process.env.OPENCAGE_KEY;
    process.env.NOMINATIM_USER_AGENT = "astro-test/1.0";
    process.env.NOMINATIM_CONTACT_EMAIL = "astro@example.com";
    process.env.GEO_FALLBACK_ON_EMPTY_RESULTS = "0";
    resetGeoForTests();

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = input.toString();
        if (url.includes("api.mapbox.com")) {
          return jsonResponse({ features: [] });
        }
        throw new Error(`Unexpected URL ${url}`);
      })
    );

    const response = await app.inject({
      method: "POST",
      url: "/v1/geo/resolve",
      headers: {
        "content-type": "application/json"
      },
      payload: {
        query: "zzzz-no-result",
        limit: 5
      }
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.candidates).toEqual([]);
    expect(body.results).toEqual([]);
    expect(body.meta.code).toBe("GEO_NO_RESULTS");
    expect(body.meta.providerUsed).toBe("mapbox");
  });

  it("falls back to the next provider when primary fails with 5xx", async () => {
    process.env.MAPBOX_TOKEN = "mapbox-token";
    process.env.OPENCAGE_KEY = "opencage-key";
    process.env.NOMINATIM_USER_AGENT = "astro-test/1.0";
    process.env.NOMINATIM_CONTACT_EMAIL = "astro@example.com";
    resetGeoForTests();

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = input.toString();
        if (url.includes("api.mapbox.com")) {
          return jsonResponse({ message: "down" }, 500);
        }
        if (url.includes("api.opencagedata.com")) {
          return jsonResponse({
            results: [
              {
                formatted: "Paris, France",
                confidence: 9,
                geometry: { lat: 48.8566, lng: 2.3522 },
                components: {
                  city: "Paris",
                  state: "Ile-de-France",
                  country_code: "fr"
                }
              }
            ]
          });
        }
        throw new Error(`Unexpected URL ${url}`);
      })
    );

    const response = await app.inject({
      method: "POST",
      url: "/v1/geo/resolve",
      headers: {
        "content-type": "application/json"
      },
      payload: {
        query: "Paris",
        limit: 5
      }
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.meta.providerUsed).toBe("opencage");
    expect(body.candidates[0].timezone).toBe("Europe/Paris");
  });

  it("supports reverse geocoding with timezone inference", async () => {
    process.env.MAPBOX_TOKEN = "mapbox-token";
    delete process.env.OPENCAGE_KEY;
    process.env.NOMINATIM_USER_AGENT = "astro-test/1.0";
    process.env.NOMINATIM_CONTACT_EMAIL = "astro@example.com";
    resetGeoForTests();

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = input.toString();
        if (url.includes("api.mapbox.com")) {
          return jsonResponse({
            features: [
              {
                id: "place.1",
                text: "New York",
                place_name: "New York, New York, United States",
                center: [-74.006, 40.7128],
                relevance: 0.99,
                context: [
                  { id: "region.1", text: "New York" },
                  { id: "country.1", text: "United States", short_code: "us" }
                ]
              }
            ]
          });
        }
        throw new Error(`Unexpected URL ${url}`);
      })
    );

    const response = await app.inject({
      method: "POST",
      url: "/v1/geo/reverse",
      headers: {
        "content-type": "application/json",
        "x-brand-id": "saturnleo"
      },
      payload: {
        lat: 40.7128,
        lon: -74.006,
        locale: "en"
      }
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.meta.providerUsed).toBe("mapbox");
    expect(body.result.timezone).toBe("America/New_York");
    expect(body.result.label.toLowerCase()).toContain("new york");
  });
});
