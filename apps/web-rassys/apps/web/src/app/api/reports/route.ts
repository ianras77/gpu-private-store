import { NextResponse } from "next/server";
import { requireAdmin } from "../../../lib/admin-auth";
import { listIndexedReports } from "../../../lib/report-index";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const admin = await requireAdmin();
    const reports = await listIndexedReports(admin);
    return NextResponse.json({ reports: reports.map((report) => ({
      id: report.id, type: report.type, sha256: report.sha256,
      bytes: report.bytes, title: report.title, approvedAt: report.approvedAt,
    })) }, {
      headers: { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex" },
    });
  } catch {
    return NextResponse.json({ error: "reports_unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
