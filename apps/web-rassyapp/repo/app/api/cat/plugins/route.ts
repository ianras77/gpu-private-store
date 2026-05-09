import { NextResponse, type NextRequest } from "next/server";
import { fetchJson } from "@/lib/cat/client";
import { handleCatRouteError, requireCatSession } from "@/lib/cat/route";

export async function GET(request: NextRequest) {
  const auth = await requireCatSession(request);
  if ("response" in auth) {
    return auth.response;
  }

  try {
    const data = await fetchJson<unknown>("/plugins/", {
      method: "GET",
      token: auth.session.engineJwt,
      userId: auth.engineUserId,
      appUserId: auth.session.userId
    });

    return NextResponse.json({ plugins: data });
  } catch (error) {
    return handleCatRouteError(error, auth.session);
  }
}
