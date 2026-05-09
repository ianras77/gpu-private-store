import { NextRequest, NextResponse } from "next/server";

const API_ROUTE_PREFIX = "/api/v1";
const internalApiBase = (process.env.API_INTERNAL_BASE_URL ?? "http://bat-api:8000").replace(/\/$/, "");

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function targetUrl(request: NextRequest): string {
  return `${internalApiBase}${request.nextUrl.pathname}${request.nextUrl.search}`;
}

function forwardHeaders(request: NextRequest): Headers {
  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("connection");
  headers.delete("content-length");
  return headers;
}

function responseHeaders(upstream: Response): Headers {
  const headers = new Headers(upstream.headers);
  headers.delete("connection");
  headers.delete("content-length");
  headers.delete("transfer-encoding");
  return headers;
}

async function proxy(request: NextRequest): Promise<NextResponse> {
  if (!request.nextUrl.pathname.startsWith(API_ROUTE_PREFIX)) {
    return NextResponse.json({ detail: "Unsupported proxy path" }, { status: 404 });
  }

  try {
    const body =
      request.method === "GET" || request.method === "HEAD" ? undefined : await request.arrayBuffer();
    const upstream = await fetch(targetUrl(request), {
      method: request.method,
      headers: forwardHeaders(request),
      body,
      cache: "no-store",
      redirect: "manual",
    });

    const responseBody = request.method === "HEAD" ? null : await upstream.arrayBuffer();
    return new NextResponse(responseBody, {
      status: upstream.status,
      headers: responseHeaders(upstream),
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "API proxy request failed";
    return NextResponse.json({ detail }, { status: 502 });
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  return proxy(request);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return proxy(request);
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  return proxy(request);
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  return proxy(request);
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  return proxy(request);
}

export async function HEAD(request: NextRequest): Promise<NextResponse> {
  return proxy(request);
}

export async function OPTIONS(request: NextRequest): Promise<NextResponse> {
  return proxy(request);
}
