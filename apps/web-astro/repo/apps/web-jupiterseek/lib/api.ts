import { brand } from "./brand";

export const API_BASE = "/api";

export class ApiRequestError extends Error {
  status: number;
  details: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.details = details;
  }
}

type ApiRequestOptions = {
  method?: "GET" | "POST" | "DELETE";
  token?: string | null;
  body?: unknown;
  signal?: AbortSignal;
};

const firstValidationMessage = (value: unknown): string | null => {
  if (!value || typeof value !== "object") return null;

  const maybeError = value as {
    formErrors?: unknown;
    fieldErrors?: Record<string, unknown>;
  };

  if (Array.isArray(maybeError.formErrors)) {
    const first = maybeError.formErrors.find((item) => typeof item === "string");
    if (typeof first === "string" && first) return first;
  }

  if (maybeError.fieldErrors && typeof maybeError.fieldErrors === "object") {
    for (const entry of Object.values(maybeError.fieldErrors)) {
      if (!Array.isArray(entry)) continue;
      const first = entry.find((item) => typeof item === "string");
      if (typeof first === "string" && first) return first;
    }
  }

  return null;
};

const readErrorMessage = (payload: any, fallback: string) => {
  if (!payload) return fallback;
  if (typeof payload.error === "string") return payload.error;
  const validationMessage = firstValidationMessage(payload.error) ?? firstValidationMessage(payload);
  if (validationMessage) return validationMessage;
  if (typeof payload.message === "string") return payload.message;
  return fallback;
};

export const apiRequest = async <T>(path: string, options: ApiRequestOptions = {}): Promise<T> => {
  const headers: Record<string, string> = {
    "X-Brand-Id": brand.id
  };

  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }

  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(`${API_BASE}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    signal: options.signal
  });

  let payload: any = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    throw new ApiRequestError(
      readErrorMessage(payload, `Request failed with status ${response.status}.`),
      response.status,
      payload
    );
  }

  return payload as T;
};
