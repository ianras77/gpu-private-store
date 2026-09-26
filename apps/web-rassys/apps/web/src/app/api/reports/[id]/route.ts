import { NextResponse } from "next/server";
import { requireAdmin } from "../../../../lib/admin-auth";
import { getIndexedReport } from "../../../../lib/report-index";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin();
    const report = await getIndexedReport((await params).id, admin);
    if (!report) return NextResponse.json({ error: "not_found" }, { status: 404, headers: { "Cache-Control": "no-store" } });
    return NextResponse.json({ report }, { headers: { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex" } });
  } catch {
    return NextResponse.json({ error: "reports_unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
