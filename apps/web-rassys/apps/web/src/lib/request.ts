import { headers } from "next/headers";

export const getClientIp = async () => {
  const hdrs = await headers();
  const forwarded = hdrs.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return hdrs.get("x-real-ip") ?? "unknown";
};

const INTERNAL_HOST_PATTERNS = ["0.0.0.0", "127.0.0.1", "localhost"];

const isInternalHost = (host: string) => {
  const normalized = host.trim().toLowerCase();
  return INTERNAL_HOST_PATTERNS.some(
    (pattern) => normalized === pattern || normalized.startsWith(`${pattern}:`),
  );
};

export const getPublicBaseUrl = async (request?: Request) => {
  const hdrs = await headers();
  const forwardedHost = hdrs.get("x-forwarded-host")?.split(",")[0]?.trim();
  const forwardedProto = hdrs.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const envSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();

  if (forwardedHost) {
    const protocol =
      forwardedProto ||
      (envSiteUrl ? new URL(envSiteUrl).protocol.replace(/:$/, "") : "https");
    return `${protocol}://${forwardedHost}`;
  }

  if (request) {
    const requestUrl = new URL(request.url);
    if (!isInternalHost(requestUrl.host)) {
      return `${requestUrl.protocol}//${requestUrl.host}`;
    }
  }

  if (envSiteUrl) {
    return envSiteUrl.replace(/\/$/, "");
  }

  if (request) {
    const requestUrl = new URL(request.url);
    return `${requestUrl.protocol}//${requestUrl.host}`;
  }

  return "http://localhost:3000";
};
