import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/sessions";
import { getUserForSessionToken } from "@/lib/auth/users";
import { createApproval } from "@/lib/runs";
import { z } from "zod";

const schema = z.object({ tool: z.string().trim().min(1).max(100), target: z.string().trim().min(1).max(500), argumentsHash: z.string().regex(/^[a-f0-9]{64}$/), sourceRevision: z.string().trim().min(1).max(200), expiresSeconds: z.number().int().min(30).max(86400).optional() });
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await getUserForSessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (!user) return NextResponse.json({ ok: false, error: "auth_required" }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid_request" }, { status: 400 });
  try { return NextResponse.json({ ok: true, approval: await createApproval({ ...parsed.data, runId: (await context.params).id, userId: user.id }) }, { status: 201 }); }
  catch (error) { const code = error instanceof Error ? error.message : "approval_failed"; return NextResponse.json({ ok: false, error: code }, { status: code === "run_not_found" ? 404 : 409 }); }
}
