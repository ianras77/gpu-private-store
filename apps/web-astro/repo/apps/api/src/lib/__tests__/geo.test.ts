import { describe, expect, it } from "vitest";
import { geoInternals } from "../geo";

describe("geo internals", () => {
  it("normalizes query text", () => {
    expect(geoInternals.normalizeGeoQuery("  New   York  ")).toBe("new york");
  });

  it("builds provider-scoped forward cache keys", () => {
    const key = geoInternals.buildForwardCacheKey("mapbox", "New York", "en", 5);
    expect(key).toContain("mapbox");
    expect(key).toContain("new york");
    expect(key).toContain(":en:5");
  });

  it("builds rounded reverse cache keys", () => {
    const key = geoInternals.buildReverseCacheKey("nominatim", 40.71281234, -74.00601234, "en");
    expect(key).toContain("40.7128");
    expect(key).toContain("-74.006");
  });

  it("parses mapbox payload into normalized candidate with timezone", () => {
    const candidate = geoInternals.mapboxCandidate({
      id: "place.123",
      text: "New York",
      place_name: "New York, New York, United States",
      center: [-74.006, 40.7128],
      relevance: 0.98,
      context: [
        { id: "region.1", text: "New York" },
        { id: "country.1", text: "United States", short_code: "us" }
      ]
    });

    expect(candidate).not.toBeNull();
    expect(candidate?.provider).toBe("mapbox");
    expect(candidate?.timezone).toBe("America/New_York");
    expect(candidate?.countryCode).toBe("US");
  });

  it("parses opencage payload into normalized candidate with timezone", () => {
    const candidate = geoInternals.openCageCandidate({
      formatted: "London, United Kingdom",
      confidence: 9,
      geometry: { lat: 51.5072, lng: -0.1276 },
      components: {
        country_code: "gb",
        state: "England",
        city: "London"
      }
    });

    expect(candidate).not.toBeNull();
    expect(candidate?.provider).toBe("opencage");
    expect(candidate?.timezone).toBe("Europe/London");
    expect(candidate?.countryCode).toBe("GB");
  });

  it("parses nominatim payload into normalized candidate with timezone", () => {
    const candidate = geoInternals.nominatimCandidate({
      place_id: 1,
      display_name: "Paris, Ile-de-France, France",
      lat: "48.8566",
      lon: "2.3522",
      importance: 0.9,
      address: {
        city: "Paris",
        state: "Ile-de-France",
        country: "France",
        country_code: "fr"
      }
    });

    expect(candidate).not.toBeNull();
    expect(candidate?.provider).toBe("nominatim");
    expect(candidate?.timezone).toBe("Europe/Paris");
    expect(candidate?.countryCode).toBe("FR");
  });
});
