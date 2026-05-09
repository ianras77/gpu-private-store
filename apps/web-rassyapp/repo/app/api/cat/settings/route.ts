import { NextResponse, type NextRequest } from "next/server";
import { fetchJson } from "@/lib/cat/client";
import { handleCatRouteError, requireCatSession } from "@/lib/cat/route";

export async function GET(request: NextRequest) {
  const auth = await requireCatSession(request);
  if ("response" in auth) {
    return auth.response;
  }

  try {
    const data = await fetchJson<Record<string, unknown>>("/settings/", {
      method: "GET",
      token: auth.session.engineJwt,
      userId: auth.engineUserId,
      appUserId: auth.session.userId
    });

    return NextResponse.json({ settings: data });
  } catch (error) {
    return handleCatRouteError(error, auth.session);
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireCatSession(request);
  if ("response" in auth) {
    return auth.response;
  }

  const body = await request.json();
  try {
    const data = await fetchJson<Record<string, unknown>>("/settings/", {
      method: "POST",
      token: auth.session.engineJwt,
      userId: auth.engineUserId,
      appUserId: auth.session.userId,
      body: JSON.stringify(body)
    });

    return NextResponse.json({ settings: data });
  } catch (error) {
    return handleCatRouteError(error, auth.session);
  }
}

export async function PUT(request: NextRequest) {
  const auth = await requireCatSession(request);
  if ("response" in auth) {
    return auth.response;
  }

  const body = await request.json();
  const settingId = body?.name;
  if (!settingId) {
    return NextResponse.json({ error: "Missing setting name" }, { status: 400 });
  }

  try {
    const data = await fetchJson<Record<string, unknown>>(
      `/settings/${encodeURIComponent(settingId)}`,
      {
        method: "PUT",
        token: auth.session.engineJwt,
        userId: auth.engineUserId,
        appUserId: auth.session.userId,
        body: JSON.stringify(body)
      }
    );

    return NextResponse.json({ settings: data });
  } catch (error) {
    return handleCatRouteError(error, auth.session);
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireCatSession(request);
  if ("response" in auth) {
    return auth.response;
  }

  const settingId = request.nextUrl.searchParams.get("name");
  if (!settingId) {
    return NextResponse.json({ error: "Missing setting name" }, { status: 400 });
  }

  try {
    const data = await fetchJson<Record<string, unknown>>(
      `/settings/${encodeURIComponent(settingId)}`,
      {
        method: "DELETE",
        token: auth.session.engineJwt,
        userId: auth.engineUserId,
        appUserId: auth.session.userId
      }
    );

    return NextResponse.json({ settings: data });
  } catch (error) {
    return handleCatRouteError(error, auth.session);
  }
}
