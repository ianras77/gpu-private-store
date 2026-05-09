import "server-only";

type ParsedCatBody = {
  message: string;
  code: string | null;
};

function asObject(value: unknown) {
  if (!value || typeof value !== "object") return null;
  return value as Record<string, unknown>;
}

function pickMessage(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  const obj = asObject(value);
  if (!obj) return null;

  const nested = pickMessage(obj.detail) ?? pickMessage(obj.error) ?? pickMessage(obj.message);
  if (nested) return nested;

  return null;
}

function pickCode(value: unknown): string | null {
  const obj = asObject(value);
  if (!obj) return null;

  const candidate = obj.code ?? (asObject(obj.detail)?.code ?? null);
  return typeof candidate === "string" && candidate.trim() ? candidate.trim() : null;
}

function parseBody(raw: string): ParsedCatBody {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return {
      message: pickMessage(parsed) ?? raw,
      code: pickCode(parsed)
    };
  } catch {
    return {
      message: raw.trim() || "Cheshire Cat request failed",
      code: null
    };
  }
}

export class CatHttpError extends Error {
  status: number;
  body: string;
  code: string | null;
  clientMessage: string;

  constructor(status: number, body: string) {
    const parsed = parseBody(body);
    const message = parsed.message || `Cheshire Cat request failed (${status})`;
    super(message);
    this.name = "CatHttpError";
    this.status = status;
    this.body = body;
    this.code = parsed.code;
    this.clientMessage = message;
  }
}

export function isCatAuthError(error: unknown) {
  if (!(error instanceof CatHttpError)) return false;
  if (error.status === 401 || error.status === 403) return true;

  const normalized = `${error.clientMessage}\n${error.body}`.toLowerCase();
  return (
    normalized.includes("invalid credentials") ||
    normalized.includes("signature has expired") ||
    normalized.includes("could not auth user")
  );
}
