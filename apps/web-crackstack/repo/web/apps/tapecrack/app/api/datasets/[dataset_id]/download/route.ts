import { NextRequest, NextResponse } from "next/server";

const API_BASE = process.env.CRACKSTACK_API_BASE_URL ?? "http://127.0.0.1:8000";
const API_KEY = process.env.CRACKSTACK_API_KEY ?? "local-dev-key";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  context: { params: { dataset_id: string } }
) {
  const datasetId = context.params.dataset_id;
  const response = await fetch(`${API_BASE}/datasets/${datasetId}/download?format=csv`, {
    headers: { "X-API-Key": API_KEY },
  });
  const contentType = response.headers.get("content-type") ?? "text/csv; charset=utf-8";
  const contentDisposition = response.headers.get("content-disposition");

  const body = await response.arrayBuffer();
  const headers = new Headers({ "Content-Type": contentType });
  if (contentDisposition) {
    headers.set("Content-Disposition", contentDisposition);
  }
  return new NextResponse(body, {
    status: response.status,
    headers,
  });
}
