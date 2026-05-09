import { serverConfig } from "./server-config";

const requestHeaderAllowlist = ["range", "user-agent", "accept"];
const responseHeaderAllowlist = [
  "content-type",
  "content-length",
  "accept-ranges",
  "content-range",
  "cache-control",
  "expires",
  "pragma",
  "etag",
  "last-modified"
];

const copyHeaders = (source: Headers, target: Headers, names: string[]) => {
  for (const name of names) {
    const value = source.get(name);
    if (!value) continue;
    target.set(name, value);
  }
};

export const proxyControllerMedia = async (
  request: Request,
  upstreamPath: string,
  options: { timeoutMs?: number } = {}
) => {
  const upstreamHeaders = new Headers();
  copyHeaders(request.headers, upstreamHeaders, requestHeaderAllowlist);

  const timeoutMs = Math.max(1000, options.timeoutMs ?? 12000);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const onClientAbort = () => controller.abort();
  request.signal.addEventListener("abort", onClientAbort, { once: true });

  try {
    const base = serverConfig.RADIO_CONTROLLER_URL.replace(/\/$/, "");
    const upstreamResponse = await fetch(`${base}${upstreamPath}`, {
      method: request.method,
      headers: upstreamHeaders,
      cache: "no-store",
      redirect: "follow",
      signal: controller.signal
    });

    const headers = new Headers();
    copyHeaders(upstreamResponse.headers, headers, responseHeaderAllowlist);
    headers.set("Access-Control-Allow-Origin", "*");
    headers.set("X-Robots-Tag", "noindex");
    headers.set("Cache-Control", headers.get("cache-control") || "no-store");

    if (request.method === "HEAD") {
      upstreamResponse.body?.cancel();
      return new Response(null, {
        status: upstreamResponse.status,
        headers
      });
    }

    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      headers
    });
  } catch {
    return new Response("media_unavailable", {
      status: 502,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*"
      }
    });
  } finally {
    clearTimeout(timeoutId);
    request.signal.removeEventListener("abort", onClientAbort);
  }
};
