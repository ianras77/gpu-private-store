import { GET as streamGet, HEAD as streamHead } from "../api/radio/stream/route";

const withLossless = (request: Request) => {
  const url = new URL(request.url);
  url.searchParams.set("quality", "lossless");
  return new Request(url, request);
};

export const GET = (request: Request) => streamGet(withLossless(request));
export const HEAD = (request: Request) => streamHead(withLossless(request));
