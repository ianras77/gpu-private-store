import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/sessions";
import { getUserForSessionToken } from "@/lib/auth/users";
import { consumeApproval } from "@/lib/runs";
import { z } from "zod";

const schema = z.object({ argumentsHash: z.string().regex(/^[a-f0-9]{64}$/), sourceRevision: z.string().trim().min(1).max(200) });
export async function POST(request: NextRequest, context: { params: Promise<{ id: string; approvalId: string }> }) {
  const user = await getUserForSessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (!user) return NextResponse.json({ ok: false, error: "auth_required" }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid_request" }, { status: 400 });
  try {
    const params = await context.params;
    const approval = await consumeApproval(params.approvalId, user.id, parsed.data.argumentsHash, parsed.data.sourceRevision);
    if (approval.runId !== params.id) return NextResponse.json({ ok: false, error: "approval_run_mismatch" }, { status: 409 });
    return NextResponse.json({ ok: true, approval }, { headers: { "cache-control": "no-store" } });
  } catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "approval_failed" }, { status: 409 }); }
}
