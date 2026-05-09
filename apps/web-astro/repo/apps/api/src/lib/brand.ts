import { BRANDS } from "@astro/brands";
import type { IncomingHttpHeaders } from "node:http";

export type BrandId = keyof typeof BRANDS;

const BRAND_IDS = Object.keys(BRANDS) as BrandId[];
const BRAND_ID_SET = new Set<BrandId>(BRAND_IDS);
const DOMAIN_TO_BRAND = Object.values(BRANDS).reduce<Record<string, BrandId>>((acc, brand) => {
  acc[brand.domain.toLowerCase()] = brand.id;
  return acc;
}, {});

export const DEFAULT_BRAND_ID: BrandId = "jupiterseek";

const normalizeCandidate = (value: string): string => value.trim().toLowerCase().replace(/[^a-z0-9-]/g, "");

export const toBrandId = (value: unknown): BrandId | undefined => {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const candidate = normalizeCandidate(value);
  if (BRAND_ID_SET.has(candidate as BrandId)) {
    return candidate as BrandId;
  }
  return undefined;
};

export const inferBrandIdFromHost = (hostHeader: string | undefined): BrandId | undefined => {
  if (!hostHeader) return undefined;
  const host = hostHeader.split(",")[0]?.trim().toLowerCase();
  if (!host) return undefined;
  const hostname = host.split(":")[0];
  if (!hostname) return undefined;

  const labels = hostname.split(".").filter(Boolean);
  if (labels.length === 0) return undefined;

  const subdomain = labels[0];
  if (subdomain) {
    const direct = toBrandId(subdomain);
    if (direct) return direct;
    if (subdomain.startsWith("web-")) {
      const webBrand = toBrandId(subdomain.slice(4));
      if (webBrand) return webBrand;
    }
  }

  const domain = labels.slice(-2).join(".");
  if (DOMAIN_TO_BRAND[domain]) {
    return DOMAIN_TO_BRAND[domain];
  }

  return undefined;
};

export const inferBrandId = (headers: IncomingHttpHeaders): BrandId => {
  const headerValue = Array.isArray(headers["x-brand-id"]) ? headers["x-brand-id"][0] : headers["x-brand-id"];
  const fromHeader = toBrandId(headerValue);
  if (fromHeader) return fromHeader;

  const hostValue = Array.isArray(headers.host) ? headers.host[0] : headers.host;
  const fromHost = inferBrandIdFromHost(hostValue);
  if (fromHost) return fromHost;

  return DEFAULT_BRAND_ID;
};
