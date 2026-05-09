import { NextRequest, NextResponse } from "next/server";

const API_BASE = process.env.CRACKSTACK_API_BASE_URL ?? "http://127.0.0.1:8000";
const API_KEY = process.env.CRACKSTACK_API_KEY ?? "local-dev-key";
const DEFAULT_USER_ID = process.env.CRACKSTACK_USER_ID ?? "user_demo";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const userId = request.headers.get("x-user-id") ?? DEFAULT_USER_ID;
  const threadId = body.thread_id;
  if (!threadId) {
    return NextResponse.json({ detail: "thread_id required" }, { status: 400 });
  }

  const response = await fetch(`${API_BASE}/agent/threads/${threadId}/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": API_KEY,
      "X-User-Id": userId,
    },
    body: JSON.stringify({
      message: body.message,
      dataset_id: body.dataset_id,
    }),
  });

  const data = await response.json();
  return NextResponse.json(data, { status: response.status });
}
