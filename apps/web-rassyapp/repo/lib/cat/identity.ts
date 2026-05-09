import "server-only";

type JwtClaims = {
  sub: string | null;
  username: string | null;
  exp: number | null;
};

function decodeBase64UrlSegment(segment: string) {
  const normalized = segment.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return Buffer.from(`${normalized}${padding}`, "base64").toString("utf8");
}

function asNonEmptyString(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

export function parseJwtClaims(token?: string | null): JwtClaims {
  if (!token) {
    return { sub: null, username: null, exp: null };
  }

  const parts = token.split(".");
  if (parts.length < 2) {
    return { sub: null, username: null, exp: null };
  }

  try {
    const payload = JSON.parse(decodeBase64UrlSegment(parts[1])) as Record<string, unknown>;
    return {
      sub: asNonEmptyString(payload.sub),
      username: asNonEmptyString(payload.username),
      exp: typeof payload.exp === "number" && Number.isFinite(payload.exp) ? payload.exp : null
    };
  } catch {
    return { sub: null, username: null, exp: null };
  }
}
