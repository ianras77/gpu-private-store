import { createCache, resolveTimezoneFromLatLon } from "@astro/utils";
import type { FastifyBaseLogger } from "fastify";
import { ApiError } from "./http-errors";

export interface GeocodeCandidate {
  label: string;
  lat: number;
  lon: number;
  countryCode?: string;
  region?: string;
  city?: string;
  confidence?: number;
  provider: string;
  timezone: string;
}

export interface ReverseGeocodeResult {
  label: string;
  lat: number;
  lon: number;
  timezone: string;
  provider: string;
  countryCode?: string;
  region?: string;
  city?: string;
}

export interface LegacyGeoCandidate {
  id: string;
  name: string;
  description?: string;
  lat: number;
  lon: number;
  timezone: string;
  countryCode?: string;
}

export interface GeocodeProvider {
  id: string;
  isConfigured(): boolean;
  forward(query: string, limit: number, locale?: string): Promise<GeocodeCandidate[]>;
  reverse(lat: number, lon: number, locale?: string): Promise<ReverseGeocodeResult | null>;
}

export type ProviderDiagnostics = {
  id: string;
  configured: boolean;
  enabled: boolean;
  missingEnv: string[];
};

type ProviderRegistryEntry = ProviderDiagnostics & {
  provider: GeocodeProvider;
};

type ProviderCallContext = {
  requestId: string;
  brandId: string;
  logger: FastifyBaseLogger;
};

type ProviderCallError = {
  providerId: string;
  message: string;
  statusCode?: number;
  retryable: boolean;
  type: "network" | "timeout" | "http" | "parse";
};

type ResolveLocationInput = {
  query: string;
  limit: number;
  locale?: string;
  requestId: string;
  brandId: string;
  logger: FastifyBaseLogger;
};

type ReverseLocationInput = {
  lat: number;
  lon: number;
  locale?: string;
  requestId: string;
  brandId: string;
  logger: FastifyBaseLogger;
};

type ResolveLocationOutput = {
  query: string;
  candidates: GeocodeCandidate[];
  providerChain: string[];
  providerUsed: string;
  cached: boolean;
  elapsedMs: number;
  code?: "GEO_NO_RESULTS";
};

type ReverseLocationOutput = {
  result: ReverseGeocodeResult;
  providerChain: string[];
  providerUsed: string;
  cached: boolean;
  elapsedMs: number;
  code?: "GEO_NO_RESULTS";
};

const GEO_CACHE_MAX = Number(process.env.GEO_CACHE_MAX ?? 1_000);
const GEO_CACHE_TTL_SECONDS = Number(process.env.GEO_CACHE_TTL_SECONDS ?? 7 * 24 * 60 * 60);
const GEO_FALLBACK_ON_EMPTY_RESULTS = process.env.GEO_FALLBACK_ON_EMPTY_RESULTS === "1";
const NOMINATIM_GLOBAL_RPS = Math.max(1, Number(process.env.NOMINATIM_MAX_RPS ?? 1));

const clamp01 = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
};

export const normalizeGeoQuery = (value: string): string => value.trim().replace(/\s+/g, " ").toLowerCase();

const sanitizeLocale = (value: string | undefined): string | undefined => {
  if (!value) return undefined;
  const first = value.split(",")[0]?.trim().toLowerCase();
  return first || undefined;
};

export const roundCoordinate = (value: number, decimals = 4): number => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

export const buildForwardCacheKey = (providerId: string, query: string, locale: string | undefined, limit: number) =>
  `geo:forward:${providerId}:${normalizeGeoQuery(query)}:${locale ?? ""}:${limit}`;

export const buildReverseCacheKey = (providerId: string, lat: number, lon: number, locale: string | undefined) =>
  `geo:reverse:${providerId}:${roundCoordinate(lat)}:${roundCoordinate(lon)}:${locale ?? ""}`;

const toTimezone = (lat: number, lon: number): string => {
  try {
    return resolveTimezoneFromLatLon(lat, lon);
  } catch {
    throw new ApiError("GEO_PROVIDER_REQUEST_FAILED", "Failed to infer timezone for coordinates.", {
      statusCode: 502
    });
  }
};

