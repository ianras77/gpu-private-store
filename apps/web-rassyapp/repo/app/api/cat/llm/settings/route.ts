import { NextResponse, type NextRequest } from "next/server";
import { fetchJson } from "@/lib/cat/client";
import { handleCatRouteError, requireCatSession } from "@/lib/cat/route";

export async function GET(request: NextRequest) {
  const auth = await requireCatSession(request);
  if ("response" in auth) {
    return auth.response;
  }

  const model = request.nextUrl.searchParams.get("model");
  const path = model ? `/llm/settings/${encodeURIComponent(model)}` : "/llm/settings";
  try {
    const data = await fetchJson<Record<string, unknown>>(path, {
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

export async function PUT(request: NextRequest) {
  const auth = await requireCatSession(request);
  if ("response" in auth) {
    return auth.response;
  }

  const model = request.nextUrl.searchParams.get("model");
  if (!model) {
    return NextResponse.json({ error: "Missing model" }, { status: 400 });
  }

  const body = await request.json();
  try {
    const data = await fetchJson<Record<string, unknown>>(
      `/llm/settings/${encodeURIComponent(model)}`,
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
