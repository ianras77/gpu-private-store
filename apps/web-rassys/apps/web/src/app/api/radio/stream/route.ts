const mp3UpstreamStreamUrl =
  process.env.STREAM_PROXY_URL ||
  process.env.STREAM_HEALTHCHECK_URL ||
  process.env.STREAM_URL ||
  process.env.NEXT_PUBLIC_STREAM_URL ||
  "http://icecast:8000/live.mp3";

const losslessUpstreamStreamUrl =
  process.env.STREAM_LOSSLESS_PROXY_URL ||
  process.env.STREAM_LOSSLESS_URL ||
  process.env.NEXT_PUBLIC_STREAM_LOSSLESS_URL ||
  "http://icecast:8000/live-lossless.ogg";

const requestHeaderAllowlist = ["range", "icy-metadata", "user-agent"];
const responseHeaderAllowlist = [
  "content-type",
  "content-length",
  "accept-ranges",
  "content-range",
  "cache-control",
  "expires",
  "pragma",
  "icy-br",
  "icy-description",
  "icy-genre",
  "icy-metaint",
  "icy-name",
  "icy-pub",
  "icy-url"
];

const copyHeaders = (source: Headers, target: Headers, names: string[]) => {
  for (const name of names) {
    const value = source.get(name);
    if (!value) continue;
    target.set(name, value);
  }
};

const resolveUpstreamStreamUrl = (request: Request) => {
  const url = new URL(request.url);
  const quality = url.searchParams.get("quality")?.toLowerCase();
  return quality === "lossless" ? losslessUpstreamStreamUrl : mp3UpstreamStreamUrl;
};

const proxyStream = async (request: Request, method: "GET" | "HEAD") => {
  const upstreamHeaders = new Headers();
  copyHeaders(request.headers, upstreamHeaders, requestHeaderAllowlist);
  const upstreamStreamUrl = resolveUpstreamStreamUrl(request);
  const quality =
    new URL(request.url).searchParams.get("quality")?.toLowerCase() === "lossless"
      ? "lossless"
      : "mp3";

  const timeoutMs = Number(process.env.STREAM_PROXY_TIMEOUT_MS ?? 10000);
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const armTimeout = () => {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => controller.abort(), Math.max(1000, timeoutMs));
  };
  const disarmTimeout = () => {
    if (!timeoutId) return;
    clearTimeout(timeoutId);
    timeoutId = null;
  };
  const onClientAbort = () => controller.abort();
  request.signal.addEventListener("abort", onClientAbort, { once: true });

  try {
    armTimeout();
    let upstreamResponse = await fetch(upstreamStreamUrl, {
      method,
      headers: upstreamHeaders,
      cache: "no-store",
      redirect: "follow",
      signal: controller.signal
    });
    disarmTimeout();

    if (method === "HEAD" && !upstreamResponse.ok) {
      upstreamResponse.body?.cancel();
      const fallbackHeaders = new Headers(upstreamHeaders);
      fallbackHeaders.set("range", "bytes=0-0");
      armTimeout();
      upstreamResponse = await fetch(upstreamStreamUrl, {
        method: "GET",
        headers: fallbackHeaders,
        cache: "no-store",
        redirect: "follow",
        signal: controller.signal
      });
      disarmTimeout();
    }

    const headers = new Headers();
    copyHeaders(upstreamResponse.headers, headers, responseHeaderAllowlist);
    headers.set("X-Robots-Tag", "noindex");
    headers.set("X-Accel-Buffering", "no");
    headers.set("Access-Control-Allow-Origin", "*");
    headers.set("Cache-Control", "no-store");
    headers.set("X-Rassy-Quality", quality);

    if (method === "HEAD") {
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
    return new Response("stream_unavailable", {
      status: 502,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*"
      }
    });
  } finally {
    disarmTimeout();
    request.signal.removeEventListener("abort", onClientAbort);
  }
};

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return proxyStream(request, "GET");
}

export async function HEAD(request: Request) {
  return proxyStream(request, "HEAD");
}