class ProviderRequestError extends Error {
  providerId: string;
  statusCode?: number;
  retryable: boolean;
  type: "network" | "timeout" | "http" | "parse";

  constructor(
    providerId: string,
    message: string,
    options: {
      statusCode?: number;
      retryable?: boolean;
      type?: "network" | "timeout" | "http" | "parse";
    } = {}
  ) {
    super(message);
    this.name = "ProviderRequestError";
    this.providerId = providerId;
    this.statusCode = options.statusCode;
    this.retryable = options.retryable ?? false;
    this.type = options.type ?? "http";
  }
}

const fetchJson = async <T>(
  providerId: string,
  url: URL,
  options: {
    headers?: Record<string, string>;
    timeoutMs?: number;
  } = {}
): Promise<T> => {
  const timeoutMs = options.timeoutMs ?? 8_000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let response: Response;
    try {
      response = await fetch(url.toString(), {
        headers: options.headers,
        signal: controller.signal
      });
    } catch (error: any) {
      if (error?.name === "AbortError") {
        throw new ProviderRequestError(providerId, "Provider request timed out.", {
          retryable: true,
          type: "timeout"
        });
      }
      throw new ProviderRequestError(providerId, error?.message ?? "Network request failed.", {
        retryable: true,
        type: "network"
      });
    }

    if (!response.ok) {
      const statusCode = response.status;
      const body = await response.text().catch(() => "");
      throw new ProviderRequestError(
        providerId,
        `Provider request failed with status ${statusCode}${body ? `: ${body.slice(0, 180)}` : ""}`,
        {
          statusCode,
          retryable: statusCode >= 500,
          type: "http"
        }
      );
    }

    try {
      return (await response.json()) as T;
    } catch {
      throw new ProviderRequestError(providerId, "Provider response was not valid JSON.", {
        retryable: false,
        type: "parse"
      });
    }
  } finally {
    clearTimeout(timeout);
  }
};

class HybridGeoCache {
  private memory = new Map<string, { value: string; expiresAt: number }>();

  private redis = createCache();

  private redisConfigured = Boolean(process.env.REDIS_URL);

  private redisWarningLogged = false;

  private memoryWarningLogged = false;

  constructor(private readonly logger: FastifyBaseLogger) {}

  private touchMemory(key: string, serialized: string, ttlSeconds: number) {
    this.memory.delete(key);
    this.memory.set(key, {
      value: serialized,
      expiresAt: Date.now() + ttlSeconds * 1_000
    });
    if (this.memory.size > GEO_CACHE_MAX) {
      const oldest = this.memory.keys().next().value;
      if (oldest) this.memory.delete(oldest);
    }
  }

  private readMemory<T>(key: string): T | null {
    const hit = this.memory.get(key);
    if (!hit) return null;
    if (hit.expiresAt <= Date.now()) {
      this.memory.delete(key);
      return null;
    }
    this.memory.delete(key);
    this.memory.set(key, hit);
    try {
      return JSON.parse(hit.value) as T;
    } catch {
      this.memory.delete(key);
      return null;
    }
  }

  async get<T>(key: string): Promise<{ value: T; source: "redis" | "memory" } | null> {
    if (this.redisConfigured) {
      try {
        const raw = await this.redis.get(key);
        if (raw) {
          const parsed = JSON.parse(raw) as T;
          this.touchMemory(key, raw, GEO_CACHE_TTL_SECONDS);
          return { value: parsed, source: "redis" };
        }
      } catch (error) {
        if (!this.redisWarningLogged) {
          this.logger.warn({ err: error, key }, "Redis geo cache unavailable. Falling back to memory.");
          this.redisWarningLogged = true;
        }
      }
    } else if (!this.memoryWarningLogged) {
      this.logger.warn("REDIS_URL is not set. Using in-memory geo cache.");
      this.memoryWarningLogged = true;
    }

    const memoryValue = this.readMemory<T>(key);
    if (memoryValue) {
      return { value: memoryValue, source: "memory" };
    }
    return null;
  }

