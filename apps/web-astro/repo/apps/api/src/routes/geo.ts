import type { FastifyInstance } from "fastify";
import {
  GeoResolveInput,
  GeoResolveResponseSchema,
  GeoReverseInput,
  GeoReverseResponseSchema
} from "../lib/validators";
import { getGeoService, toLegacyGeoCandidate } from "../lib/geo";
import { ApiError, sendApiError } from "../lib/http-errors";
import { enforceRateLimit } from "../lib/rate-limit";

const parseLocale = (request: { headers: Record<string, unknown> }, explicit?: string) => {
  if (explicit) return explicit;
  const language = request.headers["accept-language"];
  if (typeof language === "string") return language;
  if (Array.isArray(language)) return language.join(",");
  return undefined;
};

export const geoRoutes = async (app: FastifyInstance) => {
  app.post("/resolve", async (request, reply) => {
    const limited = await enforceRateLimit({
      request,
      reply,
      scope: "geo",
      max: Number(process.env.GEO_RATE_LIMIT_MAX ?? 90),
      windowMs: Number(process.env.GEO_RATE_LIMIT_WINDOW_MS ?? 60_000)
    });
    if (limited) return limited;

    const parsed = GeoResolveInput.safeParse(request.body);
    if (!parsed.success) {
      return sendApiError(
        reply,
        request.id,
        new ApiError("BAD_REQUEST", "Invalid geo resolve payload.", {
          statusCode: 400,
          issues: parsed.error.issues
        }),
        request.log
      );
    }

    const service = getGeoService(app.log);

    try {
      const resolved = await service.resolve({
        query: parsed.data.query,
        limit: parsed.data.limit ?? 5,
        locale: parseLocale(request, parsed.data.locale),
        requestId: request.id,
        brandId: request.brandId,
        logger: request.log
      });

      const payload = {
        brandId: request.brandId,
        query: resolved.query,
        candidates: resolved.candidates,
        // Compatibility for existing web/mobile clients.
        results: resolved.candidates.map(toLegacyGeoCandidate),
        meta: {
          providerChain: resolved.providerChain,
          providerUsed: resolved.providerUsed,
          cached: resolved.cached,
          requestId: request.id,
          elapsedMs: resolved.elapsedMs,
          ...(resolved.code ? { code: resolved.code } : {})
        }
      };

      const output = GeoResolveResponseSchema.safeParse(payload);
      if (!output.success) {
        throw new ApiError("INTERNAL_SERVER_ERROR", "Invalid geo resolve response generated.", {
          statusCode: 500,
          details: { issues: output.error.issues }
        });
      }

      request.log.info(
        {
          requestId: request.id,
          brandId: request.brandId,
          route: "/v1/geo/resolve",
          providerUsed: resolved.providerUsed,
          elapsedMs: resolved.elapsedMs,
          cached: resolved.cached,
          errorCode: resolved.code
        },
        "Geo resolve completed."
      );

      return output.data;
    } catch (error) {
      return sendApiError(reply, request.id, error, request.log);
    }
  });

  app.post("/reverse", async (request, reply) => {
    const limited = await enforceRateLimit({
      request,
      reply,
      scope: "geo",
      max: Number(process.env.GEO_RATE_LIMIT_MAX ?? 90),
      windowMs: Number(process.env.GEO_RATE_LIMIT_WINDOW_MS ?? 60_000)
    });
    if (limited) return limited;

    const parsed = GeoReverseInput.safeParse(request.body);
    if (!parsed.success) {
      return sendApiError(
        reply,
        request.id,
        new ApiError("BAD_REQUEST", "Invalid geo reverse payload.", {
          statusCode: 400,
          issues: parsed.error.issues
        }),
        request.log
      );
    }

    const service = getGeoService(app.log);

    try {
      const resolved = await service.reverse({
        lat: parsed.data.lat,
        lon: parsed.data.lon,
        locale: parseLocale(request, parsed.data.locale),
        requestId: request.id,
        brandId: request.brandId,
        logger: request.log
      });

      const payload = {
        result: resolved.result,
        meta: {
          providerChain: resolved.providerChain,
          providerUsed: resolved.providerUsed,
          cached: resolved.cached,
          requestId: request.id,
          elapsedMs: resolved.elapsedMs,
          ...(resolved.code ? { code: resolved.code } : {})
        }
      };

      const output = GeoReverseResponseSchema.safeParse(payload);
      if (!output.success) {
        throw new ApiError("INTERNAL_SERVER_ERROR", "Invalid geo reverse response generated.", {
          statusCode: 500,
          details: { issues: output.error.issues }
        });
      }

      request.log.info(
        {
          requestId: request.id,
          brandId: request.brandId,
          route: "/v1/geo/reverse",
          providerUsed: resolved.providerUsed,
          elapsedMs: resolved.elapsedMs,
          cached: resolved.cached,
          errorCode: resolved.code
        },
        "Geo reverse completed."
      );

      return output.data;
    } catch (error) {
      return sendApiError(reply, request.id, error, request.log);
    }
  });
};
