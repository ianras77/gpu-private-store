import { serverConfig } from "./server-config";
import { fetchUpstreamJson } from "./upstream";

export const callAdmin = async (path: string, body?: any) => {
  const base = serverConfig.RADIO_CONTROLLER_URL.replace(/\/$/, "");
  return fetchUpstreamJson(`${base}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-admin-key": serverConfig.RADIO_ADMIN_API_KEY
    },
    body: body ? JSON.stringify(body) : undefined
  }, {
    timeoutMs: Number(process.env.ADMIN_UPSTREAM_TIMEOUT_MS ?? 7000),
    retries: Number(process.env.ADMIN_UPSTREAM_RETRIES ?? 1),
    retryDelayMs: Number(process.env.ADMIN_UPSTREAM_RETRY_DELAY_MS ?? 250)
  });
};
