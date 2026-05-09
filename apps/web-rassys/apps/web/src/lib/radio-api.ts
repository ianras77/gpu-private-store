import { serverConfig } from "./server-config";
import { fetchUpstreamJson, type UpstreamFetchOptions } from "./upstream";

export const fetchRadio = async <T = any>(
  path: string,
  init?: RequestInit,
  options: UpstreamFetchOptions = {}
): Promise<T> => {
  const base = serverConfig.RADIO_CONTROLLER_URL.replace(/\/$/, "");
  return fetchUpstreamJson<T>(
    `${base}${path}`,
    {
      ...init,
      headers: {
        ...(init?.headers ?? {})
      }
    },
    {
      timeoutMs: Number(process.env.RADIO_UPSTREAM_TIMEOUT_MS ?? 7000),
      retries: Number(process.env.RADIO_UPSTREAM_RETRIES ?? 1),
      retryDelayMs: Number(process.env.RADIO_UPSTREAM_RETRY_DELAY_MS ?? 250),
      ...options
    }
  );
};
