import { NextResponse, type NextRequest } from "next/server";
import { buildHttpUrl } from "@/lib/cat/client";
import { getOrCreateWorkspace } from "@/lib/workspace/data";
import { handleCatRouteError, requireCatSession } from "@/lib/cat/route";

export const runtime = "nodejs";

const ALLOWED_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);

function buildPath(request: NextRequest) {
  const prefix = "/api/cat/proxy";
  const path = request.nextUrl.pathname.startsWith(prefix)
    ? request.nextUrl.pathname.slice(prefix.length)
    : "";
  const normalized = path || "/";
  return normalized.startsWith("/") ? normalized : `/${normalized}`;
}

async function buildForwardBody(request: NextRequest, headers: Headers) {
  if (request.method === "GET" || request.method === "HEAD") {
    return undefined;
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    return request.formData();
  }

  if (contentType) {
    headers.set("Content-Type", contentType);
  }

  if (contentType.includes("application/json")) {
    return request.text();
  }

  if (
    contentType.includes("text/") ||
    contentType.includes("application/x-www-form-urlencoded")
  ) {
    return request.text();
  }

  const bytes = await request.arrayBuffer();
  return Buffer.from(bytes);
}

async function handleProxy(request: NextRequest, params: { path?: string[] }) {
  const auth = await requireCatSession(request);
  if ("response" in auth) {
    return auth.response;
  }

  if (!ALLOWED_METHODS.has(request.method)) {
    return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
  }

  const path = buildPath(request);
  if (path === "/") {
    return NextResponse.json({ error: "Missing Cat path" }, { status: 400 });
  }

  const { workspace, member } = await getOrCreateWorkspace(auth.session.userId);
  const headers = new Headers();
  headers.set("Authorization", `Bearer ${auth.session.engineJwt}`);
  headers.set("user_id", auth.engineUserId);
  headers.set("x-console-workspace-id", workspace.id);
  headers.set("x-console-workspace-role", member.role);

  const body = await buildForwardBody(request, headers);
  const target = buildHttpUrl(`${path}${request.nextUrl.search}`);

  try {
    const response = await fetch(target, {
      method: request.method,
      headers,
      body
    });

    const responseHeaders = new Headers();
    const contentType = response.headers.get("content-type");
    if (contentType) {
      responseHeaders.set("Content-Type", contentType);
    }

    const payload = await response.arrayBuffer();
    return new Response(payload, {
      status: response.status,
      headers: responseHeaders
    });
  } catch (error) {
    return handleCatRouteError(error, auth.session);
  }
}

export async function GET(request: NextRequest, context: { params: { path: string[] } }) {
  return handleProxy(request, context.params);
}

export async function POST(request: NextRequest, context: { params: { path: string[] } }) {
  return handleProxy(request, context.params);
}

export async function PUT(request: NextRequest, context: { params: { path: string[] } }) {
  return handleProxy(request, context.params);
}

export async function PATCH(request: NextRequest, context: { params: { path: string[] } }) {
  return handleProxy(request, context.params);
}

export async function DELETE(request: NextRequest, context: { params: { path: string[] } }) {
  return handleProxy(request, context.params);
}
