import {
  buildMinecraftMapTargetUrl,
  resolveMinecraftMapBaseUrl
} from "../../../lib/minecraft-map";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const proxyBasePath = "/mc-troup-map";

const shouldProxyMapRequest = (pathSegments: string[] | undefined) => {
  const suffix = pathSegments?.join("/") ?? "";
  return suffix.endsWith(".json");
};

const proxyRequest = async (
  request: Request,
  pathSegments: string[] | undefined
) => {
  const requestUrl = new URL(request.url);
  const upstreamBaseUrl = resolveMinecraftMapBaseUrl(
    process.env.NEXT_PUBLIC_MINECRAFT_MAP_URL,
    process.env.NEXT_PUBLIC_MINECRAFT_SERVER_ADDRESS
  );
  const suffix = pathSegments?.length ? `/${pathSegments.join("/")}` : "/";
  const target = buildMinecraftMapTargetUrl(
    `${proxyBasePath}${suffix}`,
    proxyBasePath,
    upstreamBaseUrl,
    requestUrl.search
  );

  if (!shouldProxyMapRequest(pathSegments)) {
    return Response.redirect(target, 307);
  }

  const upstream = await fetch(target, {
    method: request.method,
    headers: {
      accept: request.headers.get("accept") ?? "*/*",
      "accept-language": request.headers.get("accept-language") ?? "en-US,en;q=0.8",
      "user-agent":
        request.headers.get("user-agent") ??
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36"
    },
    redirect: "follow",
    cache: "no-store"
  });

  const headers = new Headers(upstream.headers);
  headers.delete("content-security-policy");
  headers.delete("content-security-policy-report-only");
  headers.delete("x-frame-options");
  headers.set("x-robots-tag", "noindex");
  headers.set("cache-control", "public, max-age=60");

  return new Response(upstream.body, {
    status: upstream.status,
    headers
  });
};

export async function GET(
  request: Request,
  context: { params: Promise<{ path?: string[] }> }
) {
  const { path } = await context.params;
  return proxyRequest(request, path);
}

export async function HEAD(
  request: Request,
  context: { params: Promise<{ path?: string[] }> }
) {
  const { path } = await context.params;
  return proxyRequest(request, path);
}
