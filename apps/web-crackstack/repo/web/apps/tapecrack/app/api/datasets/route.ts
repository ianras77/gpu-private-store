import { NextResponse } from "next/server";

const API_BASE = process.env.CRACKSTACK_API_BASE_URL ?? "http://127.0.0.1:8000";
const API_KEY = process.env.CRACKSTACK_API_KEY ?? "local-dev-key";

export const dynamic = "force-dynamic";

export async function GET() {
  const response = await fetch(`${API_BASE}/datasets`, {
    headers: { "X-API-Key": API_KEY },
  });
  const data = await response.json();
  return NextResponse.json(data, { status: response.status });
}
