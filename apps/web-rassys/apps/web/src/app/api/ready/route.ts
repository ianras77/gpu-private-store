import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) return NextResponse.json({ ok: false, checks: { database: "not_configured" } }, { status: 503 });
    return NextResponse.json({ ok: true, checks: { web: "ready", database: "configured" } });
  } catch { return NextResponse.json({ ok: false }, { status: 503 }); }
}
