import { NextResponse } from "next/server";
import { getAdminSession } from "../../../../../../lib/admin-auth";
import { moderateReportFeedback } from "../../../../../../lib/report-feedback";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const state = (await request.json().catch(() => null))?.state;
  if (state !== "accepted" && state !== "rejected") return NextResponse.json({ error: "invalid_state" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  const ok = await moderateReportFeedback((await params).id, state, admin.username);
  return ok ? NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } }) : NextResponse.json({ error: "not_found" }, { status: 404, headers: { "Cache-Control": "no-store" } });
}
