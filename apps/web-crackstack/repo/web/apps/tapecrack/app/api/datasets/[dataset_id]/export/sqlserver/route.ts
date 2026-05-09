import { NextRequest, NextResponse } from "next/server";

const API_BASE = process.env.CRACKSTACK_API_BASE_URL ?? "http://127.0.0.1:8000";
const API_KEY = process.env.CRACKSTACK_API_KEY ?? "local-dev-key";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  context: { params: { dataset_id: string } }
) {
  const datasetId = context.params.dataset_id;
  const body = await request.json();
  const response = await fetch(`${API_BASE}/datasets/${datasetId}/export/sqlserver`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": API_KEY,
    },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  return NextResponse.json(data, { status: response.status });
}
