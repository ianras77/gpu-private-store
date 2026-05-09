import { NextRequest, NextResponse } from "next/server";

const API_BASE = process.env.CRACKSTACK_API_BASE_URL ?? "http://127.0.0.1:8000";
const API_KEY = process.env.CRACKSTACK_API_KEY ?? "local-dev-key";
const DEFAULT_USER_ID = process.env.CRACKSTACK_USER_ID ?? "user_demo";

export const dynamic = "force-dynamic";

function resolveUserId(request: NextRequest): string {
  return request.headers.get("x-user-id") ?? DEFAULT_USER_ID;
}

export async function GET(request: NextRequest) {
  const userId = resolveUserId(request);
  const response = await fetch(`${API_BASE}/users/me`, {
    headers: {
      "X-API-Key": API_KEY,
      "X-User-Id": userId,
    },
  });
  const data = await response.json();
  return NextResponse.json(data, { status: response.status });
}
