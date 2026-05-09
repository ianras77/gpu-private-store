import { NextResponse, type NextRequest } from "next/server";
import { fetchJson } from "@/lib/cat/client";
import { handleCatRouteError, requireCatSession } from "@/lib/cat/route";
import { syncCatUserPayload, syncCatUsersPayload } from "@/lib/auth/user-sync";

export async function GET(request: NextRequest) {
  const auth = await requireCatSession(request);
  if ("response" in auth) {
    return auth.response;
  }

  try {
    const data = await fetchJson<unknown>("/users/", {
      method: "GET",
      token: auth.session.engineJwt,
      userId: auth.engineUserId,
      appUserId: auth.session.userId
    });

    await syncCatUsersPayload(data);
    return NextResponse.json({ users: data });
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
    const data = await fetchJson<Record<string, unknown>>("/users/", {
      method: "POST",
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
