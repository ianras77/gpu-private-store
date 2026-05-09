import { NextResponse, type NextRequest } from "next/server";
import { fetchJson } from "@/lib/cat/client";
import { handleCatRouteError, requireCatSession } from "@/lib/cat/route";

export async function GET(request: NextRequest, { params }: { params: { name: string } }) {
  const auth = await requireCatSession(request);
  if ("response" in auth) {
    return auth.response;
  }

  const collection = encodeURIComponent(params.name);
  try {
    const data = await fetchJson<Record<string, unknown>>(
      `/memory/collections/${collection}/points`,
      {
        method: "GET",
        token: auth.session.engineJwt,
        userId: auth.engineUserId,
        appUserId: auth.session.userId
      }
    );

    return NextResponse.json(data);
  } catch (error) {
    return handleCatRouteError(error, auth.session);
  }
}

export async function POST(request: NextRequest, { params }: { params: { name: string } }) {
  const auth = await requireCatSession(request);
  if ("response" in auth) {
    return auth.response;
  }

  const body = await request.json();
  const payload = {
    content: body?.content ?? body?.text ?? "",
    metadata: body?.metadata ?? {}
  };
  const collection = encodeURIComponent(params.name);
  try {
    const data = await fetchJson<Record<string, unknown>>(
      `/memory/collections/${collection}/points`,
      {
        method: "POST",
        token: auth.session.engineJwt,
        userId: auth.engineUserId,
        appUserId: auth.session.userId,
        body: JSON.stringify(payload)
      }
    );

    return NextResponse.json(data);
  } catch (error) {
    return handleCatRouteError(error, auth.session);
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { name: string } }) {
  const auth = await requireCatSession(request);
  if ("response" in auth) {
    return auth.response;
  }

  const collection = encodeURIComponent(params.name);
  try {
    const data = await fetchJson<Record<string, unknown>>(`/memory/collections/${collection}`, {
      method: "DELETE",
      token: auth.session.engineJwt,
      userId: auth.engineUserId,
      appUserId: auth.session.userId
    });

    return NextResponse.json(data);
  } catch (error) {
    return handleCatRouteError(error, auth.session);
  }
}
