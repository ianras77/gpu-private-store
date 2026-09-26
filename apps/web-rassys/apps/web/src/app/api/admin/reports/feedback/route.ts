import { NextResponse } from "next/server";
import { getAdminSession } from "../../../../../lib/admin-auth";
import { listReportFeedback } from "../../../../../lib/report-feedback";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const state = new URL(request.url).searchParams.get("state");
  if (state && state !== "pending" && state !== "accepted" && state !== "rejected") return NextResponse.json({ error: "invalid_state" }, { status: 400 });
  try {
    return NextResponse.json({ feedback: await listReportFeedback(state as "pending" | "accepted" | "rejected" | null ?? undefined) }, { headers: { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex" } });
  } catch {
    return NextResponse.json({ error: "feedback_unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