  async set<T>(key: string, value: T, ttlSeconds = GEO_CACHE_TTL_SECONDS): Promise<void> {
    const serialized = JSON.stringify(value);
    this.touchMemory(key, serialized, ttlSeconds);

    if (!this.redisConfigured) return;
    try {
      await this.redis.set(key, serialized, ttlSeconds);
    } catch (error) {
      if (!this.redisWarningLogged) {
        this.logger.warn({ err: error, key }, "Failed writing geo cache to Redis. Continuing with memory cache.");
        this.redisWarningLogged = true;
      }
    }
  }

  reset() {
    this.memory.clear();
  }
}

class PerSecondLimiter {
  private windowStart = 0;

  private count = 0;

  consumeOrDelay(maxPerSecond: number): number {
    const now = Date.now();
    const nowWindow = Math.floor(now / 1_000);
    if (nowWindow !== this.windowStart) {
      this.windowStart = nowWindow;
      this.count = 0;
    }
    if (this.count >= maxPerSecond) {
      return (this.windowStart + 1) * 1_000 - now;
    }
    this.count += 1;
    return 0;
  }

  reset() {
    this.windowStart = 0;
    this.count = 0;
  }
}

type MapboxFeature = {
  id: string;
  text?: string;
  place_name?: string;
  center?: [number, number];
  relevance?: number;
  place_type?: string[];
  context?: Array<{
    id?: string;
    text?: string;
    short_code?: string;
  }>;
  properties?: {
    short_code?: string;
  };
};

type MapboxResponse = {
  features?: MapboxFeature[];
};

const mapboxCandidate = (feature: MapboxFeature): GeocodeCandidate | null => {
  const latRaw = feature.center?.[1];
  const lonRaw = feature.center?.[0];
  if (!Number.isFinite(latRaw) || !Number.isFinite(lonRaw)) return null;
  const lat = Number(latRaw);
  const lon = Number(lonRaw);

  const context = feature.context ?? [];
  const countryCtx = context.find((entry) => entry.id?.startsWith("country."));
  const regionCtx = context.find((entry) => entry.id?.startsWith("region."));
  const placeCtx = context.find((entry) =>
    entry.id?.startsWith("place.") || entry.id?.startsWith("locality.")
  );
  const countryCodeRaw = feature.properties?.short_code ?? countryCtx?.short_code;
  const countryCode = countryCodeRaw ? countryCodeRaw.toUpperCase().split("-")[0] : undefined;
  const region = regionCtx?.text;
  const city = feature.text ?? placeCtx?.text;

  return {
    label: feature.place_name ?? city ?? `${lat}, ${lon}`,
    lat,
    lon,
    countryCode,
    region,
    city,
    confidence: clamp01(feature.relevance ?? 0),
    provider: "mapbox",
    timezone: toTimezone(lat, lon)
  };
};

type OpenCageResponse = {
  results?: OpenCageResult[];
};

type OpenCageResult = {
  formatted?: string;
  confidence?: number;
  geometry?: {
    lat?: number;
    lng?: number;
  };
  components?: {
    country_code?: string;
    state?: string;
    city?: string;
    town?: string;
    village?: string;
    county?: string;
  };
};

const openCageCandidate = (item: OpenCageResult): GeocodeCandidate | null => {
  const latRaw = item.geometry?.lat;
  const lonRaw = item.geometry?.lng;
  if (!Number.isFinite(latRaw) || !Number.isFinite(lonRaw)) return null;
  const lat = Number(latRaw);
  const lon = Number(lonRaw);
  return {
    label: item.formatted ?? `${lat}, ${lon}`,
    lat,
    lon,
    countryCode: item.components?.country_code?.toUpperCase(),
    region: item.components?.state ?? item.components?.county,
    city: item.components?.city ?? item.components?.town ?? item.components?.village,
    confidence: clamp01((item.confidence ?? 0) / 10),
    provider: "opencage",
    timezone: toTimezone(lat, lon)
  };
};

type NominatimAddress = {
  city?: string;
  town?: string;
  village?: string;
  hamlet?: string;
  county?: string;
  state?: string;
  country?: string;
  country_code?: string;
};

