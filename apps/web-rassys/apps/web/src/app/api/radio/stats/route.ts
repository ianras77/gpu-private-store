import { NextResponse } from "next/server";
import { fetchRadio } from "../../../../lib/radio-api";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await fetchRadio("/public/stats"), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "stats_unavailable" }, { status: 503 });
  }
}
