import { NextResponse } from "next/server";
import { buildHealthReport } from "@/lib/runtipi-health";

export const dynamic = "force-dynamic";

export function GET() {
  const report = buildHealthReport(process.env);
  return NextResponse.json(report, { status: report.ok ? 200 : 503 });
}