type NominatimItem = {
  place_id?: string | number;
  display_name?: string;
  lat?: string | number;
  lon?: string | number;
  address?: NominatimAddress;
  importance?: number;
};

const nominatimLabel = (item: NominatimItem): { label: string; city?: string; region?: string } => {
  const address = item.address ?? {};
  const city = address.city ?? address.town ?? address.village ?? address.hamlet;
  const region = address.state ?? address.county;
  const country = address.country;
  const base = city ?? region ?? country ?? item.display_name ?? "Unknown location";
  const extras = [region, country].filter(Boolean).join(", ");
  const label = extras && base !== extras ? `${base}, ${extras}` : base;
  return { label, city, region };
};

const nominatimCandidate = (item: NominatimItem): GeocodeCandidate | null => {
  const lat = Number(item.lat);
  const lon = Number(item.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const { label, city, region } = nominatimLabel(item);
  return {
    label,
    lat,
    lon,
    countryCode: item.address?.country_code?.toUpperCase(),
    region,
    city,
    confidence: clamp01(item.importance ?? 0),
    provider: "nominatim",
    timezone: toTimezone(lat, lon)
  };
};

const nominatimReverse = (item: NominatimItem): ReverseGeocodeResult | null => {
  const lat = Number(item.lat);
  const lon = Number(item.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const { label, city, region } = nominatimLabel(item);
  return {
    label,
    lat,
    lon,
    timezone: toTimezone(lat, lon),
    provider: "nominatim",
    countryCode: item.address?.country_code?.toUpperCase(),
    region,
    city
  };
};

class MapboxProvider implements GeocodeProvider {
  readonly id = "mapbox";

  constructor(private readonly token: string) {}

  isConfigured() {
    return Boolean(this.token);
  }

  async forward(query: string, limit: number, locale?: string): Promise<GeocodeCandidate[]> {
    const url = new URL(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json`);
    url.searchParams.set("access_token", this.token);
    url.searchParams.set("autocomplete", "true");
    url.searchParams.set("limit", String(limit));
    if (locale) url.searchParams.set("language", locale);
    const json = await fetchJson<MapboxResponse>(this.id, url);
    return (json.features ?? []).map(mapboxCandidate).filter((item): item is GeocodeCandidate => Boolean(item));
  }

  async reverse(lat: number, lon: number, locale?: string): Promise<ReverseGeocodeResult | null> {
    const url = new URL(`https://api.mapbox.com/geocoding/v5/mapbox.places/${lon},${lat}.json`);
    url.searchParams.set("access_token", this.token);
    url.searchParams.set("limit", "1");
    if (locale) url.searchParams.set("language", locale);
    const json = await fetchJson<MapboxResponse>(this.id, url);
    const candidate = (json.features ?? []).map(mapboxCandidate).find(Boolean);
    if (!candidate) return null;
    return {
      label: candidate.label,
      lat: candidate.lat,
      lon: candidate.lon,
      timezone: candidate.timezone,
      provider: candidate.provider,
      countryCode: candidate.countryCode,
      region: candidate.region,
      city: candidate.city
    };
  }
}

class OpenCageProvider implements GeocodeProvider {
  readonly id = "opencage";

  constructor(private readonly key: string) {}

  isConfigured() {
    return Boolean(this.key);
  }

  async forward(query: string, limit: number, locale?: string): Promise<GeocodeCandidate[]> {
    const url = new URL("https://api.opencagedata.com/geocode/v1/json");
    url.searchParams.set("key", this.key);
    url.searchParams.set("q", query);
    url.searchParams.set("limit", String(limit));
    if (locale) url.searchParams.set("language", locale);
    const json = await fetchJson<OpenCageResponse>(this.id, url);
    return (json.results ?? [])
      .map(openCageCandidate)
      .filter((item): item is GeocodeCandidate => Boolean(item));
  }

  async reverse(lat: number, lon: number, locale?: string): Promise<ReverseGeocodeResult | null> {
    const url = new URL("https://api.opencagedata.com/geocode/v1/json");
    url.searchParams.set("key", this.key);
    url.searchParams.set("q", `${lat},${lon}`);
    url.searchParams.set("limit", "1");
    if (locale) url.searchParams.set("language", locale);
    const json = await fetchJson<OpenCageResponse>(this.id, url);
    const candidate = (json.results ?? []).map(openCageCandidate).find(Boolean);
    if (!candidate) return null;
    return {
      label: candidate.label,
      lat: candidate.lat,
      lon: candidate.lon,
      timezone: candidate.timezone,
      provider: candidate.provider,
      countryCode: candidate.countryCode,
      region: candidate.region,
      city: candidate.city
    };
  }
}

class NominatimProvider implements GeocodeProvider {
  readonly id = "nominatim";

  constructor(
    private readonly baseUrl: string,
    private readonly userAgent: string,
    private readonly contactEmail: string,
    private readonly limiter: PerSecondLimiter
  ) {}

  isConfigured() {
    return Boolean(this.userAgent && this.contactEmail);
  }

  private headers(locale?: string) {
    const acceptLanguage = sanitizeLocale(locale);
    return {
      "User-Agent": `${this.userAgent} (${this.contactEmail})`,
      ...(acceptLanguage ? { "Accept-Language": acceptLanguage } : {})
    };
  }

  private async enforceUsagePolicy() {
    const waitMs = this.limiter.consumeOrDelay(NOMINATIM_GLOBAL_RPS);
    if (waitMs <= 0) return;

    await new Promise((resolve) => setTimeout(resolve, waitMs + 5));
    const retryDelayMs = this.limiter.consumeOrDelay(NOMINATIM_GLOBAL_RPS);
    if (retryDelayMs > 0) {
      throw new ProviderRequestError(this.id, "Nominatim usage limit reached. Retry in 1 second.", {
        statusCode: 429,
        retryable: false,
        type: "http"
      });
    }
  }

  async forward(query: string, limit: number, locale?: string): Promise<GeocodeCandidate[]> {
    await this.enforceUsagePolicy();
    const url = new URL("/search", this.baseUrl);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("q", query);
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("email", this.contactEmail);
    const json = await fetchJson<NominatimItem[]>(this.id, url, {
      headers: this.headers(locale)
    });
    return (json ?? []).map(nominatimCandidate).filter((item): item is GeocodeCandidate => Boolean(item));
  }

  async reverse(lat: number, lon: number, locale?: string): Promise<ReverseGeocodeResult | null> {
    await this.enforceUsagePolicy();
    const url = new URL("/reverse", this.baseUrl);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("lat", String(lat));
    url.searchParams.set("lon", String(lon));
    url.searchParams.set("email", this.contactEmail);
    const json = await fetchJson<NominatimItem>(this.id, url, {
      headers: this.headers(locale)
    });
    return nominatimReverse(json);
  }
}

type ProviderEnv = {
  mapboxToken?: string;
  openCageKey?: string;
  allowNominatimInProd: boolean;
  nominatimUserAgent?: string;
  nominatimContactEmail?: string;
  nominatimBaseUrl: string;
};

const resolveProviderEnv = (): ProviderEnv => ({
  mapboxToken: process.env.MAPBOX_TOKEN,
  openCageKey: process.env.OPENCAGE_KEY,
  allowNominatimInProd: process.env.GEO_PROVIDER_ALLOW_NOMINATIM_IN_PROD === "1" ||
    process.env.GEO_PROVIDER_ALLOW_NOMINATIM_IN_PROD === "true",
  nominatimUserAgent: process.env.NOMINATIM_USER_AGENT ?? process.env.GEO_USER_AGENT,
  nominatimContactEmail: process.env.NOMINATIM_CONTACT_EMAIL ?? process.env.GEO_EMAIL,
  nominatimBaseUrl: process.env.NOMINATIM_BASE_URL ?? process.env.GEO_API_BASE ?? "https://nominatim.openstreetmap.org"
});

const providerDiagnostics = (logger: FastifyBaseLogger) => {
  const env = resolveProviderEnv();
  const isProduction = process.env.NODE_ENV === "production";
  const limiter = new PerSecondLimiter();

  const mapbox = new MapboxProvider(env.mapboxToken ?? "");
  const openCage = new OpenCageProvider(env.openCageKey ?? "");

  const hasNominatimEnv = Boolean(env.nominatimUserAgent && env.nominatimContactEmail);
  const nominatimUserAgent = env.nominatimUserAgent ?? (!isProduction ? "astro-multibrand-dev/1.0" : "");
  const nominatimContactEmail = env.nominatimContactEmail ?? (!isProduction ? "you@domain.com" : "");
  const nominatim = new NominatimProvider(env.nominatimBaseUrl, nominatimUserAgent, nominatimContactEmail, limiter);

  if (!hasNominatimEnv && !isProduction) {
    logger.warn(
      "NOMINATIM_USER_AGENT/NOMINATIM_CONTACT_EMAIL are not set. Using development defaults for Nominatim."
    );
  }

  const nominatimEnabled = nominatim.isConfigured() && (!isProduction || env.allowNominatimInProd);

  const providers: ProviderRegistryEntry[] = [
    {
      id: "mapbox",
      provider: mapbox,
      configured: mapbox.isConfigured(),
      enabled: mapbox.isConfigured(),
      missingEnv: mapbox.isConfigured() ? [] : ["MAPBOX_TOKEN"]
    },
    {
      id: "opencage",
      provider: openCage,
      configured: openCage.isConfigured(),
      enabled: openCage.isConfigured(),
      missingEnv: openCage.isConfigured() ? [] : ["OPENCAGE_KEY"]
    },
    {
      id: "nominatim",
      provider: nominatim,
      configured: nominatim.isConfigured(),
      enabled: nominatimEnabled,
      missingEnv: [
        ...(env.nominatimUserAgent ? [] : ["NOMINATIM_USER_AGENT"]),
        ...(env.nominatimContactEmail ? [] : ["NOMINATIM_CONTACT_EMAIL"]),
        ...(isProduction && !env.allowNominatimInProd ? ["GEO_PROVIDER_ALLOW_NOMINATIM_IN_PROD"] : [])
      ]
    }
  ];

  return providers;
};

const legacyDescription = (candidate: GeocodeCandidate): string | undefined => {
  const parts = [candidate.city, candidate.region, candidate.countryCode].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : undefined;
};

export const toLegacyGeoCandidate = (candidate: GeocodeCandidate): LegacyGeoCandidate => ({
  id: `${candidate.provider}:${roundCoordinate(candidate.lat, 5)}:${roundCoordinate(candidate.lon, 5)}:${normalizeGeoQuery(
    candidate.label
  )}`,
  name: candidate.label,
  description: legacyDescription(candidate),
  lat: candidate.lat,
  lon: candidate.lon,
  timezone: candidate.timezone,
  countryCode: candidate.countryCode
});

class GeoService {
  private cache: HybridGeoCache;

  private registry: ProviderRegistryEntry[];

  constructor(logger: FastifyBaseLogger) {
    this.cache = new HybridGeoCache(logger);
    this.registry = providerDiagnostics(logger);
  }

  private providerChain() {
    return this.registry.filter((entry) => entry.enabled).map((entry) => entry.provider);
  }

  diagnostics() {
    return this.registry.map((entry) => ({
      id: entry.id,
      configured: entry.configured,
      enabled: entry.enabled,
      missingEnv: entry.missingEnv
    }));
  }

  private async resolveProviderForward(
    provider: GeocodeProvider,
    query: string,
    limit: number,
    locale: string | undefined,
    ctx: ProviderCallContext
  ) {
    const started = Date.now();
    try {
      const candidates = await provider.forward(query, limit, locale);
      const elapsedMs = Date.now() - started;
      ctx.logger.info(
        {
          requestId: ctx.requestId,
          brandId: ctx.brandId,
          providerId: provider.id,
          elapsedMs,
          resultCount: candidates.length
        },
        "Geo provider forward lookup completed."
      );
      return { candidates, elapsedMs };
    } catch (error: any) {
      const wrapped =
        error instanceof ProviderRequestError
          ? error
          : new ProviderRequestError(provider.id, error?.message ?? "Provider request failed.", {
              retryable: false,
              type: "parse"
            });
      const elapsedMs = Date.now() - started;
      ctx.logger.warn(
        {
          requestId: ctx.requestId,
          brandId: ctx.brandId,
          providerId: provider.id,
          elapsedMs,
          statusCode: wrapped.statusCode,
          retryable: wrapped.retryable,
          errorType: wrapped.type,
          message: wrapped.message
        },
        "Geo provider forward lookup failed."
      );
      throw wrapped;
    }
  }

  private async resolveProviderReverse(
    provider: GeocodeProvider,
    lat: number,
    lon: number,
    locale: string | undefined,
    ctx: ProviderCallContext
  ) {
    const started = Date.now();
    try {
      const result = await provider.reverse(lat, lon, locale);
      const elapsedMs = Date.now() - started;
      ctx.logger.info(
        {
          requestId: ctx.requestId,
          brandId: ctx.brandId,
          providerId: provider.id,
          elapsedMs,
          hasResult: Boolean(result)
        },
        "Geo provider reverse lookup completed."
      );
      return { result, elapsedMs };
    } catch (error: any) {
      const wrapped =
        error instanceof ProviderRequestError
          ? error
          : new ProviderRequestError(provider.id, error?.message ?? "Provider request failed.", {
              retryable: false,
              type: "parse"
            });
      const elapsedMs = Date.now() - started;
      ctx.logger.warn(
        {
          requestId: ctx.requestId,
          brandId: ctx.brandId,
          providerId: provider.id,
          elapsedMs,
          statusCode: wrapped.statusCode,
          retryable: wrapped.retryable,
          errorType: wrapped.type,
          message: wrapped.message
        },
        "Geo provider reverse lookup failed."
      );
      throw wrapped;
    }
  }

  private toUnavailableError(errors: ProviderCallError[]) {
    return new ApiError("GEO_PROVIDER_UNAVAILABLE", "All configured geocoding providers failed.", {
      statusCode: 502,
      details: {
        attempts: errors
      },
      retryable: true
    });
  }

  private toProviderError(error: ProviderRequestError) {
    return new ApiError("GEO_PROVIDER_REQUEST_FAILED", error.message, {
      statusCode: error.statusCode && error.statusCode >= 400 ? error.statusCode : 502,
      details: {
        providerId: error.providerId,
        retryable: error.retryable,
        type: error.type
      },
      retryable: error.retryable
    });
  }

  async resolve(input: ResolveLocationInput): Promise<ResolveLocationOutput> {
    const started = Date.now();
    const locale = sanitizeLocale(input.locale);
    const query = input.query.trim();
    const providers = this.providerChain();
    if (providers.length === 0) {
      throw new ApiError("GEO_PROVIDER_UNAVAILABLE", "No geocoding providers are enabled.", {
        statusCode: 503
      });
    }

    const providerChain = providers.map((provider) => provider.id);
    for (const provider of providers) {
      const cacheKey = buildForwardCacheKey(provider.id, query, locale, input.limit);
      const cached = await this.cache.get<GeocodeCandidate[]>(cacheKey);
      if (cached) {
        return {
          query,
          candidates: cached.value,
          providerChain,
          providerUsed: provider.id,
          cached: true,
          elapsedMs: Date.now() - started
        };
      }
    }

    const errors: ProviderCallError[] = [];
    for (let index = 0; index < providers.length; index += 1) {
      const provider = providers[index];
      if (!provider) continue;
      const isLast = index === providers.length - 1;
      try {
        const call = await this.resolveProviderForward(provider, query, input.limit, locale, {
          requestId: input.requestId,
          brandId: input.brandId,
          logger: input.logger
        });
        const cacheKey = buildForwardCacheKey(provider.id, query, locale, input.limit);
        await this.cache.set(cacheKey, call.candidates);

        if (call.candidates.length === 0) {
          if (!isLast && GEO_FALLBACK_ON_EMPTY_RESULTS) {
            continue;
          }
          return {
            query,
            candidates: [],
            providerChain,
            providerUsed: provider.id,
            cached: false,
            elapsedMs: Date.now() - started,
            code: "GEO_NO_RESULTS"
          };
        }

        return {
          query,
          candidates: call.candidates,
          providerChain,
          providerUsed: provider.id,
          cached: false,
          elapsedMs: Date.now() - started
        };
      } catch (error) {
        if (!(error instanceof ProviderRequestError)) throw error;
        errors.push({
          providerId: error.providerId,
          message: error.message,
          statusCode: error.statusCode,
          retryable: error.retryable,
          type: error.type
        });
        if (!error.retryable || isLast) {
          if (!error.retryable) {
            throw this.toProviderError(error);
          }
          throw this.toUnavailableError(errors);
        }
      }
    }

    throw this.toUnavailableError(errors);
  }

  async reverse(input: ReverseLocationInput): Promise<ReverseLocationOutput> {
    const started = Date.now();
    const locale = sanitizeLocale(input.locale);
    const providers = this.providerChain();
    if (providers.length === 0) {
      throw new ApiError("GEO_PROVIDER_UNAVAILABLE", "No geocoding providers are enabled.", {
        statusCode: 503
      });
    }

    const providerChain = providers.map((provider) => provider.id);
    for (const provider of providers) {
      const cacheKey = buildReverseCacheKey(provider.id, input.lat, input.lon, locale);
      const cached = await this.cache.get<ReverseGeocodeResult>(cacheKey);
      if (cached) {
        return {
          result: cached.value,
          providerChain,
          providerUsed: provider.id,
          cached: true,
          elapsedMs: Date.now() - started
        };
      }
    }

    const errors: ProviderCallError[] = [];
    for (let index = 0; index < providers.length; index += 1) {
      const provider = providers[index];
      if (!provider) continue;
      const isLast = index === providers.length - 1;
      try {
        const call = await this.resolveProviderReverse(provider, input.lat, input.lon, locale, {
          requestId: input.requestId,
          brandId: input.brandId,
          logger: input.logger
        });
        if (!call.result) {
          if (!isLast && GEO_FALLBACK_ON_EMPTY_RESULTS) {
            continue;
          }
          return {
            result: {
              label: `${roundCoordinate(input.lat, 4)}, ${roundCoordinate(input.lon, 4)}`,
              lat: input.lat,
              lon: input.lon,
              timezone: toTimezone(input.lat, input.lon),
              provider: provider.id
            },
            providerChain,
            providerUsed: provider.id,
            cached: false,
            elapsedMs: Date.now() - started,
            code: "GEO_NO_RESULTS"
          };
        }

        const cacheKey = buildReverseCacheKey(provider.id, input.lat, input.lon, locale);
        await this.cache.set(cacheKey, call.result);
        return {
          result: call.result,
          providerChain,
          providerUsed: provider.id,
          cached: false,
          elapsedMs: Date.now() - started
        };
      } catch (error) {
        if (!(error instanceof ProviderRequestError)) throw error;
        errors.push({
          providerId: error.providerId,
          message: error.message,
          statusCode: error.statusCode,
          retryable: error.retryable,
          type: error.type
        });
        if (!error.retryable || isLast) {
          if (!error.retryable) {
            throw this.toProviderError(error);
          }
          throw this.toUnavailableError(errors);
        }
      }
    }

    throw this.toUnavailableError(errors);
  }

  resetForTests() {
    this.cache.reset();
    const nominatim = this.registry.find((entry) => entry.id === "nominatim")?.provider;
    if (nominatim instanceof NominatimProvider) {
      (nominatim as any).limiter.reset();
    }
  }
}

let geoServiceSingleton: GeoService | null = null;

export const getGeoService = (logger: FastifyBaseLogger): GeoService => {
  if (!geoServiceSingleton) {
    geoServiceSingleton = new GeoService(logger);
  }
  return geoServiceSingleton;
};

export const getGeoProviderHealth = (logger: FastifyBaseLogger) => {
  return getGeoService(logger).diagnostics();
};

export const resetGeoForTests = () => {
  if (geoServiceSingleton) {
    geoServiceSingleton.resetForTests();
  }
  geoServiceSingleton = null;
};

export const geoInternals = {
  normalizeGeoQuery,
  buildForwardCacheKey,
  buildReverseCacheKey,
  roundCoordinate,
  mapboxCandidate,
  openCageCandidate,
  nominatimCandidate,
  nominatimReverse
};
