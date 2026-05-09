import { NextRequest, NextResponse } from "next/server";

const API_BASE = process.env.CRACKSTACK_API_BASE_URL ?? "http://127.0.0.1:8000";
const API_KEY = process.env.CRACKSTACK_API_KEY ?? "local-dev-key";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const file = formData.get("file");

  if (!file || typeof file === "string") {
    return NextResponse.json({ detail: "file is required" }, { status: 400 });
  }

  const outgoing = new FormData();
  const filename = typeof (file as { name?: unknown }).name === "string"
    ? ((file as { name?: string }).name as string)
    : "upload.bin";
  outgoing.append("file", file, filename);
  const name = formData.get("name");
  const description = formData.get("description");
  if (typeof name === "string" && name.length > 0) {
    outgoing.append("name", name);
  }
  if (typeof description === "string" && description.length > 0) {
    outgoing.append("description", description);
  }

  const response = await fetch(`${API_BASE}/datasets/upload`, {
    method: "POST",
    headers: {
      "X-API-Key": API_KEY,
    },
    body: outgoing,
  });

  const data = await response.json();
  return NextResponse.json(data, { status: response.status });
}
