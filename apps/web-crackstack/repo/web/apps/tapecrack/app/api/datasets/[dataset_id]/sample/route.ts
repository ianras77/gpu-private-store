import { NextRequest, NextResponse } from "next/server";

const API_BASE = process.env.CRACKSTACK_API_BASE_URL ?? "http://127.0.0.1:8000";
const API_KEY = process.env.CRACKSTACK_API_KEY ?? "local-dev-key";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: { params: { dataset_id: string } }
) {
  const datasetId = context.params.dataset_id;
  const url = new URL(`${API_BASE}/datasets/${datasetId}/sample`);
  const limit = request.nextUrl.searchParams.get("limit");
  if (limit) {
    url.searchParams.set("limit", limit);
  }

  const response = await fetch(url.toString(), {
    headers: { "X-API-Key": API_KEY },
  });
  const data = await response.json();
  return NextResponse.json(data, { status: response.status });
}
