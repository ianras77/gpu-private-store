import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireAdmin } from "../../../../../lib/admin-auth";
import { createReportFeedback, createReportReaderIdentity, parseSubmittedFeedback, readReportReaderIdentity, REPORT_FEEDBACK_COOKIE } from "../../../../../lib/report-feedback";
import { getIndexedReport } from "../../../../../lib/report-index";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const cookieOptions = { httpOnly: true, sameSite: "lax" as const, secure: (process.env.NEXT_PUBLIC_SITE_URL ?? "").startsWith("https://"), path: "/", maxAge: 60 * 60 * 24 * 180 };

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let issuedCookie: string | null = null;
  try {
    const admin = await requireAdmin();
    const report = await getIndexedReport((await params).id, admin);
    if (!report) return NextResponse.json({ error: "not_found" }, { status: 404, headers: { "Cache-Control": "no-store" } });
    const body = parseSubmittedFeedback(await request.json());
    if (!body) return NextResponse.json({ error: "invalid_feedback" }, { status: 400, headers: { "Cache-Control": "no-store" } });
    const store = await cookies();
    let readerId = readReportReaderIdentity(store.get(REPORT_FEEDBACK_COOKIE)?.value);
    if (!readerId) {
      const created = createReportReaderIdentity();
      readerId = created.id;
      issuedCookie = created.cookie;
    }
    const result = await createReportFeedback(report, readerId, body);
    const response = result.ok
      ? NextResponse.json({ ok: true, id: result.id }, { status: 201, headers: { "Cache-Control": "no-store" } })
      : NextResponse.json({ error: result.reason }, { status: result.reason === "rate_limited" ? 429 : 422, headers: { "Cache-Control": "no-store" } });
    if (issuedCookie) response.cookies.set(REPORT_FEEDBACK_COOKIE, issuedCookie, cookieOptions);
    return response;
  } catch {
    const response = NextResponse.json({ error: "feedback_unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
    if (issuedCookie) response.cookies.set(REPORT_FEEDBACK_COOKIE, issuedCookie, cookieOptions);
    return response;
  }
}
