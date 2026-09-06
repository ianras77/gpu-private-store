import { GET as streamGet, HEAD as streamHead } from "../api/radio/stream/route";

const withHires = (request: Request) => {
  const url = new URL(request.url);
  url.searchParams.set("quality", "hires");
  return new Request(url, request);
};

export const GET = (request: Request) => streamGet(withHires(request));
export const HEAD = (request: Request) => streamHead(withHires(request));
