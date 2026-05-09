import { NextResponse, type NextRequest } from "next/server";
import { fetchJson } from "@/lib/cat/client";
import { handleCatRouteError, requireCatSession } from "@/lib/cat/route";

export async function POST(request: NextRequest) {
  const auth = await requireCatSession(request);
  if ("response" in auth) {
    return auth.response;
  }

  const body = await request.json();
  if (!body?.url) {
    return NextResponse.json({ error: "Missing url" }, { status: 400 });
  }

  try {
    const data = await fetchJson<Record<string, unknown>>("/rabbithole/web", {
      method: "POST",
      token: auth.session.engineJwt,
      userId: auth.engineUserId,
      appUserId: auth.session.userId,
      body: JSON.stringify(body)
    });

    return NextResponse.json(data);
  } catch (error) {
    return handleCatRouteError(error, auth.session);
  }
}
