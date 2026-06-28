export function getRequestOrigin(headers: Headers, requestUrl: string): string {
  const forwardedHost = headers.get("x-forwarded-host");
  const forwardedProto = headers.get("x-forwarded-proto") ?? "https";
  if (forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }

  const host = headers.get("host");
  if (host) {
    const protocol = new URL(requestUrl).protocol.replace(":", "");
    return `${protocol}://${host}`;
  }

  return new URL(requestUrl).origin;
}

export function redirectUrl(headers: Headers, requestUrl: string, path: string): URL {
  return new URL(path, getRequestOrigin(headers, requestUrl));
}
