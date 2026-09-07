import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const payload = await request.json();
    const base = (process.env.MASTRA_URL ?? "http://bat-mastra:8090").replace(/\/$/, "");
    const response = await fetch(`${base}/v1/workflows/research`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${process.env.BAT_INTERNAL_SERVICE_TOKEN ?? "change_me"}` },
      body: JSON.stringify(payload), cache: "no-store",
    });
    return NextResponse.json(await response.json(), { status: response.status });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Research request failed" }, { status: 502 });
  }
}
