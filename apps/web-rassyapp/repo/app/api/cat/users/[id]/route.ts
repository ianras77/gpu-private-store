import { NextResponse, type NextRequest } from "next/server";
import { fetchJson } from "@/lib/cat/client";
import { handleCatRouteError, requireCatSession } from "@/lib/cat/route";
import { deleteLocalUserByEngineId, syncCatUserPayload } from "@/lib/auth/user-sync";

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireCatSession(request);
  if ("response" in auth) {
    return auth.response;
  }

  const userId = encodeURIComponent(params.id);
  try {
    const data = await fetchJson<Record<string, unknown>>(`/users/${userId}`, {
      method: "GET",
      token: auth.session.engineJwt,
      userId: auth.engineUserId,
      appUserId: auth.session.userId
    });

    return NextResponse.json(data);
  } catch (error) {
    return handleCatRouteError(error, auth.session);
  }
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireCatSession(request);
  if ("response" in auth) {
    return auth.response;
  }

  const body = await request.json();
  const userId = encodeURIComponent(params.id);
  try {
    const data = await fetchJson<Record<string, unknown>>(`/users/${userId}`, {
      method: "PUT",
      token: auth.session.engineJwt,
      userId: auth.engineUserId,
      appUserId: auth.session.userId,
      body: JSON.stringify(body)
    });

    await syncCatUserPayload(data);
    return NextResponse.json(data);
  } catch (error) {
    return handleCatRouteError(error, auth.session);
  }
}

export async function PATCH(request: NextRequest, context: { params: { id: string } }) {
  return PUT(request, context);
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireCatSession(request);
  if ("response" in auth) {
    return auth.response;
  }

  const userId = encodeURIComponent(params.id);
  try {
    const data = await fetchJson<Record<string, unknown>>(`/users/${userId}`, {
      method: "DELETE",
      token: auth.session.engineJwt,
      userId: auth.engineUserId,
      appUserId: auth.session.userId
    });

    await deleteLocalUserByEngineId(params.id);
    return NextResponse.json(data);
  } catch (error) {
    return handleCatRouteError(error, auth.session);
  }
}
