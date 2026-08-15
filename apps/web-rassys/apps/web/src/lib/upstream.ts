export type UpstreamFetchOptions = {
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
};

export class UpstreamError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "UpstreamError";
    this.status = status;
  }
}

const sleep = async (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

const shouldRetryStatus = (status: number) => status === 408 || status === 425 || status === 429 || status >= 500;

const withTimeoutSignal = async <T>(
  timeoutMs: number,
  fn: (signal: AbortSignal) => Promise<T>
): Promise<T> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fn(controller.signal);
  } finally {
    clearTimeout(timeoutId);
  }
};

export const fetchUpstream = async (
  url: string,
  init: RequestInit = {},
  options: UpstreamFetchOptions = {}
): Promise<Response> => {
  const timeoutMs = Math.max(500, options.timeoutMs ?? 8000);
  const method = (init.method ?? "GET").toUpperCase();
  const isRetryableMethod = method === "GET" || method === "HEAD";
  const retries = Math.max(0, options.retries ?? (isRetryableMethod ? 1 : 0));
  const retryDelayMs = Math.max(0, options.retryDelayMs ?? 250);

  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await withTimeoutSignal(timeoutMs, (signal) =>
        fetch(url, {
          ...init,
          cache: "no-store",
          signal
        })
      );

      if (response.ok) return response;

      await response.text();
      const error = new UpstreamError(`upstream_error_${response.status}`, response.status);

      if (attempt < retries && shouldRetryStatus(response.status)) {
        await sleep(retryDelayMs * (attempt + 1));
        continue;
      }

      throw error;
    } catch (error) {
      const typedError =
        error instanceof Error ? error : new Error(typeof error === "string" ? error : "upstream_failed");
      lastError = typedError;
      if (attempt < retries) {
        await sleep(retryDelayMs * (attempt + 1));
        continue;
      }
      break;
    }
  }

  throw lastError ?? new Error("upstream_failed");
};

export const fetchUpstreamJson = async <T>(
  url: string,
  init: RequestInit = {},
  options: UpstreamFetchOptions = {}
): Promise<T> => {
  const response = await fetchUpstream(url, init, options);
  return (await response.json()) as T;
};
