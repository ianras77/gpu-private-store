const DEFAULT_PUBLIC_MAP_PATH = "/mc-troupe-map";
const PRIVATE_HOST_SUFFIXES = [".internal", ".lan", ".local", ".localdomain", ".home"];
const PRIVATE_IPV4_PATTERNS = [
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./
];

const normalizePath = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return DEFAULT_PUBLIC_MAP_PATH;
  const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return withLeadingSlash.replace(/\/+$/, "") || DEFAULT_PUBLIC_MAP_PATH;
};

export const normalizeMinecraftServerHost = (serverHost?: string) => {
  const trimmed = serverHost?.trim() ?? "";
  return trimmed || "crafty.rasies.com:25565";
};

export const extractMinecraftHostname = (serverHost?: string) => {
  const trimmed = normalizeMinecraftServerHost(serverHost);

  if (trimmed.startsWith("[")) {
    const end = trimmed.indexOf("]");
    return end >= 0 ? trimmed.slice(1, end) : trimmed.slice(1);
  }

  return trimmed.split(":", 1)[0] ?? trimmed;
};

export const isPrivateMinecraftHostname = (value: string) => {
  const hostname = value.trim().replace(/^\[|\]$/g, "").toLowerCase();
  if (!hostname) return true;

  if (hostname === "localhost" || hostname === "::1") return true;
  if (PRIVATE_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix))) return true;
  if (PRIVATE_IPV4_PATTERNS.some((pattern) => pattern.test(hostname))) return true;
  if (/^(fc|fd)[0-9a-f:]+$/i.test(hostname)) return true;
  if (/^fe80:/i.test(hostname)) return true;
  if (!hostname.includes(".") && !hostname.includes(":")) return true;

  return false;
};

export const derivePublicMinecraftMapUrl = (
  serverHost?: string,
  pathname = DEFAULT_PUBLIC_MAP_PATH
) => {
  const hostname = extractMinecraftHostname(serverHost) || "crafty.rasies.com";
  const url = new URL(`https://${hostname}`);
  url.pathname = `${normalizePath(pathname)}/`;
  return url.toString().replace(/\/$/, "");
};

export const resolveMinecraftMapBaseUrl = (
  configuredUrl?: string,
  serverHost?: string
) => {
  const trimmed = configuredUrl?.trim() ?? "";
  if (!trimmed) return derivePublicMinecraftMapUrl(serverHost);

  try {
    const url = new URL(trimmed);
    const normalizedPath = normalizePath(url.pathname || DEFAULT_PUBLIC_MAP_PATH);

    if (isPrivateMinecraftHostname(url.hostname)) {
      return derivePublicMinecraftMapUrl(serverHost, normalizedPath);
    }

    url.pathname = `${normalizedPath}/`;
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return derivePublicMinecraftMapUrl(serverHost);
  }
};

export const buildMinecraftMapTargetUrl = (
  requestPath: string,
  proxyBasePath: string,
  upstreamBaseUrl: string,
  search = ""
) => {
  const base = new URL(`${upstreamBaseUrl.replace(/\/$/, "")}/`);
  const suffix = requestPath.startsWith(proxyBasePath)
    ? requestPath.slice(proxyBasePath.length)
    : requestPath;

  if (!suffix || suffix === "/") {
    base.search = search;
    return base.toString();
  }

  const target = new URL(suffix.replace(/^\//, ""), base);
  target.search = search;
  return target.toString();
};
